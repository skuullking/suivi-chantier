/** Data and actions of the worker mobile space (/w). */
import { addDays, today } from "@/lib/dates";
import type { ServiceContext } from "@/server/auth/context";
import { db } from "@/server/db";
import { nextStep } from "@/server/domain/progress";
import { loadSiteFor } from "./access";
import { recordSiteEvent } from "./events";
import { notifyManagers } from "./notifications";

const siteSelect = {
  id: true,
  code: true,
  title: true,
  address: true,
  postalCode: true,
  city: true,
  latitude: true,
  longitude: true,
  instructions: true,
  status: true,
  progress: true,
  steps: { orderBy: { order: "asc" as const } },
  client: { select: { name: true, phones: true } },
};

/** The day of the connected member: planned sites (or, without planning, the sites of his team). */
export async function workerDay(ctx: ServiceContext) {
  const day = today(ctx.organizationTimeZone);
  const assignments = await db.assignment.findMany({
    where: { organizationId: ctx.organizationId, userId: ctx.userId, date: day },
    include: { site: { select: siteSelect }, step: { select: { id: true, title: true } } },
    orderBy: [{ startTime: { sort: "asc", nulls: "last" } }],
  });
  const siteIds = Array.from(new Set(assignments.map((a) => a.siteId)));
  const [tasks, teamSites, tomorrow] = await Promise.all([
    db.task.findMany({
      where: {
        organizationId: ctx.organizationId,
        siteId: { in: siteIds },
        OR: [{ date: day }, { date: null, status: "TODO" }],
        AND: [{ OR: [{ assigneeId: null }, { assigneeId: ctx.userId }] }],
      },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    }),
    siteIds.length
      ? Promise.resolve([])
      : db.site.findMany({
          where: {
            organizationId: ctx.organizationId,
            members: { some: { userId: ctx.userId } },
            status: { in: ["DRAFT", "PLANNED", "IN_PROGRESS", "PAUSED"] },
          },
          select: { id: true, title: true, city: true, code: true },
          orderBy: { title: "asc" },
        }),
    db.assignment.findMany({
      where: { organizationId: ctx.organizationId, userId: ctx.userId, date: addDays(day, 1) },
      include: { site: { select: { id: true, title: true, city: true } } },
      orderBy: { startTime: "asc" },
    }),
  ]);
  const seen = new Set<string>();
  const sites = assignments
    .filter((a) => (seen.has(a.siteId) ? false : (seen.add(a.siteId), true)))
    .map((a) => ({
      assignmentId: a.id,
      slot: a.slot,
      startTime: a.startTime,
      arrivedAt: a.arrivedAt,
      dayInstructions: a.instructions,
      plannedStep: a.step,
      site: a.site,
      currentStep: nextStep(a.site.steps),
      tasks: tasks.filter((t) => t.siteId === a.siteId),
    }));
  return { day, sites, teamSites, tomorrow };
}

/** Sites the member can send photos to (today's first, then his team's). */
export async function uploadTargets(ctx: ServiceContext) {
  const day = today(ctx.organizationTimeZone);
  const [assignments, sites] = await Promise.all([
    db.assignment.findMany({
      where: { organizationId: ctx.organizationId, userId: ctx.userId, date: day },
      select: { siteId: true, stepId: true },
    }),
    db.site.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { in: ["DRAFT", "PLANNED", "IN_PROGRESS", "PAUSED"] },
        ...(ctx.actor.role === "WORKER" ? { members: { some: { userId: ctx.userId } } } : {}),
      },
      select: {
        id: true,
        code: true,
        title: true,
        steps: {
          select: { id: true, title: true, status: true, order: true, weight: true },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { title: "asc" },
    }),
  ]);
  const todayIds = assignments.map((a) => a.siteId);
  return sites
    .map((s) => ({
      id: s.id,
      code: s.code,
      title: s.title,
      today: todayIds.includes(s.id),
      steps: s.steps.map((st) => ({ id: st.id, title: st.title, status: st.status })),
      defaultStepId:
        assignments.find((a) => a.siteId === s.id && a.stepId)?.stepId ?? nextStep(s.steps)?.id ?? null,
    }))
    .sort((a, b) => Number(b.today) - Number(a.today));
}

/** "J'arrive": marks the arrival on today's assignment and informs the office. */
export async function arriveOnSite(ctx: ServiceContext, siteId: string) {
  const { site } = await loadSiteFor(ctx, siteId, "note.create");
  const day = today(ctx.organizationTimeZone);
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.assignment.updateMany({
      where: { organizationId: ctx.organizationId, siteId, userId: ctx.userId, date: day, arrivedAt: null },
      data: { arrivedAt: now },
    });
    await recordSiteEvent(
      { organizationId: ctx.organizationId, siteId, actorId: ctx.userId, type: "worker.arrived" },
      tx,
    );
    if (site.status === "PLANNED") {
      await tx.site.update({
        where: { id: siteId },
        data: { status: "IN_PROGRESS", actualStart: site.actualStart ?? day },
      });
    }
  });
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { name: true } });
  await notifyManagers({
    organizationId: ctx.organizationId,
    type: "site.started",
    title: `${user.name} est arrivé sur ${site.title}`,
    link: `/app/chantiers/${siteId}`,
    excludeUserId: ctx.userId,
  });
  return { arrivedAt: now };
}

/** Detail of a site for the worker (only if assigned). */
export async function workerSite(ctx: ServiceContext, siteId: string) {
  await loadSiteFor(ctx, siteId, "site.view");
  const site = await db.site.findUniqueOrThrow({ where: { id: siteId }, select: siteSelect });
  const [plans, myMedia, tasks] = await Promise.all([
    db.document.findMany({
      where: { organizationId: ctx.organizationId, siteId, type: "PLAN" },
      orderBy: { createdAt: "desc" },
    }),
    db.media.findMany({
      where: { organizationId: ctx.organizationId, siteId, authorId: ctx.userId },
      orderBy: { receivedAt: "desc" },
      take: 30,
    }),
    db.task.findMany({
      where: { organizationId: ctx.organizationId, siteId, status: "TODO" },
      orderBy: [{ date: { sort: "asc", nulls: "last" } }],
    }),
  ]);
  return { site, currentStep: nextStep(site.steps), plans, myMedia, tasks };
}
