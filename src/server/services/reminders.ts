/** Day-before reminder for the team: « Demain : chantier Dupont, 8 h ». Sent once per person and day. */
import { addDays, dayKeyInTimeZone, dayRangeInTimeZone, hourInTimeZone, parseDateOnly } from "@/lib/dates";
import { SLOT_LABELS } from "@/lib/labels";
import { db } from "@/server/db";
import { logger } from "@/server/logger";
import { notifyUsers } from "./notifications";

function when(a: { startTime: string | null; slot: "FULL_DAY" | "MORNING" | "AFTERNOON" }) {
  if (a.startTime) return a.startTime.replace(/^0/, "").replace(":00", " h").replace(":", " h ");
  return SLOT_LABELS[a.slot].toLowerCase();
}

export async function runDayBeforeReminders(now = new Date()) {
  const orgs = await db.organization.findMany({ select: { id: true, timezone: true, reminderHour: true } });
  let sent = 0;
  for (const org of orgs) {
    if (hourInTimeZone(now, org.timezone) < org.reminderHour) continue;
    const todayKey = dayKeyInTimeZone(now, org.timezone);
    const tomorrow = addDays(parseDateOnly(todayKey), 1);
    const { start } = dayRangeInTimeZone(todayKey, org.timezone);
    const assignments = await db.assignment.findMany({
      where: {
        organizationId: org.id,
        date: tomorrow,
        user: { memberships: { some: { organizationId: org.id, role: "WORKER" } } },
      },
      include: { site: { select: { title: true, city: true } } },
      orderBy: [{ userId: "asc" }, { startTime: "asc" }],
    });
    const byUser = new Map<string, typeof assignments>();
    for (const a of assignments) byUser.set(a.userId, [...(byUser.get(a.userId) ?? []), a]);
    for (const [userId, list] of byUser) {
      const already = await db.notification.findFirst({
        where: { userId, organizationId: org.id, type: "reminder.tomorrow", createdAt: { gte: start } },
      });
      if (already) continue;
      try {
        const text = list.map((a) => `chantier ${a.site.title}, ${when(a)}`).join(" puis ");
        await notifyUsers([userId], {
          organizationId: org.id,
          type: "reminder.tomorrow",
          title: `Demain : ${text}`,
          body: list.map((a) => [a.site.title, a.site.city].filter(Boolean).join(" — ")).join("\n"),
          link: "/w",
        });
        sent++;
      } catch (error) {
        logger.error({ err: error, userId }, "Rappel de la veille impossible");
      }
    }
  }
  return { sent };
}
