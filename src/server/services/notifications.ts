/** In-app notifications (e-mail / push channels are added on top, see notify-channels). */
import type { ServiceContext } from "@/server/auth/context";
import { db, type Tx } from "@/server/db";

export type NotificationType =
  | "photos.pending"
  | "inbox.item"
  | "summary.ready"
  | "problem.reported"
  | "site.started"
  | "site.completed"
  | "step.completed"
  | "assignment.created"
  | "reminder.tomorrow"
  | "document.ready";

export type NotificationInput = {
  organizationId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
};

export async function notifyUsers(userIds: string[], input: NotificationInput, tx: Tx = db) {
  const unique = Array.from(new Set(userIds));
  if (unique.length === 0) return;
  await tx.notification.createMany({
    data: unique.map((userId) => ({
      organizationId: input.organizationId,
      userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    })),
  });
  // E-mail / push delivery once the transaction is committed: right after the HTTP response, or now when called
  // outside a transaction. The worker also delivers every minute.
  const { afterResponse, enqueue } = await import("@/server/jobs/queue");
  if (!afterResponse(() => enqueue("notifications.deliver", {})) && tx === db) {
    await enqueue("notifications.deliver", {}).catch(() => {});
  }
}

/** Notifies OWNER + OFFICE members (optionally excluding the author of the change). */
export async function notifyManagers(
  input: NotificationInput & { excludeUserId?: string; ownersOnly?: boolean },
  tx: Tx = db,
) {
  const managers = await tx.membership.findMany({
    where: {
      organizationId: input.organizationId,
      role: input.ownersOnly ? "OWNER" : { in: ["OWNER", "OFFICE"] },
    },
    select: { userId: true },
  });
  await notifyUsers(
    managers.map((m) => m.userId).filter((id) => id !== input.excludeUserId),
    input,
    tx,
  );
}

export async function listNotifications(ctx: ServiceContext, limit = 30) {
  return db.notification.findMany({
    where: { userId: ctx.userId, organizationId: ctx.organizationId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function unreadNotificationCount(ctx: ServiceContext) {
  return db.notification.count({
    where: { userId: ctx.userId, organizationId: ctx.organizationId, readAt: null },
  });
}

export async function markNotificationsRead(ctx: ServiceContext, ids?: string[]) {
  await db.notification.updateMany({
    where: {
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      readAt: null,
      ...(ids ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  });
}
