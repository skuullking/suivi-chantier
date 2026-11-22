import { describe, expect, it } from "vitest";
import { addDays, isoWeek, monthGrid, parseDateOnly, startOfWeek, toDateKey, today } from "@/lib/dates";
import { clientSchema, siteInfoSchema, stepSchema, documentUpdateSchema } from "@/lib/validation/business";
import { conflictsFor, findConflicts, slotsOverlap } from "@/server/domain/planning";
import {
  computeProgress,
  isStepLate,
  nextStep,
  siteLateness,
  type ProgressStep,
} from "@/server/domain/progress";
import { toPrefixTsQuery } from "@/server/services/fts";
import { codePrefix } from "@/server/services/sites";

const step = (overrides: Partial<ProgressStep>): ProgressStep => ({
  id: Math.random().toString(36),
  title: "Étape",
  order: 1,
  status: "TODO",
  weight: 1,
  plannedEnd: null,
  ...overrides,
});

describe("computeProgress", () => {
  it("is 0 without steps", () => expect(computeProgress([])).toBe(0));
  it("uses equal weights by default", () => {
    expect(computeProgress([step({ status: "DONE" }), step({}), step({}), step({ status: "DONE" })])).toBe(
      50,
    );
  });
  it("ignores steps in progress", () => {
    expect(computeProgress([step({ status: "IN_PROGRESS" }), step({})])).toBe(0);
  });
  it("is weighted", () => {
    expect(computeProgress([step({ status: "DONE", weight: 3 }), step({ weight: 1 })])).toBe(75);
  });
  it("rounds and handles zero / negative weights", () => {
    expect(computeProgress([step({ status: "DONE" }), step({}), step({})])).toBe(33);
    expect(computeProgress([step({ status: "DONE", weight: 0 }), step({ weight: 0 })])).toBe(0);
    expect(computeProgress([step({ status: "DONE", weight: -5 }), step({ weight: 1 })])).toBe(0);
  });
  it("is 100 when everything is done", () => {
    expect(computeProgress([step({ status: "DONE", weight: 2 }), step({ status: "DONE" })])).toBe(100);
  });
});

describe("lateness", () => {
  const day = parseDateOnly("2026-11-22");
  it("a step is late when its planned end is past and it is not done", () => {
    expect(isStepLate({ status: "TODO", plannedEnd: parseDateOnly("2026-11-21") }, day)).toBe(true);
    expect(isStepLate({ status: "IN_PROGRESS", plannedEnd: parseDateOnly("2026-11-21") }, day)).toBe(true);
  });
  it("a step due today, done or without date is not late", () => {
    expect(isStepLate({ status: "TODO", plannedEnd: day }, day)).toBe(false);
    expect(isStepLate({ status: "DONE", plannedEnd: parseDateOnly("2026-01-01") }, day)).toBe(false);
    expect(isStepLate({ status: "TODO", plannedEnd: null }, day)).toBe(false);
  });
  it("a site is late with a late step or when its end date is past", () => {
    const late = step({ plannedEnd: parseDateOnly("2026-11-01") });
    expect(siteLateness({ status: "IN_PROGRESS" }, [late], day).late).toBe(true);
    expect(
      siteLateness({ status: "IN_PROGRESS", plannedEnd: parseDateOnly("2026-11-20") }, [], day),
    ).toMatchObject({
      late: true,
      siteOverdue: true,
    });
  });
  it("closed sites are never late", () => {
    const late = step({ plannedEnd: parseDateOnly("2026-11-01") });
    expect(siteLateness({ status: "COMPLETED" }, [late], day).late).toBe(false);
    expect(siteLateness({ status: "ARCHIVED", plannedEnd: parseDateOnly("2020-01-01") }, [], day).late).toBe(
      false,
    );
  });
  it("next step is the step in progress, then the first to do", () => {
    const steps = [
      step({ id: "a", order: 1, status: "DONE" }),
      step({ id: "b", order: 3, status: "TODO" }),
      step({ id: "c", order: 2, status: "TODO" }),
    ];
    expect(nextStep(steps)?.id).toBe("c");
    expect(nextStep([...steps, step({ id: "d", order: 4, status: "IN_PROGRESS" })])?.id).toBe("d");
    expect(nextStep([step({ status: "DONE" })])).toBeNull();
  });
});

describe("planning conflicts", () => {
  const d = parseDateOnly("2026-11-23");
  it("slots overlap unless morning/afternoon", () => {
    expect(slotsOverlap("FULL_DAY", "MORNING")).toBe(true);
    expect(slotsOverlap("MORNING", "MORNING")).toBe(true);
    expect(slotsOverlap("MORNING", "AFTERNOON")).toBe(false);
  });
  it("detects double bookings of the same person on the same day", () => {
    const conflicts = findConflicts([
      { id: "1", userId: "u1", date: d, slot: "FULL_DAY", siteId: "s1" },
      { id: "2", userId: "u1", date: d, slot: "MORNING", siteId: "s2" },
      { id: "3", userId: "u2", date: d, slot: "FULL_DAY", siteId: "s1" },
      { id: "4", userId: "u1", date: addDays(d, 1), slot: "FULL_DAY", siteId: "s2" },
    ]);
    expect(conflicts.get("1")).toEqual(["2"]);
    expect(conflicts.get("2")).toEqual(["1"]);
    expect(conflicts.has("3")).toBe(false);
    expect(conflicts.has("4")).toBe(false);
  });
  it("morning + afternoon is not a conflict", () => {
    const existing = [{ id: "1", userId: "u1", date: d, slot: "MORNING" as const, siteId: "s1" }];
    expect(conflictsFor({ userId: "u1", date: d, slot: "AFTERNOON", siteId: "s2" }, existing)).toHaveLength(
      0,
    );
    expect(conflictsFor({ userId: "u1", date: d, slot: "FULL_DAY", siteId: "s2" }, existing)).toHaveLength(1);
  });
});

describe("dates", () => {
  it("parses and formats calendar days in UTC", () => {
    expect(toDateKey(parseDateOnly("2026-02-28"))).toBe("2026-02-28");
    expect(() => parseDateOnly("2026-02-30")).toThrow();
    expect(() => parseDateOnly("28/02/2026")).toThrow();
  });
  it("computes today in the organization time zone", () => {
    // 23:30 UTC on Nov 22 is already Nov 23 in Paris.
    expect(toDateKey(today("Europe/Paris", new Date("2026-11-22T23:30:00Z")))).toBe("2026-11-23");
    expect(toDateKey(today("America/Martinique", new Date("2026-11-23T02:00:00Z")))).toBe("2026-11-22");
  });
  it("weeks start on Monday", () => {
    expect(toDateKey(startOfWeek(parseDateOnly("2026-11-22")))).toBe("2026-11-16"); // Sunday
    expect(toDateKey(startOfWeek(parseDateOnly("2026-11-23")))).toBe("2026-11-23"); // Monday
    expect(isoWeek(parseDateOnly("2026-01-01"))).toBe(1);
  });
  it("month grid covers the whole month in full weeks", () => {
    const grid = monthGrid(parseDateOnly("2026-11-15"));
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(toDateKey(grid[0]![0]!)).toBe("2026-10-26");
    // 30 November 2026 is a Monday: the last row runs until 6 December.
    expect(toDateKey(grid.at(-1)!.at(-1)!)).toBe("2026-12-06");
  });
});

describe("search and codes", () => {
  it("builds safe prefix queries", () => {
    expect(toPrefixTsQuery("Dupont  toit")).toBe("dupont:* & toit:*");
    expect(toPrefixTsQuery("DUP-1")).toBe("dup:* & 1:*");
    expect(toPrefixTsQuery("l'été & | ! :*")).toBe("l:* & été:*");
    expect(toPrefixTsQuery("  ")).toBeNull();
  });
  it("derives a short site code prefix from the client name", () => {
    expect(codePrefix("M. et Mme Dupont")).toBe("DUP");
    expect(codePrefix("SCI Les Tilleuls")).toBe("TIL");
    expect(codePrefix("Lé")).toBe("LEX");
    expect(codePrefix("")).toBe("CHA");
  });
});

describe("business validation", () => {
  it("parses client lists and checks e-mails", () => {
    const ok = clientSchema.parse({
      name: "Dupont",
      emails: "A@exemple.fr, b@exemple.fr",
      phones: "06 12 34 56 78",
      tags: "vip, vip ,  parrainage",
      consentCommunications: "on",
    });
    expect(ok.emails).toEqual(["A@exemple.fr", "b@exemple.fr"]);
    expect(ok.tags).toEqual(["vip", "parrainage"]);
    expect(ok.consentCommunications).toBe(true);
    expect(clientSchema.safeParse({ name: "Dupont", emails: "pas-un-email" }).success).toBe(false);
    expect(clientSchema.safeParse({ name: "D" }).success).toBe(false);
  });
  it("rejects a site ending before it starts", () => {
    const r = siteInfoSchema.safeParse({
      title: "Chantier",
      address: "1 rue",
      plannedStart: "2026-12-10",
      plannedEnd: "2026-12-01",
    });
    expect(r.success).toBe(false);
  });
  it("bounds step weights", () => {
    expect(stepSchema.safeParse({ title: "Pose", weight: "101" }).success).toBe(false);
    expect(stepSchema.parse({ title: "Pose", weight: "2" }).weight).toBe(2);
  });
  it("parses French amounts in cents", () => {
    expect(documentUpdateSchema.parse({ name: "F", type: "INVOICE", amount: "1 234,56" }).amount).toBe(
      123456,
    );
    expect(documentUpdateSchema.safeParse({ name: "F", type: "INVOICE", amount: "12,345" }).success).toBe(
      false,
    );
  });
});
