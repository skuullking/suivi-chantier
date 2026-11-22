import { AppSidebar, MobileNav } from "@/components/app/app-nav";
import { UserMenu } from "@/components/app/user-menu";
import { ROLE_LABELS } from "@/lib/labels";
import { requireManager } from "@/server/auth/context";
import { db } from "@/server/db";

export default async function BackOfficeLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireManager();
  const inboxCount = await db.inboxItem.count({
    where: { organizationId: ctx.organizationId, status: "OPEN" },
  });
  const isOwner = ctx.role === "OWNER";

  return (
    <div className="flex min-h-screen bg-stone-50">
      <AppSidebar organizationName={ctx.organization.name} isOwner={isOwner} inboxCount={inboxCount} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-white/90 px-4 backdrop-blur">
          <MobileNav organizationName={ctx.organization.name} isOwner={isOwner} inboxCount={inboxCount} />
          <div className="flex-1" id="app-header-slot" />
          <UserMenu name={ctx.user.name} email={ctx.user.email} roleLabel={ROLE_LABELS[ctx.role]} />
        </header>
        <main id="contenu" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
