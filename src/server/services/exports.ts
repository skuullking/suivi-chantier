/** CSV exports (clients, sites, documents) and ZIP exports (one site, a selection of documents). */
import type { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { formatDateTime } from "@/lib/format";
import {
  CLIENT_TYPE_LABELS,
  DOCUMENT_TYPE_LABELS,
  SITE_STATUS_LABELS,
  STEP_STATUS_LABELS,
  VALIDATION_LABELS,
} from "@/lib/labels";
import { sanitizeFilename } from "@/server/security/file-validation";
import { storage } from "@/server/adapters/storage";
import type { ServiceContext } from "@/server/auth/context";
import { db } from "@/server/db";
import { toCsv } from "@/server/domain/csv";
import { logger } from "@/server/logger";
import { assertCan } from "@/server/permissions/can";
import { loadSiteFor } from "./access";
import { audit } from "./audit";
import { type DocumentFilters, listDocuments } from "./documents";

export async function clientsCsv(ctx: ServiceContext) {
  assertCan(ctx.actor, "client.view", { organizationId: ctx.organizationId });
  const clients = await db.client.findMany({
    where: { organizationId: ctx.organizationId, anonymizedAt: null },
    include: { _count: { select: { sites: true } } },
    orderBy: { name: "asc" },
  });
  return toCsv(
    [
      "Nom",
      "Société",
      "Type",
      "E-mails",
      "Téléphones",
      "Adresses",
      "Étiquettes",
      "Accord communications",
      "Chantiers",
      "Archivé",
      "Créé le",
      "Notes",
    ],
    clients.map((c) => [
      c.name,
      c.companyName,
      CLIENT_TYPE_LABELS[c.type],
      c.emails.join(", "),
      c.phones.join(", "),
      c.addresses.join(" / "),
      c.tags.join(", "),
      c.consentCommunications,
      c._count.sites,
      c.archivedAt ? "oui" : "non",
      c.createdAt,
      c.notes,
    ]),
  );
}

export async function sitesCsv(ctx: ServiceContext) {
  assertCan(ctx.actor, "site.update", { organizationId: ctx.organizationId });
  const sites = await db.site.findMany({
    where: { organizationId: ctx.organizationId },
    include: {
      client: { select: { name: true } },
      members: { include: { user: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  return toCsv(
    [
      "Code",
      "Titre",
      "Client",
      "Statut",
      "Adresse",
      "Code postal",
      "Ville",
      "Début prévu",
      "Fin prévue",
      "Début réel",
      "Fin réelle",
      "Progression (%)",
      "Équipe",
    ],
    sites.map((s) => [
      s.code,
      s.title,
      s.client.name,
      SITE_STATUS_LABELS[s.status],
      s.address,
      s.postalCode,
      s.city,
      s.plannedStart,
      s.plannedEnd,
      s.actualStart,
      s.actualEnd,
      s.progress,
      s.members.map((m) => m.user.name).join(", "),
    ]),
  );
}

export async function documentsCsv(ctx: ServiceContext, filters: DocumentFilters) {
  const documents = await listDocuments(ctx, { ...filters, limit: 10_000 });
  return toCsv(
    [
      "Nom",
      "Type",
      "Date",
      "Montant TTC (€)",
      "Fournisseur / émetteur",
      "Chantier",
      "Client",
      "Visible client",
      "Source",
      "Fichier",
      "Ajouté le",
    ],
    documents.map((d) => [
      d.name,
      DOCUMENT_TYPE_LABELS[d.type],
      d.documentDate,
      d.amountCents != null ? (d.amountCents / 100).toFixed(2).replace(".", ",") : null,
      d.supplier,
      d.site ? `${d.site.title} (${d.site.code})` : null,
      d.client?.name,
      d.visibleToClient,
      d.source,
      d.originalName,
      d.createdAt,
    ]),
  );
}

type ZipEntry = { name: string; key?: string; content?: string | Buffer };

/** Streams a ZIP archive built from storage objects (never loads all files in memory). */
export function zipStream(entries: ZipEntry[]): Readable {
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const used = new Set<string>();
  const unique = (name: string) => {
    let candidate = name;
    for (let i = 2; used.has(candidate); i++) candidate = name.replace(/(\.[^./]+)?$/, `-${i}$1`);
    used.add(candidate);
    return candidate;
  };
  void (async () => {
    try {
      for (const entry of entries) {
        if (entry.content !== undefined) {
          archive.append(entry.content, { name: unique(entry.name) });
        } else if (entry.key) {
          const object = await storage()
            .getStream(entry.key)
            .catch(() => null);
          if (object) archive.append(object.stream, { name: unique(entry.name) });
        }
      }
      await archive.finalize();
    } catch (error) {
      logger.error({ err: error }, "Création du ZIP impossible");
      archive.abort();
    }
  })();
  return archive;
}

function extOf(key: string) {
  const m = /\.([a-z0-9]+)$/i.exec(key);
  return m ? `.${m[1]!.toLowerCase()}` : "";
}

const folder = (s: string) => sanitizeFilename(s, "sans-etape").replace(/[/\\]/g, "-").slice(0, 60);

/** Complete export of a site: documents (originals), photos by step, journal and steps. */
export async function siteZip(ctx: ServiceContext, siteId: string) {
  const { site } = await loadSiteFor(ctx, siteId, "site.update");
  const full = await db.site.findUniqueOrThrow({
    where: { id: site.id },
    include: {
      client: true,
      steps: { orderBy: { order: "asc" } },
      documents: true,
      media: { include: { step: { select: { title: true, order: true } } }, orderBy: { receivedAt: "asc" } },
      notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      dailySummaries: { orderBy: { date: "asc" } },
    },
  });
  const entries: ZipEntry[] = [];
  for (const d of full.documents) {
    entries.push({
      name: `documents/${DOCUMENT_TYPE_LABELS[d.type]}/${sanitizeFilename(d.originalName)}`,
      key: d.storageKey,
    });
  }
  for (const m of full.media) {
    const when = (m.capturedAt ?? m.receivedAt).toISOString().replace(/[:T]/g, "-").slice(0, 16);
    const dir =
      m.kind === "PHOTO"
        ? `photos/${m.step ? `${String(m.step.order).padStart(2, "0")} ${folder(m.step.title)}` : "sans-etape"}`
        : "vocaux";
    entries.push({
      name: `${dir}/${when}${m.validationStatus === "REJECTED" ? "-refusee" : ""}${extOf(m.storageKey)}`,
      key: m.storageKey,
    });
  }
  entries.push({
    name: "etapes.csv",
    content: toCsv(
      ["Ordre", "Étape", "Statut", "Poids", "Début prévu", "Fin prévue", "Terminée le", "Visible client"],
      full.steps.map((s) => [
        s.order,
        s.title,
        STEP_STATUS_LABELS[s.status],
        s.weight,
        s.plannedStart,
        s.plannedEnd,
        s.completedAt,
        s.visibleToClient,
      ]),
    ),
  });
  entries.push({
    name: "photos.csv",
    content: toCsv(
      ["Fichier", "Étape", "Légende", "Prise le", "Reçue le", "Statut", "Latitude", "Longitude"],
      full.media
        .filter((m) => m.kind === "PHOTO")
        .map((m) => [
          m.originalName,
          m.step?.title,
          m.caption,
          m.capturedAt,
          m.receivedAt,
          VALIDATION_LABELS[m.validationStatus],
          m.latitude,
          m.longitude,
        ]),
    ),
  });
  const journal = [
    `Chantier : ${full.title} (${full.code})`,
    `Client : ${full.client.name}`,
    `Adresse : ${full.address} ${full.postalCode ?? ""} ${full.city ?? ""}`,
    "",
    "== Résumés du jour ==",
    ...full.dailySummaries.map(
      (s) => `[${s.date.toISOString().slice(0, 10)}] ${s.editedText ?? s.generatedText}`,
    ),
    "",
    "== Notes ==",
    ...full.notes.map(
      (n) =>
        `[${formatDateTime(n.createdAt)}] ${n.author?.name ?? "—"} (${n.kind}${n.internal ? ", interne" : ""}) : ${n.text}`,
    ),
  ].join("\n");
  entries.push({ name: "journal.txt", content: journal });
  await audit({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    action: "site.export",
    entityType: "site",
    entityId: site.id,
    ip: ctx.ip,
  });
  return { fileName: `${full.code}-${folder(full.title)}.zip`, stream: zipStream(entries) };
}

export async function documentsZip(ctx: ServiceContext, filters: DocumentFilters) {
  const documents = await listDocuments(ctx, { ...filters, limit: 2000 });
  const entries: ZipEntry[] = documents.map((d) => ({
    name: `${DOCUMENT_TYPE_LABELS[d.type]}/${d.site ? `${folder(d.site.title)}/` : ""}${sanitizeFilename(d.originalName)}`,
    key: d.storageKey,
  }));
  entries.push({ name: "documents.csv", content: await documentsCsv(ctx, filters) });
  await audit({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    action: "documents.export",
    entityType: "document",
    after: { count: documents.length },
    ip: ctx.ip,
  });
  return { fileName: `documents-${new Date().toISOString().slice(0, 10)}.zip`, stream: zipStream(entries) };
}
