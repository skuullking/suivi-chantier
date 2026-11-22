import { describe, expect, it } from "vitest";
import { addDays, dayKeyInTimeZone, parseDateOnly } from "@/lib/dates";
import { db } from "@/server/db";
import { notifyUsers } from "@/server/services/notifications";
import { deliverPendingNotifications } from "@/server/services/notify-channels";
import { runDayBeforeReminders } from "@/server/services/reminders";
import { createSite } from "@/server/services/sites";
import { addMember, createOrganization } from "./helpers";

/** An instant at a given local hour in Paris for "today" (relative to the real date). */
function parisTime(hour: number) {
  const key = dayKeyInTimeZone(new Date(), "Europe/Paris");
  const base = parseDateOnly(key);
  // Paris is UTC+1 in winter, UTC+2 in summer: 12:00 UTC is always the same Paris day.
  const noonUtc = new Date(base.getTime() + 12 * 3600_000);
  const parisHourAtNoon = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Europe/Paris" }).format(
      noonUtc,
    ),
  );
  return new Date(noonUtc.getTime() + (hour - parisHourAtNoon) * 3600_000);
}

describe("day-before reminders", () => {
  it("tells each worker where he works tomorrow, once, after the reminder hour", async () => {
    const a = await createOrganization("Charpentes A");
    const worker = await addMember(a.organization.id, "WORKER", "Jean");
    const site = await createSite(a.ownerCtx, {
      newClient: { name: "M. Dupont" },
      info: { title: "Charpente Dupont", address: "8 chemin des Vignes", city: "Castanet" },
    });
    const tomorrow = addDays(parseDateOnly(dayKeyInTimeZone(new Date(), "Europe/Paris")), 1);
    await db.assignment.create({
      data: {
        organizationId: a.organization.id,
        siteId: site.id,
        userId: worker.user.id,
        date: tomorrow,
        startTime: "08:00",
      },
    });
    // Owner planned too: no reminder for non-workers.
    await db.assignment.create({
      data: { organizationId: a.organization.id, siteId: site.id, userId: a.owner.id, date: tomorrow },
    });

    expect(await runDayBeforeReminders(parisTime(10))).toEqual({ sent: 0 });
    expect(await runDayBeforeReminders(parisTime(19))).toEqual({ sent: 1 });
    expect(await runDayBeforeReminders(parisTime(20))).toEqual({ sent: 0 });
    const reminder = await db.notification.findFirstOrThrow({ where: { type: "reminder.tomorrow" } });
    expect(reminder.userId).toBe(worker.user.id);
    expect(reminder.title).toBe("Demain : chantier Charpente Dupont, 8 h");
  });
});

describe("notification delivery", () => {
  it("e-mails important notifications once and marks them delivered", async () => {
    const a = await createOrganization("Charpentes A");
    await notifyUsers([a.owner.id], {
      organizationId: a.organization.id,
      type: "problem.reported",
      title: "Problème signalé : Charpente Dupont",
      body: "Panne fendue",
      link: "/app",
    });
    await notifyUsers([a.owner.id], {
      organizationId: a.organization.id,
      type: "step.completed",
      title: "Étape terminée",
    });
    // notifyUsers outside a transaction delivers immediately.
    const mails = await db.messageLog.findMany({ where: { channel: "EMAIL", toAddress: a.owner.email } });
    expect(mails.map((m) => m.subject)).toContain("Problème signalé : Charpente Dupont");
    expect(mails.map((m) => m.subject)).not.toContain("Étape terminée");
    expect(await db.notification.count({ where: { deliveredAt: null } })).toBe(0);
    expect(await deliverPendingNotifications()).toEqual({ delivered: 0 });
  });
});
