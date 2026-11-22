import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { requireAuth } from "@/server/auth/context";
import { WorkerTabBar } from "./tab-bar";

export const metadata: Metadata = { title: { default: "Terrain", template: "%s · ChantierLink" } };
export const viewport: Viewport = {
  themeColor: "#c2410c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function WorkerLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAuth();
  return (
    <div className="flex min-h-dvh flex-col bg-stone-100 text-stone-900">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 bg-orange-700 px-4 text-white shadow">
        <Link href="/w" className="flex items-center gap-2 font-semibold" aria-label="Accueil terrain">
          <LogoMark className="size-7" />
          <span className="truncate">{ctx.organization.name}</span>
        </Link>
        {ctx.role !== "WORKER" ? (
          <Link href="/app" className="ml-auto rounded-md bg-white/15 px-3 py-1.5 text-sm font-medium">
            Bureau
          </Link>
        ) : null}
      </header>
      <main id="contenu" className="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-28">
        {children}
      </main>
      <WorkerTabBar />
    </div>
  );
}
