import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { organizationSettingsSchema, validationSettingsSchema } from "@/lib/validation/business";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import {
  listNotifications,
  markNotificationsRead,
  unreadNotificationCount,
} from "@/server/services/notifications";
import {
  deletePushSubscription,
  deliverPendingNotifications,
  pushEnabled,
  savePushSubscription,
} from "@/server/services/notify-channels";
import {
  getOrganization,
  listAuditLog,
  updateOrganization,
  updateValidationSettings,
} from "@/server/services/settings";
import { addMember, createOrganization } from "./helpers";

// Web Push is mocked (no network); fake VAPID keys are enough to enable delivery.
const webpush = vi.hoisted(() => {
  process.env.VAPID_PUBLIC_KEY = "test-public-key";
  process.env.VAPID_PRIVATE_KEY = "test-private-key";
  return { setVapidDetails: vi.fn(), sendNotification: vi.fn() };
});
vi.mock("web-push", () => webpush);

afterAll(() => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
});

beforeEach(() => {
  webpush.sendNotification.mockReset();
  webpush.sendNotification.mockResolvedValue({ statusCode: 201 });
});

async function setup() {
  const a = await createOrganization("Charpentes A");
  const b = await createOrganization("Menuiserie B");
  const office = await addMember(a.organization.id, "OFFICE", "Bureau");
  const worker = await addMember(a.organization.id, "WORKER", "Ouvrier");
  return { a, b, office, worker };
}

function notification(organizationId: string, userId: string, type: string, title: string) {
  return db.notification.create({ data: { organizationId, userId, type, title, link: "/app/a-traiter" } });
}

describe("paramètres de l'entreprise", () => {
  it("le patron modifie les informations de l'entreprise, c'est audité", async () => {
    const { a } = await setup();
    await updateOrganization(
      a.ownerCtx,
      organizationSettingsSchema.parse({
        name: "Charpentes Martin et Fils",
        trade: "JOINER",
        phone: "05 61 00 00 00",
        email: "Contact@Martin.fr",
        address: "1 zone artisanale, Castanet",
        timezone: "Europe/Paris",
      }),
    );
    const org = await getOrganization(a.ownerCtx);
    expect(org).toMatchObject({
      name: "Charpentes Martin et Fils",
      trade: "JOINER",
      phone: "05 61 00 00 00",
      email: "contact@martin.fr",
      address: "1 zone artisanale, Castanet",
    });
    expect(await db.auditLog.count({ where: { action: "organization.update" } })).toBe(1);
  });

  it("le patron change les réglages de validation, avec l'avant / après dans l'audit", async () => {
    const { a } = await setup();
    await updateValidationSettings(
      a.ownerCtx,
      validationSettingsSchema.parse({
        photosAutoApprove: "on",
        summaryAutoSend: "on",
        summaryHour: "17",
        reminderHour: "20",
      }),
    );
    const org = await getOrganization(a.ownerCtx);
    expect(org).toMatchObject({
      photosAutoApprove: true,
      officeCanValidatePhotos: false,
      summaryAutoSend: true,
      summaryHour: 17,
      reminderHour: 20,
    });
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "settings.validation" } });
    expect(log.before).toMatchObject({ photosAutoApprove: false, summaryHour: 18 });
    expect(log.after).toMatchObject({ photosAutoApprove: true, summaryHour: 17 });
  });

  it("refuse des heures hors plage", () => {
    expect(validationSettingsSchema.safeParse({ summaryHour: "8", reminderHour: "19" }).success).toBe(false);
    expect(validationSettingsSchema.safeParse({ summaryHour: "18", reminderHour: "24" }).success).toBe(false);
  });

  it("le bureau et les ouvriers ne changent pas les paramètres", async () => {
    const { a, office, worker } = await setup();
    const info = organizationSettingsSchema.parse({ name: "Pirate", trade: "OTHER" });
    const validation = validationSettingsSchema.parse({ summaryHour: "18", reminderHour: "19" });
    for (const ctx of [office.ctx, worker.ctx]) {
      await expect(updateOrganization(ctx, info)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(updateValidationSettings(ctx, validation)).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect((await getOrganization(a.ownerCtx)).name).not.toBe("Pirate");
  });
});

describe("journal d'audit", () => {
  it("liste les actions de l'organisation, avec le nom de l'auteur, du plus récent au plus ancien", async () => {
    const { a, b, office } = await setup();
    await db.auditLog.createMany({
      data: [
        {
          organizationId: a.organization.id,
          actorId: office.user.id,
          action: "client.create",
          entityType: "client",
        },
        {
          organizationId: a.organization.id,
          actorId: null,
          action: "retention.purge",
          entityType: "organization",
        },
        {
          organizationId: b.organization.id,
          actorId: b.owner.id,
          action: "client.create",
          entityType: "client",
        },
      ],
    });
    const { rows, total } = await listAuditLog(a.ownerCtx);
    expect(rows.every((r) => r.organizationId === a.organization.id)).toBe(true);
    expect(total).toBe(rows.length);
    expect(rows.find((r) => r.action === "client.create")?.actorName).toBe(office.user.name);
    expect(rows.find((r) => r.action === "retention.purge")?.actorName).toBe("Système");
    const times = rows.map((r) => r.createdAt.getTime());
    expect([...times].sort((x, y) => y - x)).toEqual(times);
  });

  it("affiche « Utilisateur supprimé » quand l'auteur n'existe plus", async () => {
    const { a, office } = await setup();
    await db.auditLog.create({
      data: {
        organizationId: a.organization.id,
        actorId: office.user.id,
        action: "client.update",
        entityType: "client",
      },
    });
    await db.user.delete({ where: { id: office.user.id } });
    const { rows } = await listAuditLog(a.ownerCtx);
    expect(rows.find((r) => r.action === "client.update")?.actorName).toBe("Utilisateur supprimé");
  });

  it("pagine par 50", async () => {
    const { a } = await setup();
    await db.auditLog.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({
        organizationId: a.organization.id,
        action: "document.upload",
        entityType: "document",
        entityId: `doc-${i}`,
      })),
    });
    const first = await listAuditLog(a.ownerCtx, 1);
    const second = await listAuditLog(a.ownerCtx, 2);
    expect(first.rows).toHaveLength(50);
    expect(first.pages).toBe(2);
    expect(second.rows.length).toBe(first.total - 50);
    const ids = new Set([...first.rows, ...second.rows].map((r) => r.id));
    expect(ids.size).toBe(first.total);
  });

  it("est réservé au patron", async () => {
    const { office, worker } = await setup();
    await expect(listAuditLog(office.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listAuditLog(worker.ctx)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("notifications dans l'application", () => {
  it("chacun ne voit que les siennes, les plus récentes d'abord", async () => {
    const { a, b, office } = await setup();
    const older = await notification(a.organization.id, office.user.id, "photos.pending", "Ancienne");
    await db.notification.update({
      where: { id: older.id },
      data: { createdAt: new Date(Date.now() - 60_000) },
    });
    const newer = await notification(a.organization.id, office.user.id, "problem.reported", "Récente");
    await notification(a.organization.id, a.owner.id, "photos.pending", "Pour le patron");
    await notification(b.organization.id, b.owner.id, "photos.pending", "Chez B");

    const list = await listNotifications(office.ctx);
    expect(list.map((n) => n.id)).toEqual([newer.id, older.id]);
    expect(await listNotifications(office.ctx, 1)).toHaveLength(1);
    expect(await unreadNotificationCount(office.ctx)).toBe(2);
  });

  it("marque comme lues une sélection, puis tout, sans toucher celles des autres", async () => {
    const { a, office } = await setup();
    const one = await notification(a.organization.id, office.user.id, "photos.pending", "Une");
    await notification(a.organization.id, office.user.id, "photos.pending", "Deux");
    const ownerNotif = await notification(a.organization.id, a.owner.id, "photos.pending", "Patron");

    await markNotificationsRead(office.ctx, [one.id, ownerNotif.id]);
    expect(await unreadNotificationCount(office.ctx)).toBe(1);
    expect((await db.notification.findUniqueOrThrow({ where: { id: ownerNotif.id } })).readAt).toBeNull();

    await markNotificationsRead(office.ctx);
    expect(await unreadNotificationCount(office.ctx)).toBe(0);
    expect(await unreadNotificationCount(a.ownerCtx)).toBe(1);
  });
});

describe("notifications push", () => {
  const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: "cle-p256dh", auth: "cle-auth" } });

  it("enregistre un abonnement, le transfère si l'appareil change de compte, et le supprime", async () => {
    const { a, office } = await setup();
    await savePushSubscription(office.user.id, sub("https://push.example/abc"));
    await savePushSubscription(office.user.id, {
      ...sub("https://push.example/abc"),
      keys: { p256dh: "nouvelle", auth: "x" },
    });
    expect(await db.pushSubscription.count()).toBe(1);
    expect((await db.pushSubscription.findFirstOrThrow()).p256dh).toBe("nouvelle");

    await savePushSubscription(a.owner.id, sub("https://push.example/abc"));
    expect((await db.pushSubscription.findFirstOrThrow()).userId).toBe(a.owner.id);

    await deletePushSubscription(office.user.id, "https://push.example/abc");
    expect(await db.pushSubscription.count()).toBe(1);
    await deletePushSubscription(a.owner.id, "https://push.example/abc");
    expect(await db.pushSubscription.count()).toBe(0);
  });

  it("envoie chaque notification une seule fois sur tous les appareils et oublie les abonnements expirés", async () => {
    const { a, office } = await setup();
    expect(pushEnabled()).toBe(true);
    await savePushSubscription(office.user.id, sub("https://push.example/telephone"));
    await savePushSubscription(office.user.id, sub("https://push.example/ancien"));
    webpush.sendNotification.mockImplementation(async (subscription: { endpoint: string }) => {
      if (subscription.endpoint.endsWith("ancien"))
        throw Object.assign(new Error("Gone"), { statusCode: 410 });
      return { statusCode: 201 };
    });
    const n = await notification(a.organization.id, office.user.id, "photos.pending", "Nouvelles photos");

    const first = await deliverPendingNotifications();
    expect(first.delivered).toBe(1);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(webpush.sendNotification.mock.calls[0]![1] as string);
    expect(payload).toMatchObject({ title: "Nouvelles photos", url: "/app/a-traiter" });
    expect((await db.notification.findUniqueOrThrow({ where: { id: n.id } })).deliveredAt).not.toBeNull();
    expect((await db.pushSubscription.findMany()).map((s) => s.endpoint)).toEqual([
      "https://push.example/telephone",
    ]);

    const second = await deliverPendingNotifications();
    expect(second.delivered).toBe(0);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
  });

  it("une panne passagère du service push ne supprime pas l'abonnement", async () => {
    const { a, office } = await setup();
    await savePushSubscription(office.user.id, sub("https://push.example/telephone"));
    webpush.sendNotification.mockRejectedValue(Object.assign(new Error("Busy"), { statusCode: 503 }));
    await notification(a.organization.id, office.user.id, "photos.pending", "Nouvelles photos");
    await deliverPendingNotifications();
    expect(await db.pushSubscription.count()).toBe(1);
  });
});
