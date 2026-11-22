/**
 * GDPR: data portability (organization / client exports), erasure (client anonymization or deletion,
 * account deletion), retention periods (automatic purge, off by default).
 */
import { randomBytes } from "node:crypto";
import { storage } from "@/server/adapters/storage";
import type { ServiceContext } from "@/server/auth/context";
import { verifyPassword } from "@/server/auth/password";
import { invalidateUserSessions } from "@/server/auth/session";
import { db } from "@/server/db";
import { AppError, ValidationError } from "@/server/errors";
import { logger } from "@/server/logger";
import { assertCan } from "@/server/permissions/can";
import { loadClientFor } from "./access";
import { audit } from "./audit";
import { zipStream } from "./exports";

const json = (value: unknown) =>
  JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
const safe = (name: string) => name.replace(/[^\p{L}\p{N}._ -]+/gu, "_").slice(0, 100);

/** Complete export of the organization (JSON of every table + all files). Owner only. */
export async function exportOrganization(ctx: ServiceContext) {
  assertCan(ctx.actor, "data.export", { organizationId: ctx.organizationId });
  const where = { organizationId: ctx.organizationId };
  const [
    organization,
    memberships,
    clients,
    sites,
    steps,
    assignments,
    tasks,
    media,
    documents,
    notes,
    summaries,
    links,
    events,
    notifications,
    auditLogs,
    messages,
    templates,
  ] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, include: { subscription: true } }),
    db.membership.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true, createdAt: true, lastLoginAt: true },
        },
      },
    }),
    db.client.findMany({ where }),
    db.site.findMany({ where, include: { members: true } }),
    db.siteStep.findMany({ where }),
    db.assignment.findMany({ where }),
    db.task.findMany({ where }),
    db.media.findMany({ where }),
    db.document.findMany({ where }),
    db.note.findMany({ where }),
    db.dailySummary.findMany({ where }),
    db.clientPortalLink.findMany({ where, omit: { tokenHash: true, tokenCiphertext: true } }),
    db.siteEvent.findMany({ where }),
    db.notification.findMany({ where }),
    db.auditLog.findMany({ where }),
    db.messageLog.findMany({ where }),
    db.stepTemplate.findMany({ where, include: { items: true } }),
  ]);
  const data = {
    exportedAt: new Date().toISOString(),
    organization,
    members: memberships,
    clients,
    sites,
    steps,
    assignments,
    tasks,
    media,
    documents: documents.map(({ ocrText: _o, ...d }) => d),
    notes,
    dailySummaries: summaries,
    clientPortalLinks: links,
    siteEvents: events,
    notifications,
    auditLogs,
    messages,
    stepTemplates: templates,
  };
  await audit({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    action: "data.export",
    entityType: "organization",
    entityId: ctx.organizationId,
    ip: ctx.ip,
  });
  return {
    fileName: `export-${organization.slug}-${new Date().toISOString().slice(0, 10)}.zip`,
    stream: zipStream([
      {
        name: "LISEZ-MOI.txt",
        content: "Export complet ChantierLink : donnees.json (toutes les tables) et fichiers originaux.\n",
      },
      { name: "donnees.json", content: json(data) },
      ...documents.map((d) => ({
        name: `fichiers/documents/${d.id}-${safe(d.originalName)}`,
        key: d.storageKey,
      })),
      ...media.map((m) => ({
        name: `fichiers/medias/${m.id}${/\.[a-z0-9]+$/i.exec(m.storageKey)?.[0] ?? ""}`,
        key: m.storageKey,
      })),
    ]),
  };
}

/** Everything about one client (right of access / portability). */
export async function exportClient(ctx: ServiceContext, clientId: string) {
  const client = await loadClientFor(ctx, clientId, "client.view");
  const [sites, documents, links] = await Promise.all([
    db.site.findMany({
      where: { clientId, organizationId: ctx.organizationId },
      include: {
        steps: true,
        dailySummaries: { where: { status: { in: ["APPROVED", "SENT"] } } },
        notes: { where: { internal: false } },
      },
    }),
    db.document.findMany({ where: { clientId, organizationId: ctx.organizationId } }),
    db.clientPortalLink.findMany({
      where: { site: { clientId }, organizationId: ctx.organizationId },
      omit: { tokenHash: true, tokenCiphertext: true },
    }),
  ]);
  await audit({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    action: "client.export",
    entityType: "client",
    entityId: clientId,
    ip: ctx.ip,
  });
  return {
    fileName: `donnees-client-${safe(client.name)}.zip`,
    stream: zipStream([
      {
        name: "client.json",
        content: json({
          exportedAt: new Date().toISOString(),
          client,
          sites,
          documents: documents.map(({ ocrText: _o, ...d }) => d),
          portalLinks: links,
        }),
      },
      ...documents.map((d) => ({ name: `documents/${safe(d.originalName)}`, key: d.storageKey })),
    ]),
  };
}

/**
 * Anonymization: contact data erased, sites and accounting documents kept (legal retention: invoices 10 years,
 * ten-year liability). Client portal links are revoked.
 */
export async function anonymizeClient(ctx: ServiceContext, clientId: string) {
  const client = await loadClientFor(ctx, clientId, "client.update");
  if (client.anonymizedAt) return;
  const label = `Client anonymisé ${randomBytes(2).toString("hex").toUpperCase()}`;
  await db.$transaction(async (tx) => {
    await tx.client.update({
      where: { id: clientId },
      data: {
        name: label,
        companyName: null,
        emails: [],
        phones: [],
        addresses: [],
        notes: null,
        tags: [],
        consentCommunications: false,
        anonymizedAt: new Date(),
        archivedAt: client.archivedAt ?? new Date(),
      },
    });
    await tx.whatsAppContact.deleteMany({ where: { clientId } });
    await tx.clientPortalLink.updateMany({
      where: { site: { clientId }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await audit(
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "client.anonymize",
        entityType: "client",
        entityId: clientId,
        ip: ctx.ip,
      },
      tx,
    );
  });
}

/** Full erasure of a client and of everything attached (sites, documents, photos, files). */
export async function deleteClientCompletely(ctx: ServiceContext, clientId: string, confirmation: string) {
  const client = await loadClientFor(ctx, clientId, "client.update");
  if (confirmation.trim().toUpperCase() !== "SUPPRIMER")
    throw new ValidationError("Tapez SUPPRIMER pour confirmer.");
  const [docs, media] = await Promise.all([
    db.document.findMany({
      where: { organizationId: ctx.organizationId, OR: [{ clientId }, { site: { clientId } }] },
      select: { storageKey: true },
    }),
    db.media.findMany({
      where: { organizationId: ctx.organizationId, site: { clientId } },
      select: { storageKey: true },
    }),
  ]);
  await db.$transaction(async (tx) => {
    await tx.document.deleteMany({
      where: { organizationId: ctx.organizationId, OR: [{ clientId }, { site: { clientId } }] },
    });
    await tx.media.deleteMany({ where: { organizationId: ctx.organizationId, site: { clientId } } });
    await tx.site.deleteMany({ where: { clientId, organizationId: ctx.organizationId } });
    await tx.client.delete({ where: { id: clientId } });
    await audit(
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "client.delete",
        entityType: "client",
        entityId: clientId,
        before: { name: client.name },
        ip: ctx.ip,
      },
      tx,
    );
  });
  for (const key of [...docs.map((d) => d.storageKey), ...media.map((m) => m.storageKey)]) {
    const prefix = key.includes("/media/") ? key.slice(0, key.lastIndexOf("/") + 1) : null;
    await (prefix ? storage().deletePrefix(prefix) : storage().delete(key)).catch(() => {});
  }
}

/** Deletion of the whole account (organization, data, files). Strong confirmation: name + password. */
export async function deleteOrganization(
  ctx: ServiceContext,
  input: { organizationName: string; password: string },
) {
  assertCan(ctx.actor, "organization.delete", { organizationId: ctx.organizationId });
  const [org, user] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } }),
    db.user.findUniqueOrThrow({ where: { id: ctx.userId } }),
  ]);
  if (input.organizationName.trim() !== org.name)
    throw new ValidationError("Le nom de l'entreprise ne correspond pas.");
  if (!(await verifyPassword(user.passwordHash, input.password)))
    throw new ValidationError("Mot de passe incorrect.");
  const members = await db.membership.findMany({
    where: { organizationId: org.id },
    select: { userId: true },
  });
  await storage()
    .deletePrefix(`org/${org.id}/`)
    .catch((error) => logger.error({ err: error }, "Suppression des fichiers incomplète"));
  await db.organization.delete({ where: { id: org.id } });
  // Users who no longer belong to any organization are deleted too.
  for (const { userId } of members) {
    const remaining = await db.membership.count({ where: { userId } });
    if (remaining === 0) {
      await invalidateUserSessions(userId);
      await db.user.delete({ where: { id: userId } }).catch(() => {});
    }
  }
  logger.info({ organizationId: org.id }, "Compte supprimé à la demande du propriétaire");
}

export async function updateRetention(
  ctx: ServiceContext,
  input: { retentionDocumentsYears: number; retentionMediaYears: number; retentionPurgeEnabled: boolean },
) {
  assertCan(ctx.actor, "organization.manage", { organizationId: ctx.organizationId });
  if (input.retentionDocumentsYears < 10) {
    throw new AppError("Les factures et documents comptables doivent être conservés au moins 10 ans.");
  }
  await db.organization.update({ where: { id: ctx.organizationId }, data: input });
  await audit({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    action: "settings.retention",
    entityType: "organization",
    entityId: ctx.organizationId,
    after: input,
    ip: ctx.ip,
  });
}

/** Daily job: deletes media and documents older than the retention period (organizations that enabled it). */
export async function runRetentionPurge(now = new Date()) {
  const orgs = await db.organization.findMany({
    where: { retentionPurgeEnabled: true },
    select: { id: true, retentionDocumentsYears: true, retentionMediaYears: true },
  });
  let mediaCount = 0;
  let documentCount = 0;
  for (const org of orgs) {
    const mediaLimit = new Date(now);
    mediaLimit.setUTCFullYear(mediaLimit.getUTCFullYear() - org.retentionMediaYears);
    const docLimit = new Date(now);
    docLimit.setUTCFullYear(docLimit.getUTCFullYear() - org.retentionDocumentsYears);
    const [oldMedia, oldDocs] = await Promise.all([
      db.media.findMany({
        where: { organizationId: org.id, receivedAt: { lt: mediaLimit } },
        select: { id: true, storageKey: true },
      }),
      db.document.findMany({
        where: {
          organizationId: org.id,
          OR: [{ documentDate: { lt: docLimit } }, { documentDate: null, createdAt: { lt: docLimit } }],
        },
        select: { id: true, storageKey: true },
      }),
    ]);
    if (!oldMedia.length && !oldDocs.length) continue;
    await db.media.deleteMany({ where: { id: { in: oldMedia.map((m) => m.id) } } });
    await db.document.deleteMany({ where: { id: { in: oldDocs.map((d) => d.id) } } });
    for (const m of oldMedia)
      await storage()
        .deletePrefix(m.storageKey.slice(0, m.storageKey.lastIndexOf("/") + 1))
        .catch(() => {});
    for (const d of oldDocs)
      await storage()
        .delete(d.storageKey)
        .catch(() => {});
    mediaCount += oldMedia.length;
    documentCount += oldDocs.length;
    await audit({
      organizationId: org.id,
      actorId: null,
      action: "retention.purge",
      entityType: "organization",
      entityId: org.id,
      after: { media: oldMedia.length, documents: oldDocs.length },
    });
  }
  return { media: mediaCount, documents: documentCount };
}
