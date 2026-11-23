import { Bell } from "lucide-react";
import { Suspense } from "react";
import { AppSidebar, ManagerTabBar, MobileNav } from "@/components/app/app-nav";
import { CommandPalette } from "@/components/app/command-palette";
import { NotificationBell } from "@/components/app/notification-bell";
import { UserMenu } from "@/components/app/user-menu";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/labels";
import { requireManager, type AuthContext } from "@/server/auth/context";
import { openInboxCount, pendingPhotoCount } from "@/server/services/counters";
import { listNotifications, unreadNotificationCount } from "@/server/services/notifications";

/** Notifications streamed after the page: the shell never waits for them. */
async function BellSlot({ ctx }: { ctx: AuthContext }) {
  const [notifications, unread] = await Promise.all([
    listNotifications(ctx, 8),
    unreadNotificationCount(ctx),
  ]);
  return (
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
  );
}

function BellFallback() {
  return (
    <Button variant="outline" size="icon" aria-label="Notifications" disabled>
      <Bell className="size-5" aria-hidden />
    </Button>
  );
}

export default async function BackOfficeLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireManager();
  // Not awaited: the counter is streamed into the menu badges (see AsyncCount in app-nav).
  const toSort = Promise.all([
    openInboxCount(ctx.organizationId),
    pendingPhotoCount(ctx.organizationId),
  ]).then(
    ([inbox, photos]) => inbox + photos,
    () => 0, // A failing counter must never break the menu.
  );
  const isOwner = ctx.role === "OWNER";

  return (
    <div className="bg-background flex min-h-screen">
      <AppSidebar organizationName={ctx.organization.name} isOwner={isOwner} inboxCount={toSort} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/95 border-ink-200 sticky top-0 z-30 flex h-[68px] items-center gap-2 border-b px-4 backdrop-blur sm:px-8">
          <MobileNav organizationName={ctx.organization.name} isOwner={isOwner} inboxCount={toSort} />
          <div className="flex flex-1 items-center">
            <CommandPalette />
          </div>
          <Suspense fallback={<BellFallback />}>
            <BellSlot ctx={ctx} />
          </Suspense>
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
