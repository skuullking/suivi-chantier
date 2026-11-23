import type { BoardAssignment } from "@/components/app/planning-board";
import {
  addDays,
  addMonths,
  eachDay,
  isoWeek,
  monthGrid,
  parseDateOnlyOrNull,
  startOfMonth,
  startOfWeek,
  toDateKey,
  today,
} from "@/lib/dates";
import type { ServiceContext } from "@/server/auth/context";
import { db } from "@/server/db";
import { listAssignments } from "@/server/services/planning";

const weekdayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" });
const dayFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

export type PlanningParams = { vue?: string; date?: string; par?: string };

export async function buildBoard(ctx: ServiceContext, sp: PlanningParams, siteId?: string) {
  const view = sp.vue === "mois" ? "month" : "week";
  const now = today(ctx.organizationTimeZone);
  const anchor = parseDateOnlyOrNull(sp.date) ?? now;
  const todayKey = toDateKey(now);
  const col = (d: Date, outside = false) => ({
    key: toDateKey(d),
    label: dayFmt.format(d),
    weekday: weekdayFmt.format(d).replace(".", ""),
    isToday: toDateKey(d) === todayKey,
    outside,
  });

  let from: Date;
  let to: Date;
  let days: ReturnType<typeof col>[] = [];
  let weeks: ReturnType<typeof col>[][] | undefined;
  let title: string;
  let prev: Date;
  let next: Date;
  if (view === "week") {
    from = startOfWeek(anchor);
    to = addDays(from, 6);
    days = eachDay(from, 7).map((d) => col(d));
    title = `Semaine ${isoWeek(from)} — du ${dayFmt.format(from)} au ${dayFmt.format(to)}`;
    prev = addDays(from, -7);
    next = addDays(from, 7);
  } else {
    const month = startOfMonth(anchor);
    const grid = monthGrid(month);
    from = grid[0]![0]!;
    to = grid.at(-1)!.at(-1)!;
    weeks = grid.map((w) => w.map((d) => col(d, d.getUTCMonth() !== month.getUTCMonth())));
    const label = monthFmt.format(month);
    title = label.charAt(0).toUpperCase() + label.slice(1);
    prev = addMonths(month, -1);
    next = addMonths(month, 1);
  }

  const [assignments, members, sites, steps] = await Promise.all([
    listAssignments(ctx, { from, to, siteId }),
    db.membership.findMany({
      where: { organizationId: ctx.organizationId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: [{ role: "desc" }, { createdAt: "asc" }],
    }),
    db.site.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...(siteId ? { id: siteId } : { status: { in: ["DRAFT", "PLANNED", "IN_PROGRESS", "PAUSED"] } }),
      },
      select: { id: true, title: true, code: true, client: { select: { name: true } } },
      orderBy: { title: "asc" },
    }),
    db.siteStep.findMany({
      where: { organizationId: ctx.organizationId, ...(siteId ? { siteId } : {}), status: { not: "DONE" } },
      select: { id: true, title: true, siteId: true },
      orderBy: { order: "asc" },
    }),
  ]);
  const boardAssignments: BoardAssignment[] = assignments.map((a) => ({
    id: a.id,
    date: toDateKey(a.date),
    userId: a.userId,
    userName: a.user.name,
    siteId: a.siteId,
    siteTitle: a.site.title,
    siteCode: a.site.code,
    slot: a.slot,
    startTime: a.startTime,
    stepId: a.stepId,
    instructions: a.instructions,
    conflict: a.conflictIds.length > 0,
  }));
  const stepsBySite: Record<string, { value: string; label: string }[]> = {};
  for (const s of steps) (stepsBySite[s.siteId] ??= []).push({ value: s.id, label: s.title });

  return {
    view: view as "week" | "month",
    title,
    days,
    weeks,
    prevKey: toDateKey(prev),
    nextKey: toDateKey(next),
    todayKey,
    assignments: boardAssignments,
    conflictCount: boardAssignments.filter((a) => a.conflict).length,
    memberRows: members.map((m) => ({ id: m.userId, label: m.user.name })),
    siteRows: sites.map((s) => ({ id: s.id, label: s.title, sublabel: `${s.code} · ${s.client.name}` })),
    memberOptions: members.map((m) => ({ value: m.userId, label: m.user.name })),
    siteOptions: sites.map((s) => ({ value: s.id, label: `${s.title} (${s.code})` })),
    stepsBySite,
  };
}
