/** Planning conflicts (pure): the same person booked twice on overlapping slots of the same day. */
import type { Slot } from "@/generated/prisma/enums";

export type PlanningEntry = { id: string; userId: string; date: Date; slot: Slot; siteId: string };

export function slotsOverlap(a: Slot, b: Slot): boolean {
  return a === "FULL_DAY" || b === "FULL_DAY" || a === b;
}

/** Map assignment id → ids of the assignments it conflicts with. Entries without conflict are absent. */
export function findConflicts(entries: PlanningEntry[]): Map<string, string[]> {
  const byUserDay = new Map<string, PlanningEntry[]>();
  for (const e of entries) {
    const key = `${e.userId}|${e.date.toISOString().slice(0, 10)}`;
    const list = byUserDay.get(key);
    if (list) list.push(e);
    else byUserDay.set(key, [e]);
  }
  const conflicts = new Map<string, string[]>();
  for (const list of byUserDay.values()) {
    if (list.length < 2) continue;
    for (const a of list) {
      for (const b of list) {
        if (a.id !== b.id && slotsOverlap(a.slot, b.slot)) {
          const current = conflicts.get(a.id);
          if (current) current.push(b.id);
          else conflicts.set(a.id, [b.id]);
        }
      }
    }
  }
  return conflicts;
}

/** Conflicts that a new entry would create with existing ones. */
export function conflictsFor(
  candidate: Omit<PlanningEntry, "id">,
  existing: PlanningEntry[],
): PlanningEntry[] {
  const day = candidate.date.toISOString().slice(0, 10);
  return existing.filter(
    (e) =>
      e.userId === candidate.userId &&
      e.date.toISOString().slice(0, 10) === day &&
      slotsOverlap(e.slot, candidate.slot),
  );
}
