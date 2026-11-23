import type { Prisma } from "@/generated/prisma/client";
import { formatDay } from "@/lib/format";
import { parseDateOnly, toDateKey } from "@/lib/dates";
import { SLOT_LABELS } from "@/lib/labels";
import type { AssignmentInput } from "@/lib/validation/business";
import type { ServiceContext } from "@/server/auth/context";
import { db } from "@/server/db";
import { conflictsFor, findConflicts } from "@/server/domain/planning";
import { NotFoundError } from "@/server/errors";
import { assertCan, can } from "@/server/permissions/can";
import { assertMembers, assertStepOfSite, loadSiteFor } from "./access";
import { recordSiteEvent } from "./events";
import { notifyUsers } from "./notifications";
import { ensureSiteMember } from "./sites";

const assignmentInclude = {
  site: { select: { id: true, code: true, title: true, address: true, city: true, status: true } },
  user: { select: { id: true, name: true } },
  step: { select: { id: true, title: true } },
} satisfies Prisma.AssignmentInclude;

export type PlanningRange = { from: Date; to: Date; userId?: string; siteId?: string };

/** Assignments in [from, to] (inclusive) with conflict detection. Workers only get their own. */
export async function listAssignments(ctx: ServiceContext, range: PlanningRange) {
  const ownOnly = ctx.actor.role === "WORKER";
  if (ownOnly) {
    assertCan(ctx.actor, "planning.view", { organizationId: ctx.organizationId, ownerUserId: ctx.userId });
  } else {
    assertCan(ctx.actor, "planning.view", { organizationId: ctx.organizationId });
  }
  // Conflicts are computed on the whole organization planning (not only the filtered view): both queries in parallel.
  const [assignments, orgWide] = await Promise.all([
    db.assignment.findMany({
      where: {
        organizationId: ctx.organizationId,
        date: { gte: range.from, lte: range.to },
        ...(ownOnly ? { userId: ctx.userId } : range.userId ? { userId: range.userId } : {}),
        ...(range.siteId ? { siteId: range.siteId } : {}),
      },
      include: assignmentInclude,
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    range.siteId
      ? db.assignment.findMany({
          where: { organizationId: ctx.organizationId, date: { gte: range.from, lte: range.to } },
          select: { id: true, userId: true, date: true, slot: true, siteId: true },
        })
      : null,
  ]);
  const conflicts = findConflicts(orgWide ?? assignments);
  return assignments.map((a) => ({ ...a, conflictIds: conflicts.get(a.id) ?? [] }));
}

export async function planningMembers(ctx: ServiceContext) {
  return db.membership.findMany({
    where: { organizationId: ctx.organizationId },
    include: { user: { select: { id: true, name: true } } },
    orderBy: [{ role: "desc" }, { createdAt: "asc" }],
  });
}

async function loadAssignment(ctx: ServiceContext, id: string) {
  const assignment = await db.assignment.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!assignment) throw new NotFoundError("Affectation introuvable.");
  return assignment;
}

async function conflictWarnings(organizationId: string, candidate: AssignmentLike, excludeId?: string) {
  const sameDay = await db.assignment.findMany({
    where: {
      organizationId,
      userId: candidate.userId,
      date: candidate.date,
      NOT: excludeId ? { id: excludeId } : undefined,
    },
    include: { site: { select: { title: true } } },
  });
  return conflictsFor(candidate, sameDay).map((c) => {
    const site = sameDay.find((s) => s.id === c.id)?.site.title ?? "un autre chantier";
    return `Déjà prévu sur « ${site} » (${SLOT_LABELS[c.slot].toLowerCase()}) ce jour-là.`;
  });
}

type AssignmentLike = { userId: string; date: Date; slot: AssignmentInput["slot"]; siteId: string };

export async function createAssignment(ctx: ServiceContext, input: AssignmentInput) {
  assertCan(ctx.actor, "planning.update", { organizationId: ctx.organizationId });
  const { site } = await loadSiteFor(ctx, input.siteId, "site.view");
  await assertMembers(ctx.organizationId, [input.userId]);
  await assertStepOfSite(site.id, input.stepId);
  const date = parseDateOnly(input.date);
  const warnings = await conflictWarnings(ctx.organizationId, { ...input, date });
  const assignment = await db.$transaction(async (tx) => {
    const created = await tx.assignment.create({
      data: {
        organizationId: ctx.organizationId,
        siteId: site.id,
        userId: input.userId,
        stepId: input.stepId ?? null,
        date,
        slot: input.slot,
        startTime: input.startTime ?? null,
        instructions: input.instructions ?? null,
      },
      include: assignmentInclude,
    });
    await ensureSiteMember(ctx.organizationId, site.id, input.userId, tx);
    // Planning someone on a draft site means it is scheduled.
    if (site.status === "DRAFT")
      await tx.site.update({ where: { id: site.id }, data: { status: "PLANNED" } });
    await recordSiteEvent(
      {
        organizationId: ctx.organizationId,
        siteId: site.id,
        actorId: ctx.userId,
        type: "assignment.created",
        payload: { userName: created.user.name, date: formatDay(date) },
      },
      tx,
    );
    if (input.userId !== ctx.userId) {
      await notifyUsers(
        [input.userId],
        {
          organizationId: ctx.organizationId,
          type: "assignment.created",
          title: `Planning : ${site.title} le ${formatDay(date)}`,
          body: `${SLOT_LABELS[input.slot]}${input.startTime ? ` à partir de ${input.startTime}` : ""}`,
          link: `/w`,
        },
        tx,
      );
    }
    return created;
  });
  return { assignment, warnings };
}

/** Drag & drop: move to another day and/or person. */
export async function moveAssignment(
  ctx: ServiceContext,
  id: string,
  target: { date: string; userId?: string },
) {
  assertCan(ctx.actor, "planning.update", { organizationId: ctx.organizationId });
  const assignment = await loadAssignment(ctx, id);
  const userId = target.userId ?? assignment.userId;
  await assertMembers(ctx.organizationId, [userId]);
  const date = parseDateOnly(target.date);
  const warnings = await conflictWarnings(
    ctx.organizationId,
    { userId, date, slot: assignment.slot, siteId: assignment.siteId },
    id,
  );
  await db.$transaction(async (tx) => {
    await tx.assignment.update({ where: { id }, data: { date, userId } });
    await ensureSiteMember(ctx.organizationId, assignment.siteId, userId, tx);
  });
  return { warnings };
}

export async function updateAssignment(ctx: ServiceContext, id: string, input: AssignmentInput) {
  assertCan(ctx.actor, "planning.update", { organizationId: ctx.organizationId });
  await loadAssignment(ctx, id);
  const { site } = await loadSiteFor(ctx, input.siteId, "site.view");
  await assertMembers(ctx.organizationId, [input.userId]);
  await assertStepOfSite(site.id, input.stepId);
  const date = parseDateOnly(input.date);
  const warnings = await conflictWarnings(ctx.organizationId, { ...input, date }, id);
  await db.$transaction(async (tx) => {
    await tx.assignment.update({
      where: { id },
      data: {
        siteId: site.id,
        userId: input.userId,
        stepId: input.stepId ?? null,
        date,
        slot: input.slot,
        startTime: input.startTime ?? null,
        instructions: input.instructions ?? null,
      },
    });
    await ensureSiteMember(ctx.organizationId, site.id, input.userId, tx);
  });
  return { warnings };
}

export async function deleteAssignment(ctx: ServiceContext, id: string) {
  assertCan(ctx.actor, "planning.update", { organizationId: ctx.organizationId });
  await loadAssignment(ctx, id);
  await db.assignment.delete({ where: { id } });
}

/** The day of a member (worker home screen, dashboard). */
export async function assignmentsOfDay(ctx: ServiceContext, userId: string, date: Date) {
  if (
    !can(ctx.actor, "planning.view", { organizationId: ctx.organizationId, ownerUserId: userId }) &&
    ctx.userId !== userId
  ) {
    return [];
  }
  return db.assignment.findMany({
    where: { organizationId: ctx.organizationId, userId, date },
    include: assignmentInclude,
    orderBy: [{ startTime: "asc" }],
  });
}

export function dayKey(date: Date) {
  return toDateKey(date);
}
