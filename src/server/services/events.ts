/** Site journal events (history shown in the "Journal" tab and the dashboard activity feed). */
import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/server/db";

export type SiteEventType =
  | "site.created"
  | "site.updated"
  | "site.status"
  | "step.added"
  | "step.status"
  | "step.removed"
  | "document.added"
  | "note.added"
  | "problem.reported"
  | "assignment.created"
  | "task.done"
  | "media.added"
  | "media.validated"
  | "worker.arrived"
  | "summary.sent"
  | "portal.link";

export async function recordSiteEvent(
  event: {
    organizationId: string;
    siteId: string;
    actorId?: string | null;
    type: SiteEventType;
    payload?: Record<string, unknown>;
  },
  tx: Tx = db,
) {
  await tx.siteEvent.create({
    data: {
      organizationId: event.organizationId,
      siteId: event.siteId,
      actorId: event.actorId ?? null,
      type: event.type,
      payload: (event.payload ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

/** French sentence for an event (used by the journal and the dashboard). */
export function describeEvent(type: string, payload: unknown): string {
  const p = (payload ?? {}) as Record<string, string | number | undefined>;
  switch (type) {
    case "site.created":
      return "a créé le chantier";
    case "site.updated":
      return "a modifié les informations du chantier";
    case "site.status":
      return `a passé le chantier en « ${p.label ?? p.status} »`;
    case "step.added":
      return `a ajouté l'étape « ${p.title} »`;
    case "step.status":
      return `a passé l'étape « ${p.title} » en « ${p.label ?? p.status} »`;
    case "step.removed":
      return `a supprimé l'étape « ${p.title} »`;
    case "document.added":
      return `a ajouté le document « ${p.name} »`;
    case "note.added":
      return "a ajouté une note";
    case "problem.reported":
      return "a signalé un problème";
    case "assignment.created":
      return `a planifié ${p.userName ?? "un membre"} le ${p.date}`;
    case "task.done":
      return `a terminé la tâche « ${p.title} »`;
    case "media.added":
      return p.kind === "VOICE" ? "a envoyé un message vocal" : "a envoyé une photo";
    case "media.validated":
      return `a validé ${p.count ?? 1} photo(s)`;
    case "worker.arrived":
      return "est arrivé sur le chantier";
    case "summary.sent":
      return "a envoyé le résumé du jour au client";
    case "portal.link":
      return p.action === "revoked" ? "a révoqué le lien client" : "a créé un lien de suivi client";
    default:
      return type;
  }
}
