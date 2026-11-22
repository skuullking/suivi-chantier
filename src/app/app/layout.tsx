import { AppSidebar, ManagerTabBar, MobileNav } from "@/components/app/app-nav";
import { CommandPalette } from "@/components/app/command-palette";
import { NotificationBell } from "@/components/app/notification-bell";
import { UserMenu } from "@/components/app/user-menu";
import { formatRelative } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/labels";
import { requireManager } from "@/server/auth/context";
import { db } from "@/server/db";
import { listNotifications, unreadNotificationCount } from "@/server/services/notifications";

export default async function BackOfficeLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireManager();
  const [inboxCount, pendingPhotos, notifications, unread] = await Promise.all([
    db.inboxItem.count({ where: { organizationId: ctx.organizationId, status: "OPEN" } }),
    db.media.count({
      where: { organizationId: ctx.organizationId, kind: "PHOTO", validationStatus: "PENDING" },
    }),
    listNotifications(ctx, 8),
    unreadNotificationCount(ctx),
  ]);
  const isOwner = ctx.role === "OWNER";
  const toSort = inboxCount + pendingPhotos;

  return (
    <div className="bg-background flex min-h-screen">
      <AppSidebar organizationName={ctx.organization.name} isOwner={isOwner} inboxCount={toSort} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/95 border-ink-200 sticky top-0 z-30 flex h-[68px] items-center gap-2 border-b px-4 backdrop-blur sm:px-8">
          <MobileNav organizationName={ctx.organization.name} isOwner={isOwner} inboxCount={toSort} />
          <div className="flex flex-1 items-center">
            <CommandPalette />
          </div>
          <NotificationBell
            unread={unread}
            items={notifications.map((n) => ({
              id: n.id,
              title: n.title,
              body: n.body,
              link: n.link,
              createdAt: formatRelative(n.createdAt),
              read: Boolean(n.readAt),
            }))}
          />
          <UserMenu name={ctx.user.name} email={ctx.user.email} roleLabel={ROLE_LABELS[ctx.role]} />
        </header>
        <main id="contenu" className="w-full max-w-[1240px] flex-1 px-4 pt-7 pb-28 sm:px-8 lg:pb-12">
          {children}
        </main>
      </div>
      <ManagerTabBar inboxCount={toSort} />
    </div>
  );
}
