import { Skeleton } from "@/components/ui/skeleton";

/** Tab switch inside a site: the site header (layout) stays on screen, only the tab content waits. */
export default function SiteTabLoading() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Chargement">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
