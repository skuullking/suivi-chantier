/** Global search (Ctrl/Cmd+K): clients, sites and documents of the caller's organization. */
import { DOCUMENT_TYPE_LABELS, SITE_STATUS_LABELS } from "@/lib/labels";
import type { ServiceContext } from "@/server/auth/context";
import { db } from "@/server/db";
import { can } from "@/server/permissions/can";
import { ftsIds, sortByIds } from "./fts";

export type SearchResult = {
  kind: "client" | "site" | "document";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export async function globalSearch(ctx: ServiceContext, query: string): Promise<SearchResult[]> {
  const q = query.trim().slice(0, 100);
  if (!q) return [];
  const manager = ctx.actor.role !== "WORKER";
  const results: SearchResult[] = [];

  const siteIds = await ftsIds("site", ctx.organizationId, q, 8);
  const sites = sortByIds(
    await db.site.findMany({
      where: {
        id: { in: siteIds },
        organizationId: ctx.organizationId,
        ...(manager ? {} : { members: { some: { userId: ctx.userId } } }),
      },
      include: { client: { select: { name: true } } },
    }),
    siteIds,
  );
  for (const s of sites) {
    results.push({
      kind: "site",
      id: s.id,
      title: `${s.title} (${s.code})`,
      subtitle: `${s.client.name} · ${SITE_STATUS_LABELS[s.status]}${s.city ? ` · ${s.city}` : ""}`,
      href: manager ? `/app/chantiers/${s.id}` : `/w/chantier/${s.id}`,
    });
  }

  if (can(ctx.actor, "client.view", { organizationId: ctx.organizationId })) {
    const clientIds = await ftsIds("client", ctx.organizationId, q, 6);
    const clients = sortByIds(
      await db.client.findMany({
        where: { id: { in: clientIds }, organizationId: ctx.organizationId, anonymizedAt: null },
      }),
      clientIds,
    );
    for (const c of clients) {
      results.push({
        kind: "client",
        id: c.id,
        title: c.companyName ? `${c.name} — ${c.companyName}` : c.name,
        subtitle: [c.phones[0], c.emails[0], c.archivedAt ? "archivé" : null].filter(Boolean).join(" · "),
        href: `/app/clients/${c.id}`,
      });
    }
  }

  if (can(ctx.actor, "document.update", { organizationId: ctx.organizationId })) {
    const docIds = await ftsIds("document", ctx.organizationId, q, 8);
    const docs = sortByIds(
      await db.document.findMany({
        where: { id: { in: docIds }, organizationId: ctx.organizationId },
        include: { site: { select: { title: true } }, client: { select: { name: true } } },
      }),
      docIds,
    );
    for (const d of docs) {
      results.push({
        kind: "document",
        id: d.id,
        title: d.name,
        subtitle: [DOCUMENT_TYPE_LABELS[d.type], d.supplier, d.site?.title ?? d.client?.name]
          .filter(Boolean)
          .join(" · "),
        href: `/app/documents?doc=${d.id}`,
      });
    }
  }
  return results;
}
