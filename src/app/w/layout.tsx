import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { requireAuth } from "@/server/auth/context";
import { today } from "@/lib/dates";
import { db } from "@/server/db";
import { NetworkBadge } from "./network-badge";
import { OfflineSync } from "./offline-sync";
import { WorkerTabBar } from "./tab-bar";

export const metadata: Metadata = { title: { default: "Terrain", template: "%s · ChantierLink" } };
export const viewport: Viewport = {
  themeColor: "#121212",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function WorkerLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAuth();
  // Pages pre-cached for offline use: the day and the sites of the day.
  const todaySites = await db.assignment.findMany({
    where: { organizationId: ctx.organizationId, userId: ctx.userId, date: today(ctx.organizationTimeZone) },
    select: { siteId: true },
    distinct: ["siteId"],
  });
  const offlineUrls = [
    "/w",
    "/w/photo",
    "/w/vocal",
    "/w/moi",
    ...todaySites.map((a) => `/w/chantier/${a.siteId}`),
  ];
  return (
    <div className="bg-background text-ink-900 flex min-h-dvh flex-col">
      <header className="bg-ink-900 sticky top-0 z-30 flex h-14 items-center gap-2 px-4 text-white">
        <Link
          href="/w"
          className="flex min-w-0 items-center gap-2 font-semibold"
          aria-label="Accueil terrain"
        >
          <LogoMark className="size-7" />
          <span className="truncate">{ctx.organization.name}</span>
        </Link>
        <NetworkBadge />
        {ctx.role !== "WORKER" ? (
          <Link
            href="/app"
            className="border-ink-700 ml-auto rounded-lg border px-3 py-1.5 text-sm font-semibold"
          >
            Bureau
          </Link>
        ) : null}
      </header>
      <main id="contenu" className="mx-auto w-full max-w-lg flex-1 px-4 pt-5 pb-32">
        {children}
      </main>
      <WorkerTabBar />
      <OfflineSync urls={offlineUrls} />
    </div>
  );
}
