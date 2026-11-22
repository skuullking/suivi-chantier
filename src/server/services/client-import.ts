/** Client CSV import (rows already parsed by the browser, mapping chosen by the user). */
import { clientSchema } from "@/lib/validation/business";
import { normalizeText } from "@/lib/slug";
import type { ServiceContext } from "@/server/auth/context";
import { db } from "@/server/db";
import { mapClientRow, type ClientMapping } from "@/server/domain/csv-mapping";
import { ValidationError } from "@/server/errors";
import { assertCan } from "@/server/permissions/can";
import { audit } from "./audit";

export const MAX_IMPORT_ROWS = 2000;

export async function importClients(
  ctx: ServiceContext,
  rows: Record<string, string>[],
  mapping: ClientMapping,
) {
  assertCan(ctx.actor, "client.create", { organizationId: ctx.organizationId });
  if (!mapping.name && !mapping.companyName)
    throw new ValidationError("Indiquez la colonne du nom du client.");
  if (rows.length > MAX_IMPORT_ROWS)
    throw new ValidationError(`${MAX_IMPORT_ROWS} lignes maximum par import.`);

  const existing = await db.client.findMany({
    where: { organizationId: ctx.organizationId, anonymizedAt: null },
    select: { name: true, emails: true, phones: true },
  });
  const emails = new Set(existing.flatMap((c) => c.emails.map((e) => e.toLowerCase())));
  const namePhones = new Set(
    existing.flatMap((c) => c.phones.map((p) => `${normalizeText(c.name)}|${p.replace(/\D/g, "")}`)),
  );
  const names = new Set(existing.map((c) => normalizeText(c.name)));

  let created = 0;
  let skipped = 0;
  const errors: { line: number; message: string }[] = [];
  const toCreate: ReturnType<typeof clientSchema.parse>[] = [];

  rows.forEach((row, index) => {
    const line = index + 2; // header = line 1
    const mapped = mapClientRow(row, mapping);
    if (!mapped.name && !mapped.emails && !mapped.phones) {
      skipped++;
      return;
    }
    const parsed = clientSchema.safeParse(mapped);
    if (!parsed.success) {
      errors.push({ line, message: parsed.error.issues[0]?.message ?? "Ligne invalide" });
      return;
    }
    const c = parsed.data;
    const key = normalizeText(c.name);
    const duplicate =
      c.emails.some((e) => emails.has(e.toLowerCase())) ||
      c.phones.some((p) => namePhones.has(`${key}|${p.replace(/\D/g, "")}`)) ||
      (c.emails.length === 0 && c.phones.length === 0 && names.has(key));
    if (duplicate) {
      skipped++;
      return;
    }
    c.emails.forEach((e) => emails.add(e.toLowerCase()));
    c.phones.forEach((p) => namePhones.add(`${key}|${p.replace(/\D/g, "")}`));
    names.add(key);
    toCreate.push(c);
  });

  for (let i = 0; i < toCreate.length; i += 200) {
    const batch = toCreate.slice(i, i + 200);
    const result = await db.client.createMany({
      data: batch.map((c) => ({
        organizationId: ctx.organizationId,
        type: c.type,
        name: c.name,
        companyName: c.companyName ?? null,
        emails: c.emails.map((e) => e.toLowerCase()),
        phones: c.phones,
        addresses: c.addresses,
        tags: c.tags,
        notes: c.notes ?? null,
        consentCommunications: false,
      })),
    });
    created += result.count;
  }
  await audit({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    action: "client.import",
    entityType: "client",
    after: { created, skipped, errors: errors.length },
    ip: ctx.ip,
  });
  return { created, skipped, errors: errors.slice(0, 50), errorCount: errors.length };
}
