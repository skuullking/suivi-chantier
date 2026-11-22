export default function WorkerLoading() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Chargement">
      <div className="bg-ink-200 h-8 w-48 animate-pulse rounded-lg" />
      <div className="h-64 animate-pulse rounded-2xl bg-white" />
      <div className="h-24 animate-pulse rounded-2xl bg-white" />
    </div>
  );
}
