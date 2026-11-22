import { parseDateOnlyOrNull } from "@/lib/dates";
import type { TaskInput } from "@/lib/validation/business";
import type { ServiceContext } from "@/server/auth/context";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { assertCan } from "@/server/permissions/can";
import { assertMembers, assertStepOfSite, loadSiteFor } from "./access";
import { recordSiteEvent } from "./events";

export async function listSiteTasks(ctx: ServiceContext, siteId: string) {
  await loadSiteFor(ctx, siteId, "site.view");
  return db.task.findMany({
    where: { organizationId: ctx.organizationId, siteId },
    include: { assignee: { select: { id: true, name: true } }, step: { select: { id: true, title: true } } },
    orderBy: [{ status: "asc" }, { date: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
}

/** Tasks of a day for the given sites (worker home + dashboard). Undated open tasks are included. */
export async function tasksOfDay(ctx: ServiceContext, siteIds: string[], date: Date) {
  if (siteIds.length === 0) return [];
  return db.task.findMany({
    where: {
      organizationId: ctx.organizationId,
      siteId: { in: siteIds },
      OR: [{ date }, { date: null, status: "TODO" }],
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
}

export async function createTask(ctx: ServiceContext, input: TaskInput) {
  await loadSiteFor(ctx, input.siteId, "site.view");
  assertCan(ctx.actor, "task.manage", { organizationId: ctx.organizationId });
  if (input.assigneeId) await assertMembers(ctx.organizationId, [input.assigneeId]);
  await assertStepOfSite(input.siteId, input.stepId);
  return db.task.create({
    data: {
      organizationId: ctx.organizationId,
      siteId: input.siteId,
      title: input.title,
      date: parseDateOnlyOrNull(input.date),
      assigneeId: input.assigneeId ?? null,
      stepId: input.stepId ?? null,
    },
  });
}

export async function setTaskDone(ctx: ServiceContext, taskId: string, done: boolean) {
  const task = await db.task.findFirst({ where: { id: taskId, organizationId: ctx.organizationId } });
  if (!task) throw new NotFoundError("Tâche introuvable.");
  await loadSiteFor(ctx, task.siteId, "task.complete");
  await db.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: done
        ? { status: "DONE", completedAt: new Date(), completedById: ctx.userId }
        : { status: "TODO", completedAt: null, completedById: null },
    });
    if (done) {
      await recordSiteEvent(
        {
          organizationId: ctx.organizationId,
          siteId: task.siteId,
          actorId: ctx.userId,
          type: "task.done",
          payload: { title: task.title },
        },
        tx,
      );
    }
  });
}

export async function deleteTask(ctx: ServiceContext, taskId: string) {
  const task = await db.task.findFirst({ where: { id: taskId, organizationId: ctx.organizationId } });
  if (!task) throw new NotFoundError("Tâche introuvable.");
  assertCan(ctx.actor, "task.manage", { organizationId: ctx.organizationId });
  await db.task.delete({ where: { id: taskId } });
}
