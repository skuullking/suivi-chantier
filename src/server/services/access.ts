/**
 * Loading helpers that enforce tenancy + permissions in one place.
 * A resource of another organization is reported as "not found" (never reveal that it exists).
 */
import type { ServiceContext } from "@/server/auth/context";
import { db, type Tx } from "@/server/db";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { type Action, can } from "@/server/permissions/can";

export async function siteMemberIds(siteId: string, tx: Tx = db): Promise<string[]> {
  const members = await tx.siteMember.findMany({ where: { siteId }, select: { userId: true } });
  return members.map((m) => m.userId);
}

/** Loads a site of the caller's organization and checks `action` on it. */
export async function loadSiteFor(ctx: ServiceContext, siteId: string, action: Action, tx: Tx = db) {
  const site = await tx.site.findFirst({
    where: { id: siteId, organizationId: ctx.organizationId },
    include: { members: { select: { userId: true } } },
  });
  if (!site) throw new NotFoundError("Chantier introuvable.");
  const assignedUserIds = assertSiteAccess(ctx, site, action);
  return { site, assignedUserIds };
}

/** Permission check on an already loaded site (avoids a second query). Returns the assigned user ids. */
export function assertSiteAccess<
  S extends { id: string; organizationId: string; members: { userId: string }[] },
>(ctx: ServiceContext, site: S, action: Action): string[] {
  const assignedUserIds = site.members.map((m) => m.userId);
  if (!can(ctx.actor, action, { organizationId: site.organizationId, siteId: site.id, assignedUserIds })) {
    // Workers trying to open a site they are not assigned to get the same answer as for a missing site.
    if (ctx.actor.role === "WORKER") throw new NotFoundError("Chantier introuvable.");
    throw new ForbiddenError();
  }
  return assignedUserIds;
}

export async function loadClientFor(ctx: ServiceContext, clientId: string, action: Action, tx: Tx = db) {
  const client = await tx.client.findFirst({ where: { id: clientId, organizationId: ctx.organizationId } });
  if (!client) throw new NotFoundError("Client introuvable.");
  if (!can(ctx.actor, action, { organizationId: client.organizationId })) throw new ForbiddenError();
  return client;
}

/** Checks that every user id belongs to the organization (prevents assigning foreign users). */
export async function assertMembers(organizationId: string, userIds: string[], tx: Tx = db) {
  const unique = Array.from(new Set(userIds));
  if (unique.length === 0) return;
  const count = await tx.membership.count({ where: { organizationId, userId: { in: unique } } });
  if (count !== unique.length) throw new NotFoundError("Membre introuvable.");
}

/** Ensures a step belongs to the given site (and therefore to its organization). */
export async function assertStepOfSite(siteId: string, stepId: string | undefined | null, tx: Tx = db) {
  if (!stepId) return;
  const step = await tx.siteStep.findFirst({ where: { id: stepId, siteId }, select: { id: true } });
  if (!step) throw new NotFoundError("Étape introuvable.");
}
