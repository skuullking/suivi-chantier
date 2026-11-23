import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeletons (loading.tsx). Besides the instant feedback, a loading boundary lets Next prefetch
 * dynamic routes up to it: the click on a link then switches screens without waiting for the server.
 */
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-5" aria-busy="true" aria-label="Chargement">
      {children}
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-64" />
      </div>
      <Skeleton className="h-10 w-40" />
    </div>
  );
}

/** Page header + list of rows (sites, clients, documents, team…). */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Wrapper>
      <HeaderSkeleton />
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="grid gap-2">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    </Wrapper>
  );
}

/** Week planning grid. */
export function BoardSkeleton() {
  return (
    <Wrapper>
      <HeaderSkeleton />
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 28 }, (_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    </Wrapper>
  );
}

/** Detail page: header, cards, main block. */
export function DetailSkeleton() {
  return (
    <Wrapper>
      <HeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-64" />
    </Wrapper>
  );
}

/** Settings / forms. */
export function FormSkeleton() {
  return (
    <Wrapper>
      <HeaderSkeleton />
      <div className="grid max-w-2xl gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="grid gap-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-10" />
          </div>
        ))}
      </div>
    </Wrapper>
  );
}
