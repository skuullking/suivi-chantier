import { Camera, Mic } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/page-header";
import { toGridPhotos } from "@/components/app/photo-data";
import { PhotoGrid } from "@/components/app/photo-grid";
import { formatDateTime, formatDayLong } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireManager } from "@/server/auth/context";
import { can } from "@/server/permissions/can";
import { listSiteMedia, mediaUrls } from "@/server/services/media";
import { loadSite } from "../site-data";

const FILTERS = [
  { key: "", label: "Toutes" },
  { key: "PENDING", label: "À valider" },
  { key: "APPROVED", label: "Validées" },
  { key: "REJECTED", label: "Refusées" },
] as const;

export default async function SitePhotosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ statut?: string; etape?: string; vue?: string }>;
}) {
  const ctx = await requireManager();
  const { id } = await params;
  const sp = await searchParams;
  const status = FILTERS.find((f) => f.key === sp.statut && f.key)?.key || undefined;
  const [site, media] = await Promise.all([
    loadSite(ctx, id),
    listSiteMedia(ctx, id, { status, stepId: sp.etape || undefined }),
  ]);
  const photos = media.filter((m) => m.kind === "PHOTO");
  const voices = media.filter((m) => m.kind !== "PHOTO");
  const canValidate = can(ctx.actor, "media.validate", { organizationId: ctx.organizationId });
  const byStep = sp.vue !== "date";
  const href = (patch: Record<string, string>) =>
    `?${new URLSearchParams({ ...(sp as Record<string, string>), ...patch }).toString()}`;

  // Groups: by step (template order) or by day.
  const groups: { key: string; title: string; items: typeof photos }[] = [];
  if (byStep) {
    for (const step of [...site.steps, { id: "", title: "Sans étape" }]) {
      const items = photos.filter((p) => (p.stepId ?? "") === step.id);
      if (items.length) groups.push({ key: step.id || "none", title: step.title, items });
    }
  } else {
    for (const p of photos) {
      const key = (p.capturedAt ?? p.receivedAt).toISOString().slice(0, 10);
      const g = groups.find((x) => x.key === key);
      if (g) g.items.push(p);
      else groups.push({ key, title: formatDayLong(new Date(`${key}T00:00:00Z`)), items: [p] });
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex rounded-lg border bg-white p-0.5" aria-label="Filtrer par statut">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={href({ statut: f.key })}
              aria-current={(status ?? "") === f.key ? "true" : undefined}
              className={cn(
                "rounded-md px-3 py-1 text-sm",
                (status ?? "") === f.key ? "bg-ink-100 font-semibold" : "text-ink-600",
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <nav className="flex rounded-lg border bg-white p-0.5" aria-label="Regrouper">
          <Link
            href={href({ vue: "etape" })}
            className={cn("rounded-md px-3 py-1 text-sm", byStep && "bg-ink-100 font-semibold")}
          >
            Par étape
          </Link>
          <Link
            href={href({ vue: "date" })}
            className={cn("rounded-md px-3 py-1 text-sm", !byStep && "bg-ink-100 font-semibold")}
          >
            Par date
          </Link>
        </nav>
        <span className="text-muted-foreground ml-auto text-sm">{photos.length} photo(s)</span>
      </div>

      {photos.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="Aucune photo"
          description="Les photos envoyées par l'équipe (application ou WhatsApp) apparaissent ici."
        />
      ) : (
        groups.map((g) => (
          <section key={g.key} className="grid gap-2">
            <h2 className="font-semibold capitalize">
              {g.title} <span className="text-muted-foreground text-sm font-normal">({g.items.length})</span>
            </h2>
            <PhotoGrid photos={toGridPhotos(g.items)} canValidate={canValidate} />
          </section>
        ))
      )}

      {voices.length ? (
        <section className="grid gap-2">
          <h2 className="font-semibold">Vocaux et vidéos</h2>
          <ul className="grid gap-2">
            {voices.map((v) => (
              <li
                key={v.id}
                className="grid gap-2 rounded-xl border bg-white p-3 sm:grid-cols-[auto_1fr] sm:items-center"
              >
                <span className="flex items-center gap-2 text-sm">
                  <Mic className="text-ink-800 size-4" aria-hidden />
                  {v.author?.name ?? "—"} · {formatDateTime(v.capturedAt ?? v.receivedAt)}
                </span>
                <audio controls preload="none" src={mediaUrls(v).display} className="w-full" />
                {v.transcription ? (
                  <p className="text-ink-700 text-sm sm:col-span-2">« {v.transcription} »</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
