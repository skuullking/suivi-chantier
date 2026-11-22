/** French formatting helpers (dates in Europe/Paris unless a timezone is given). */
const DEFAULT_TZ = "Europe/Paris";

export function formatDate(date: Date | string | null | undefined, timeZone = DEFAULT_TZ): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone }).format(new Date(date));
}

export function formatDateLong(date: Date | string, timeZone = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string | null | undefined, timeZone = DEFAULT_TZ): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone }).format(
    new Date(date),
  );
}

export function formatTime(date: Date | string, timeZone = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone }).format(
    new Date(date),
  );
}

/** Dates stored as SQL DATE come back at 00:00 UTC: format them in UTC to avoid off-by-one days. */
export function formatDay(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(date));
}

export function formatDayLong(date: Date | string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(date));
}

export function formatAmount(cents: number | null | undefined, currency = "EUR"): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(cents / 100);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const units = ["Ko", "Mo", "Go", "To"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ${units[i]}`;
}

export function formatRelative(date: Date | string, now = new Date()): string {
  const diffMs = new Date(date).getTime() - now.getTime();
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  const minutes = Math.round(diffMs / 60000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return rtf.format(days, "day");
  return formatDate(date);
}
