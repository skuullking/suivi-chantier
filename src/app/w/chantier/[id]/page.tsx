import { FileText, Info, Mic } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { mapsUrls } from "@/components/app/maps-links";
import { ProgressBar, StepStatusBadge } from "@/components/app/status";
import { formatDateTime } from "@/lib/format";
import { VALIDATION_LABELS } from "@/lib/labels";
import { requireAuth } from "@/server/auth/context";
import { NotFoundError } from "@/server/errors";
import { signFileUrl } from "@/server/files";
import { mediaUrls } from "@/server/services/media";
import { workerSite } from "@/server/services/worker";
import { FieldButtons, WorkerTasks } from "../../field-buttons";

export const metadata: Metadata = { title: "Chantier" };

export default async function WorkerSitePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth();
  const { id } = await params;
  const data = await workerSite(ctx, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const { site, currentStep, plans, myMedia, tasks } = data;
  const urls = mapsUrls(
    [site.address, site.postalCode, site.city].filter(Boolean).join(" "),
    site.latitude,
    site.longitude,
  );

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div>
          <p className="font-mono text-sm text-stone-500">{site.code}</p>
          <h1 className="text-2xl font-bold">{site.title}</h1>
          <p className="text-stone-600">
            {site.address}
            {site.city ? `, ${site.city}` : ""}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <a
            href={urls.google}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-14 items-center justify-center rounded-xl border-2 border-stone-800 font-bold"
          >
            Y aller (Maps)
          </a>
          <a
            href={urls.waze}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-14 items-center justify-center rounded-xl border-2 border-stone-800 font-bold"
          >
            Waze
          </a>
        </div>
        {site.client.phones[0] ? (
          <a
            href={`tel:${site.client.phones[0].replace(/\s/g, "")}`}
            className="font-semibold text-orange-700 underline"
          >
            Appeler le client ({site.client.name})
          </a>
        ) : null}
        {site.instructions ? (
          <div className="flex gap-2 rounded-xl bg-amber-50 p-3 text-amber-950">
            <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
            <p className="whitespace-pre-wrap">{site.instructions}</p>
          </div>
        ) : null}
        <FieldButtons
          siteId={site.id}
          arrivedAt={null}
          currentStep={currentStep ? { id: currentStep.id, title: currentStep.title } : null}
        />
      </section>

      <section className="grid gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">Étapes</h2>
        <ProgressBar value={site.progress} label="Avancement du chantier" />
        <ol className="grid gap-2">
          {site.steps.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 border-b pb-2 last:border-0">
              <span className={s.status === "DONE" ? "text-stone-400 line-through" : "font-medium"}>
                {s.title}
              </span>
              <StepStatusBadge status={s.status} />
            </li>
          ))}
        </ol>
      </section>

      {tasks.length ? (
        <section className="grid gap-3">
          <h2 className="text-lg font-bold">Tâches</h2>
          <WorkerTasks tasks={tasks.map((t) => ({ id: t.id, title: t.title, done: false }))} />
        </section>
      ) : null}

      {plans.length ? (
        <section className="grid gap-2 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold">Plans</h2>
          {plans.map((p) => (
            <a
              key={p.id}
              href={signFileUrl(p.storageKey, {
                disposition: "inline",
                filename: p.originalName,
                contentType: p.mimeType,
              })}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-12 items-center gap-2 rounded-xl border px-3 font-medium"
            >
              <FileText className="size-5 text-stone-500" aria-hidden /> {p.name}
            </a>
          ))}
        </section>
      ) : null}

      <section className="grid gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">Mes envois</h2>
        {myMedia.length === 0 ? (
          <p className="text-stone-600">Rien envoyé sur ce chantier pour l&apos;instant.</p>
        ) : null}
        <ul className="grid grid-cols-3 gap-2">
          {myMedia.map((m) => {
            const u = m.kind === "PHOTO" && m.thumbnailKey ? mediaUrls(m) : null;
            return (
              <li key={m.id} className="relative aspect-square overflow-hidden rounded-lg bg-stone-100">
                {u?.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed private URL
                  <img
                    src={u.thumbnail}
                    alt={m.caption ?? "Photo envoyée"}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center text-xs text-stone-500">
                    <Mic className="size-6" aria-hidden />
                    {m.kind === "VOICE" ? "Vocal" : "Traitement…"}
                  </div>
                )}
                <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 text-[10px] text-white">
                  {formatDateTime(m.receivedAt)} ·{" "}
                  {m.kind === "PHOTO" ? VALIDATION_LABELS[m.validationStatus] : "envoyé"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
