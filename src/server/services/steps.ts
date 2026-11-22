import type { StepStatus } from "@/generated/prisma/enums";
import { parseDateOnlyOrNull, today } from "@/lib/dates";
import { STEP_STATUS_LABELS } from "@/lib/labels";
import type { StepInput } from "@/lib/validation/business";
import type { ServiceContext } from "@/server/auth/context";
import { db } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import { loadSiteFor } from "./access";
import { recordSiteEvent } from "./events";
import { notifyManagers } from "./notifications";
import { recomputeProgress } from "./sites";

async function loadStep(ctx: ServiceContext, stepId: string) {
  const step = await db.siteStep.findFirst({ where: { id: stepId, organizationId: ctx.organizationId } });
  if (!step) throw new NotFoundError("Étape introuvable.");
  return step;
}

function stepData(input: StepInput) {
  return {
    title: input.title,
    weight: input.weight,
    visibleToClient: input.visibleToClient,
    plannedStart: parseDateOnlyOrNull(input.plannedStart),
    plannedEnd: parseDateOnlyOrNull(input.plannedEnd),
  };
}

export async function addStep(ctx: ServiceContext, siteId: string, input: StepInput) {
  await loadSiteFor(ctx, siteId, "step.update");
  return db.$transaction(async (tx) => {
    const last = await tx.siteStep.aggregate({ where: { siteId }, _max: { order: true } });
    const step = await tx.siteStep.create({
      data: {
        organizationId: ctx.organizationId,
        siteId,
        order: (last._max.order ?? 0) + 1,
        ...stepData(input),
      },
    });
    await recomputeProgress(siteId, tx);
    await recordSiteEvent(
      {
        organizationId: ctx.organizationId,
        siteId,
        actorId: ctx.userId,
        type: "step.added",
        payload: { title: step.title },
      },
      tx,
    );
    return step;
  });
}

export async function updateStep(ctx: ServiceContext, stepId: string, input: StepInput) {
  const step = await loadStep(ctx, stepId);
  await loadSiteFor(ctx, step.siteId, "step.update");
  return db.$transaction(async (tx) => {
    const updated = await tx.siteStep.update({ where: { id: stepId }, data: stepData(input) });
    await recomputeProgress(step.siteId, tx);
    return updated;
  });
}

/**
 * Changes a step status. Managers can set any status; an assigned worker can start or complete a step.
 * Starting the first step automatically starts the site.
 */
export async function setStepStatus(ctx: ServiceContext, stepId: string, status: StepStatus) {
  const step = await loadStep(ctx, stepId);
  const isWorker = ctx.actor.role === "WORKER";
  const { site } = await loadSiteFor(ctx, step.siteId, isWorker ? "step.complete" : "step.update");
  if (isWorker && status === "TODO") throw new ValidationError("Seul le bureau peut rouvrir une étape.");
  if (step.status === status) return { step, progress: site.progress };
  const now = new Date();
  const day = today(ctx.organizationTimeZone ?? "Europe/Paris");

  return db.$transaction(async (tx) => {
    const updated = await tx.siteStep.update({
      where: { id: stepId },
      data: {
        status,
        startedAt: status === "TODO" ? null : (step.startedAt ?? now),
        completedAt: status === "DONE" ? now : null,
      },
    });
    const progress = await recomputeProgress(step.siteId, tx);
    if (status !== "TODO" && (site.status === "DRAFT" || site.status === "PLANNED")) {
      await tx.site.update({
        where: { id: site.id },
        data: { status: "IN_PROGRESS", actualStart: site.actualStart ?? day },
      });
    }
    await recordSiteEvent(
      {
        organizationId: ctx.organizationId,
        siteId: step.siteId,
        actorId: ctx.userId,
        type: "step.status",
        payload: { title: step.title, status, label: STEP_STATUS_LABELS[status] },
      },
      tx,
    );
    if (status === "DONE") {
      await notifyManagers(
        {
          organizationId: ctx.organizationId,
          type: "step.completed",
          title: `Étape terminée : ${step.title}`,
          body: `${site.title} — progression ${progress} %`,
          link: `/app/chantiers/${site.id}/etapes`,
          excludeUserId: ctx.userId,
        },
        tx,
      );
    }
    return { step: updated, progress };
  });
}

export async function reorderSteps(ctx: ServiceContext, siteId: string, orderedIds: string[]) {
  await loadSiteFor(ctx, siteId, "step.update");
  const steps = await db.siteStep.findMany({ where: { siteId }, select: { id: true } });
  const known = new Set(steps.map((s) => s.id));
  if (orderedIds.length !== steps.length || !orderedIds.every((id) => known.has(id))) {
    throw new ValidationError("La liste des étapes a changé, rechargez la page.");
  }
  await db.$transaction(
    orderedIds.map((id, i) => db.siteStep.update({ where: { id }, data: { order: i + 1 } })),
  );
}

export async function deleteStep(ctx: ServiceContext, stepId: string) {
  const step = await loadStep(ctx, stepId);
  await loadSiteFor(ctx, step.siteId, "step.update");
  await db.$transaction(async (tx) => {
    await tx.siteStep.delete({ where: { id: stepId } });
    const rest = await tx.siteStep.findMany({ where: { siteId: step.siteId }, orderBy: { order: "asc" } });
    for (const [i, s] of rest.entries()) {
      if (s.order !== i + 1) await tx.siteStep.update({ where: { id: s.id }, data: { order: i + 1 } });
    }
    await recomputeProgress(step.siteId, tx);
    await recordSiteEvent(
      {
        organizationId: ctx.organizationId,
        siteId: step.siteId,
        actorId: ctx.userId,
        type: "step.removed",
        payload: { title: step.title },
      },
      tx,
    );
  });
}
