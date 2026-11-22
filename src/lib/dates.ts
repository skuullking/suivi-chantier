/**
 * Calendar-day helpers. SQL `DATE` columns are represented as `Date` objects at 00:00 UTC; every helper here
 * works in UTC on such values. "Today" is computed in the organization's time zone, then converted.
 */

import { TZDate } from "@date-fns/tz";

const DAY_MS = 24 * 3600 * 1000;

/** "2026-11-23" → Date at 00:00 UTC. Throws on malformed input. */
export function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Date invalide : ${value}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime()) || toDateKey(date) !== value) throw new Error(`Date invalide : ${value}`);
  return date;
}

/** Same as parseDateOnly but returns null for empty / invalid values. */
export function parseDateOnlyOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  try {
    return parseDateOnly(value);
  } catch {
    return null;
  }
}

/** Date (00:00 UTC) → "YYYY-MM-DD". */
export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Calendar day key of an instant in a time zone (e.g. now in Europe/Paris). */
export function dayKeyInTimeZone(instant: Date, timeZone = "Europe/Paris"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Today in the given time zone, as a 00:00 UTC date. */
export function today(timeZone = "Europe/Paris", now = new Date()): Date {
  return parseDateOnly(dayKeyInTimeZone(now, timeZone));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const day = date.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

/** `count` consecutive days starting at `start`. */
export function eachDay(start: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

/** Weeks (Monday → Sunday) covering the month of `date`, for a month grid. */
export function monthGrid(date: Date): Date[][] {
  const first = startOfMonth(date);
  const last = addDays(addMonths(date, 1), -1);
  const gridStart = startOfWeek(first);
  const weeks: Date[][] = [];
  for (let cursor = gridStart; cursor <= last; cursor = addDays(cursor, 7)) {
    weeks.push(eachDay(cursor, 7));
  }
  return weeks;
}

export function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

/** ISO week number (used in planning headers). */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
}

/** UTC instants [start, end) of a calendar day ("YYYY-MM-DD") in a time zone. */
export function dayRangeInTimeZone(dayKey: string, timeZone = "Europe/Paris"): { start: Date; end: Date } {
  const [y, m, d] = dayKey.split("-").map(Number) as [number, number, number];
  const start = new TZDate(y, m - 1, d, 0, 0, 0, timeZone);
  const end = new TZDate(y, m - 1, d + 1, 0, 0, 0, timeZone);
  return { start: new Date(start.getTime()), end: new Date(end.getTime()) };
}

/** Hour (0-23) of an instant in a time zone. */
export function hourInTimeZone(instant: Date, timeZone = "Europe/Paris"): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone }).format(instant),
  );
}
