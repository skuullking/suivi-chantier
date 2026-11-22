import type { z } from "zod";
import type { organizationSettingsSchema, validationSettingsSchema } from "@/lib/validation/business";
import type { ServiceContext } from "@/server/auth/context";
import { db } from "@/server/db";
import { assertCan } from "@/server/permissions/can";
import { audit } from "./audit";

export async function getOrganization(ctx: ServiceContext) {
  return db.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
}

export async function updateOrganization(
  ctx: ServiceContext,
  input: z.output<typeof organizationSettingsSchema>,
) {
  assertCan(ctx.actor, "organization.manage", { organizationId: ctx.organizationId });
  await db.organization.update({
    where: { id: ctx.organizationId },
    data: {
      name: input.name,
      trade: input.trade,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      timezone: input.timezone,
    },
  });
  await audit({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    action: "organization.update",
    entityType: "organization",
    entityId: ctx.organizationId,
    after: input,
    ip: ctx.ip,
  });
}

export async function updateValidationSettings(
  ctx: ServiceContext,
  input: z.output<typeof validationSettingsSchema>,
) {
  assertCan(ctx.actor, "organization.manage", { organizationId: ctx.organizationId });
  const before = await getOrganization(ctx);
  await db.organization.update({ where: { id: ctx.organizationId }, data: input });
  await audit({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    action: "settings.validation",
    entityType: "organization",
    entityId: ctx.organizationId,
    before: {
      photosAutoApprove: before.photosAutoApprove,
      officeCanValidatePhotos: before.officeCanValidatePhotos,
      summaryAutoSend: before.summaryAutoSend,
      summaryHour: before.summaryHour,
      reminderHour: before.reminderHour,
    },
    after: input,
    ip: ctx.ip,
  });
}

export async function listAuditLog(ctx: ServiceContext, page = 1, pageSize = 50) {
  assertCan(ctx.actor, "audit.view", { organizationId: ctx.organizationId });
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.auditLog.count({ where: { organizationId: ctx.organizationId } }),
  ]);
  const actorIds = Array.from(new Set(rows.map((r) => r.actorId).filter((id): id is string => !!id)));
  const actors = await db.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true },
  });
  const names = new Map(actors.map((a) => [a.id, a.name]));
  return {
    rows: rows.map((r) => ({
      ...r,
      actorName: r.actorId ? (names.get(r.actorId) ?? "Utilisateur supprimé") : "Système",
    })),
    total,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** French label of an audit action. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "organization.created": "Création du compte",
  "password.reset_requested": "Demande de nouveau mot de passe",
  "password.reset": "Réinitialisation du mot de passe",
  "invitation.created": "Invitation envoyée",
  "invitation.revoked": "Invitation annulée",
  "invitation.accepted": "Invitation acceptée",
  "member.role_changed": "Changement de rôle",
  "member.removed": "Membre retiré",
  "member.whatsapp": "Numéro WhatsApp associé",
  "client.create": "Client créé",
  "client.update": "Client modifié",
  "client.archive": "Client archivé",
  "client.unarchive": "Client désarchivé",
  "client.anonymize": "Client anonymisé",
  "client.export": "Export des données d'un client",
  "client.import": "Import de clients (CSV)",
  "site.export": "Export ZIP d'un chantier",
  "documents.export": "Export ZIP de documents",
  "site.create": "Chantier créé",
  "site.status": "Statut de chantier modifié",
  "site.delete": "Chantier supprimé",
  "document.upload": "Document ajouté",
  "document.update": "Document modifié",
  "document.delete": "Document supprimé",
  "template.create": "Modèle d'étapes créé",
  "template.delete": "Modèle d'étapes supprimé",
  "organization.update": "Informations de l'entreprise modifiées",
  "settings.validation": "Réglages de validation modifiés",
  "portal.create": "Lien client créé",
  "portal.revoke": "Lien client révoqué",
  "media.validate": "Photos validées / refusées",
  "summary.approve": "Résumé approuvé",
  "billing.change": "Abonnement modifié",
  "data.export": "Export complet des données",
  "organization.delete": "Suppression du compte",
  "retention.purge": "Purge de rétention",
};
