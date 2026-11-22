/**
 * Delivery of in-app notifications by e-mail and Web Push. Notifications are created inside business
 * transactions; delivery happens afterwards (right after the request, and every minute by the worker).
 */
import * as webpush from "web-push";
import { mailProvider, renderEmail } from "@/server/adapters/mail";
import { db } from "@/server/db";
import { appUrl, env } from "@/server/env";
import { logger } from "@/server/logger";

/** Types that also go by e-mail (the others stay in-app + push). */
const EMAIL_TYPES = new Set([
  "problem.reported",
  "summary.ready",
  "site.completed",
  "reminder.tomorrow",
  "assignment.created",
  "document.ready",
]);

let vapidConfigured: boolean | null = null;

export function pushEnabled(): boolean {
  if (vapidConfigured !== null) return vapidConfigured;
  const e = env();
  vapidConfigured = Boolean(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY);
  if (vapidConfigured) webpush.setVapidDetails(e.VAPID_SUBJECT, e.VAPID_PUBLIC_KEY!, e.VAPID_PRIVATE_KEY!);
  return vapidConfigured;
}

export async function savePushSubscription(
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
) {
  await db.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    update: { userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
  });
}

export async function deletePushSubscription(userId: string, endpoint: string) {
  await db.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

async function push(userId: string, payload: { title: string; body?: string | null; url: string }) {
  if (!pushEnabled()) return;
  const subscriptions = await db.pushSubscription.findMany({ where: { userId } });
  await Promise.all(
    subscriptions.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 12 * 3600 },
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410)
          await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else logger.warn({ err: error }, "Notification push impossible");
      }
    }),
  );
}

/** Sends the pending notifications (idempotent: each one is delivered once). */
export async function deliverPendingNotifications(limit = 200) {
  const pending = await db.notification.findMany({
    where: { deliveredAt: null, createdAt: { gt: new Date(Date.now() - 2 * 86_400_000) } },
    include: { user: { select: { email: true, name: true } }, organization: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let delivered = 0;
  for (const n of pending) {
    // Claim the notification first so that two workers never send it twice.
    const claimed = await db.notification.updateMany({
      where: { id: n.id, deliveredAt: null },
      data: { deliveredAt: new Date() },
    });
    if (claimed.count === 0) continue;
    const url = appUrl(n.link ?? "/app");
    try {
      if (EMAIL_TYPES.has(n.type) && !n.readAt) {
        const email = renderEmail({
          title: n.title,
          paragraphs: [`Bonjour ${n.user.name.split(" ")[0]},`, ...(n.body ? [n.body] : [])],
          cta: { label: "Ouvrir ChantierLink", url },
          footer: `${n.organization.name} · notification ChantierLink`,
        });
        await mailProvider().send({
          to: n.user.email,
          subject: n.title,
          html: email.html,
          text: email.text,
          organizationId: n.organizationId,
        });
      }
      await push(n.userId, { title: n.title, body: n.body, url: n.link ?? "/app" });
      delivered++;
    } catch (error) {
      logger.error({ err: error, notificationId: n.id }, "Envoi d'une notification impossible");
    }
  }
  return { delivered };
}
