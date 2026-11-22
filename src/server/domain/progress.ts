/**
 * Site progress and lateness (pure functions, unit-tested).
 * Progress = weighted share of DONE steps. A step is late when its planned end date is past and it is not done.
 */
import type { SiteStatus, StepStatus } from "@/generated/prisma/enums";

export type ProgressStep = {
  id: string;
  title: string;
  order: number;
  status: StepStatus;
  weight: number;
  plannedEnd?: Date | null;
};

/** Weighted progress in percent (integer 0-100). Negative weights count as 0. */
export function computeProgress(steps: ProgressStep[]): number {
  const total = steps.reduce((sum, s) => sum + Math.max(0, s.weight), 0);
  if (total === 0) return 0;
  const done = steps.filter((s) => s.status === "DONE").reduce((sum, s) => sum + Math.max(0, s.weight), 0);
  return Math.round((done / total) * 100);
}

/** `today` is a calendar day at 00:00 UTC. A step due today is not late yet. */
export function isStepLate(step: Pick<ProgressStep, "status" | "plannedEnd">, today: Date): boolean {
  if (step.status === "DONE" || !step.plannedEnd) return false;
  return step.plannedEnd.getTime() < today.getTime();
}

const CLOSED_STATUSES: ReadonlySet<SiteStatus> = new Set<SiteStatus>(["COMPLETED", "ARCHIVED"]);

export type SiteLateness = { late: boolean; lateSteps: ProgressStep[]; siteOverdue: boolean };

export function siteLateness(
  site: { status: SiteStatus; plannedEnd?: Date | null },
  steps: ProgressStep[],
  today: Date,
): SiteLateness {
  if (CLOSED_STATUSES.has(site.status)) return { late: false, lateSteps: [], siteOverdue: false };
  const lateSteps = steps.filter((s) => isStepLate(s, today));
  const siteOverdue = Boolean(site.plannedEnd && site.plannedEnd.getTime() < today.getTime());
  return { late: lateSteps.length > 0 || siteOverdue, lateSteps, siteOverdue };
}

/** The step in progress (lowest order), otherwise the first step to do. Null when everything is done. */
export function nextStep<T extends ProgressStep>(steps: T[]): T | null {
  const sorted = [...steps].sort((a, b) => a.order - b.order);
  return sorted.find((s) => s.status === "IN_PROGRESS") ?? sorted.find((s) => s.status === "TODO") ?? null;
}
