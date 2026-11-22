/**
 * Central permission module. Used server-side in every route handler, server action and service.
 * Pure function (no I/O): callers load the resource context (organization, assigned users…) beforehand.
 */
import type { DocumentType, Role } from "@/generated/prisma/enums";
import { ForbiddenError } from "@/server/errors";

export type MemberActor = {
  kind: "member";
  userId: string;
  organizationId: string;
  role: Role;
  /** Organization setting: can OFFICE members approve / reject photos? */
  officeCanValidatePhotos: boolean;
};

/** A client reaching the portal through a magic link. Scoped to one site. */
export type ClientActor = {
  kind: "client";
  organizationId: string;
  siteId: string;
};

export type Actor = MemberActor | ClientActor;

export const ACTIONS = [
  // Organization
  "organization.manage",
  "billing.manage",
  "members.manage",
  "audit.view",
  "data.export",
  "organization.delete",
  // Clients
  "client.create",
  "client.update",
  "client.view",
  "client.viewLimited",
  // Sites
  "site.create",
  "site.update",
  "site.delete",
  "site.view",
  "site.list",
  "step.update",
  "step.complete",
  "note.create",
  // Documents
  "document.create",
  "document.view",
  "document.update",
  "document.delete",
  // Planning & tasks
  "planning.update",
  "planning.view",
  "task.manage",
  "task.complete",
  // Media
  "media.upload",
  "media.view",
  "media.validate",
  // Journal / summaries
  "summary.view",
  "summary.approve",
  // Inbox (to sort)
  "inbox.process",
  // Client portal
  "portal.manage",
  "portal.view",
] as const;

export type Action = (typeof ACTIONS)[number];

export type ResourceContext = {
  organizationId?: string;
  siteId?: string;
  /** Users assigned to the site (any date). Required for WORKER checks on a site. */
  assignedUserIds?: string[];
  documentType?: DocumentType;
  documentVisibleToClient?: boolean;
  /** Owner of a personal resource (e.g. a worker's own planning). */
  ownerUserId?: string;
};

/** Actions reserved to the OWNER role. */
const OWNER_ONLY: ReadonlySet<Action> = new Set<Action>([
  "organization.manage",
  "billing.manage",
  "members.manage",
  "audit.view",
  "data.export",
  "organization.delete",
]);

/** Document types a worker may add (expense reports, purchase orders). */
const WORKER_UPLOADABLE_DOCUMENTS: ReadonlySet<DocumentType> = new Set<DocumentType>([
  "EXPENSE",
  "PURCHASE_ORDER",
]);
/** Document types a worker may read on his sites (plans). */
const WORKER_READABLE_DOCUMENTS: ReadonlySet<DocumentType> = new Set<DocumentType>(["PLAN"]);

function isAssigned(actor: MemberActor, resource?: ResourceContext): boolean {
  return Boolean(resource?.assignedUserIds?.includes(actor.userId));
}

/** When a site is given, the worker must be assigned to it; without site context the action is generic. */
function assignedIfSite(actor: MemberActor, resource?: ResourceContext): boolean {
  if (!resource?.siteId) return true;
  return isAssigned(actor, resource);
}

function canWorker(actor: MemberActor, action: Action, resource?: ResourceContext): boolean {
  switch (action) {
    case "client.viewLimited":
      return true;
    case "site.list":
      // Workers can list sites, the service filters to their assigned ones.
      return true;
    case "site.view":
    case "step.complete":
    case "task.complete":
    case "note.create":
    case "media.view":
      return isAssigned(actor, resource);
    case "media.upload":
      return assignedIfSite(actor, resource);
    case "document.create":
      return (
        resource?.documentType !== undefined &&
        WORKER_UPLOADABLE_DOCUMENTS.has(resource.documentType) &&
        assignedIfSite(actor, resource)
      );
    case "document.view":
      return (
        resource?.documentType !== undefined &&
        WORKER_READABLE_DOCUMENTS.has(resource.documentType) &&
        isAssigned(actor, resource)
      );
    case "planning.view":
      return resource?.ownerUserId === actor.userId;
    default:
      return false;
  }
}

function canClient(actor: ClientActor, action: Action, resource?: ResourceContext): boolean {
  const sameSite = resource?.siteId === actor.siteId;
  switch (action) {
    case "portal.view":
    case "site.view":
    case "media.view":
    case "summary.view":
    case "planning.view":
      return sameSite;
    case "document.view":
      return sameSite && resource?.documentVisibleToClient === true;
    default:
      return false;
  }
}

export function can(actor: Actor, action: Action, resource?: ResourceContext): boolean {
  // Strict multi-tenancy: never cross organizations.
  if (resource?.organizationId !== undefined && resource.organizationId !== actor.organizationId) {
    return false;
  }

  if (actor.kind === "client") return canClient(actor, action, resource);

  switch (actor.role) {
    case "OWNER":
      return action !== "portal.view";
    case "OFFICE":
      if (OWNER_ONLY.has(action) || action === "portal.view") return false;
      if (action === "media.validate") return actor.officeCanValidatePhotos;
      if (action === "planning.view") return true;
      return true;
    case "WORKER":
      return canWorker(actor, action, resource);
    default:
      return false;
  }
}

export function assertCan(actor: Actor, action: Action, resource?: ResourceContext): void {
  if (!can(actor, action, resource)) throw new ForbiddenError();
}

export function isManager(actor: Actor): boolean {
  return actor.kind === "member" && (actor.role === "OWNER" || actor.role === "OFFICE");
}
