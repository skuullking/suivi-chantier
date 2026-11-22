import Link from "next/link";
import { notFound } from "next/navigation";
import { LateBadge, ProgressBar, SiteStatusBadge } from "@/components/app/status";
import { requireManager } from "@/server/auth/context";
import { NotFoundError } from "@/server/errors";
import { getSite } from "@/server/services/sites";
import { SiteStatusMenu } from "./site-status-menu";
import { SiteTabs } from "./site-tabs";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireManager();
  const { id } = await params;
  const site = await getSite(ctx, id).catch(() => null);
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
  const site = await getSite(ctx, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-muted-foreground text-sm">
            <Link href="/app/chantiers" className="hover:underline">
              Chantiers
            </Link>{" "}
            / <span className="font-mono">{site.code}</span>
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">{site.title}</h1>
          <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-sm">
            <Link href={`/app/clients/${site.client.id}`} className="hover:underline">
              {site.client.name}
            </Link>
            <span aria-hidden>·</span>
            <span>
              {site.address}
              {site.city ? `, ${site.city}` : ""}
            </span>
            <SiteStatusBadge status={site.status} />
            {site.lateness.late ? <LateBadge /> : null}
          </p>
        </div>
        <div className="flex items-center gap-3 lg:w-96">
          <ProgressBar value={site.progress} className="flex-1" label="Progression du chantier" />
          <SiteStatusMenu siteId={site.id} status={site.status} />
        </div>
      </div>
      <SiteTabs siteId={site.id} hidden={["photos", "espace-client"]} />
      <div>{children}</div>
    </div>
  );
}
