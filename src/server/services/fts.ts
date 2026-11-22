/**
 * PostgreSQL full-text search helpers. The `searchVector` columns are maintained by triggers
 * (config `simple` + unaccent, see the init migration). Queries are prefix queries so results appear while typing.
 */
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

/** "Dupont toit" → "dupont:* & toit:*" (only letters/digits kept, so the query cannot be malformed). */
export function toPrefixTsQuery(input: string): string | null {
  const tokens = input
    .toLowerCase()
    .normalize("NFC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0)
    .slice(0, 8);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `${t}:*`).join(" & ");
}

const TABLES = { client: "Client", site: "Site", document: "Document" } as const;
export type SearchableTable = keyof typeof TABLES;

/** Ids of matching rows of an organization, best match first. */
export async function ftsIds(
  table: SearchableTable,
  organizationId: string,
  query: string,
  limit = 50,
): Promise<string[]> {
  const tsquery = toPrefixTsQuery(query);
  if (!tsquery) return [];
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM ${Prisma.raw(`"${TABLES[table]}"`)}
    WHERE "organizationId" = ${organizationId}
      AND "searchVector" @@ to_tsquery('simple', immutable_unaccent(${tsquery}))
    ORDER BY ts_rank("searchVector", to_tsquery('simple', immutable_unaccent(${tsquery}))) DESC
    LIMIT ${limit}
  `);
  return rows.map((r) => r.id);
}

/** Keeps the FTS ranking order on rows loaded with `id IN (...)`. */
export function sortByIds<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const rank = new Map(ids.map((id, i) => [id, i]));
  return [...rows].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
}
