import Link from "next/link";
import { LateBadge, ProgressBar, SiteStatusBadge, StepRibbon } from "@/components/app/status";
import { requireManager } from "@/server/auth/context";
import { loadSite } from "./site-data";
import { SiteStatusMenu } from "./site-status-menu";
import { SiteTabs } from "./site-tabs";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireManager();
  const { id } = await params;
  // loadSite is memoized per request: shared with the layout and the page (no extra query).
  const site = await loadSite(ctx, id).catch(() => null);
  return { title: site ? site.title : "Chantier" };
}

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireManager();
  const { id } = await params;
  const site = await loadSite(ctx, id);

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="label-mono text-ink-600">
            <Link href="/app/chantiers" className="hover:underline">
              Chantiers
            </Link>{" "}
            / {site.code}
          </p>
          <h1 className="text-ink-900 mt-2 text-3xl leading-none font-extrabold sm:text-[2.6rem]">
            {site.title}
          </h1>
          <p className="text-ink-700 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            <Link href={`/app/clients/${site.client.id}`} className="font-medium hover:underline">
              {site.client.name}
            </Link>
            <span>
              {site.address}
              {site.city ? `, ${site.city}` : ""}
            </span>
            <SiteStatusBadge status={site.status} />
            {site.lateness.late ? <LateBadge /> : null}
          </p>
        </div>
        <div className="flex items-center gap-3 lg:w-[400px]">
          <div className="min-w-0 flex-1">
            <StepRibbon steps={site.steps} size="sm" className="mb-2" />
            <ProgressBar value={site.progress} label="Progression du chantier" />
          </div>
          <SiteStatusMenu siteId={site.id} status={site.status} />
        </div>
      </div>
      <SiteTabs siteId={site.id} />
      <div>{children}</div>
    </div>
  );
}
