import { today } from "@/lib/dates";
import type { ServiceContext } from "@/server/auth/context";
import { db } from "@/server/db";
import { nextStep, siteLateness } from "@/server/domain/progress";
import { assertCan } from "@/server/permissions/can";
import { openInboxCount, pendingPhotoCount } from "./counters";
import { describeEvent } from "./events";

export async function dashboardData(ctx: ServiceContext) {
  assertCan(ctx.actor, "site.list", { organizationId: ctx.organizationId });
  const day = today(ctx.organizationTimeZone ?? "Europe/Paris");
  const orgId = ctx.organizationId;

  const [sites, pendingPhotos, openInbox, draftSummaries, events, todayAssignments, counts] =
    await Promise.all([
      db.site.findMany({
        where: { organizationId: orgId, status: { in: ["PLANNED", "IN_PROGRESS", "PAUSED"] } },
        include: {
          client: { select: { name: true } },
          steps: { orderBy: { order: "asc" } },
          members: { include: { user: { select: { name: true } } } },
        },
        orderBy: [{ status: "asc" }, { plannedEnd: { sort: "asc", nulls: "last" } }],
      }),
      pendingPhotoCount(orgId),
      openInboxCount(orgId),
      db.dailySummary.count({ where: { organizationId: orgId, status: "DRAFT" } }),
      db.siteEvent.findMany({
        where: { organizationId: orgId },
        include: { site: { select: { id: true, title: true } } },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      db.assignment.findMany({
        where: { organizationId: orgId, date: day },
        include: { user: { select: { name: true } }, site: { select: { id: true, title: true } } },
        orderBy: { startTime: "asc" },
      }),
      Promise.all([
        db.client.count({ where: { organizationId: orgId, archivedAt: null } }),
        db.site.count({ where: { organizationId: orgId } }),
        db.membership.count({ where: { organizationId: orgId, role: "WORKER" } }),
        db.clientPortalLink.count({ where: { organizationId: orgId } }),
      ]),
    ]);

  const actorIds = Array.from(new Set(events.map((e) => e.actorId).filter((id): id is string => !!id)));
  const actors = await db.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true },
  });
  const names = new Map(actors.map((a) => [a.id, a.name]));

  const enrichedSites = sites.map((site) => ({
    ...site,
    lateness: siteLateness(site, site.steps, day),
    next: nextStep(site.steps),
  }));
  const lateSites = enrichedSites.filter((s) => s.lateness.late);

  return {
    sites: enrichedSites,
    alerts: { lateSites, pendingPhotos, openInbox, draftSummaries },
    activity: events.map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      site: e.site,
      actor: e.actorId ? (names.get(e.actorId) ?? "Quelqu'un") : "ChantierLink",
      text: describeEvent(e.type, e.payload),
    })),
    todayAssignments,
    onboarding: {
      hasClient: counts[0] > 0,
      hasSite: counts[1] > 0,
      hasWorker: counts[2] > 0,
      hasPortalLink: counts[3] > 0,
    },
  };
}
