import { CalendarClock, ChevronRight, Info, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { mapsUrls } from "@/components/app/maps-links";
import { ProgressBar } from "@/components/app/status";
import { formatDayLong } from "@/lib/format";
import { SLOT_LABELS } from "@/lib/labels";
import { requireAuth } from "@/server/auth/context";
import { workerDay } from "@/server/services/worker";
import { FieldButtons, WorkerTasks } from "./field-buttons";

export const metadata: Metadata = { title: "Aujourd'hui" };

export default async function WorkerTodayPage() {
  const ctx = await requireAuth();
  const { day, sites, teamSites, tomorrow } = await workerDay(ctx);

  return (
    <div className="grid gap-5">
      <div>
        <p className="label-mono text-ink-600">{formatDayLong(day)}</p>
        <h1 className="mt-1 text-[2.4rem] leading-none font-extrabold">
          Bonjour {ctx.user.name.split(" ")[0]}
        </h1>
      </div>

      {sites.length === 0 ? (
        <section className="border-ink-200 rounded-2xl border bg-white p-5">
          <p className="text-lg font-semibold">Pas de chantier prévu aujourd&apos;hui.</p>
          {teamSites.length ? (
            <>
              <p className="text-ink-600 mt-1">Vos chantiers en cours :</p>
              <ul className="mt-3 grid gap-2">
                {teamSites.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/w/chantier/${s.id}`}
                      className="flex min-h-14 items-center justify-between rounded-xl border px-4 font-medium"
                    >
                      {s.title}
                      <ChevronRight className="text-ink-400 size-5" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : (
        sites.map((s) => {
          const urls = mapsUrls(
            [s.site.address, s.site.postalCode, s.site.city].filter(Boolean).join(" "),
            s.site.latitude,
            s.site.longitude,
          );
          return (
            <section
              key={s.site.id}
              className="border-ink-200 grid gap-4 rounded-2xl border bg-white p-4"
              data-testid="worker-site"
            >
              <div>
                <p className="label-mono text-ink-600">
                  {s.startTime ? `${s.startTime} · ` : ""}
                  {SLOT_LABELS[s.slot]}
                </p>
                <Link
                  href={`/w/chantier/${s.site.id}`}
                  className="font-heading mt-1 block text-2xl leading-tight font-extrabold tracking-tight"
                >
                  {s.site.title}
                </Link>
                <p className="text-ink-600 flex items-start gap-1">
                  <MapPin className="mt-1 size-4 shrink-0" aria-hidden />
                  {s.site.address}
                  {s.site.city ? `, ${s.site.city}` : ""}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <a
                  href={urls.google}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-ink-900 flex min-h-14 items-center justify-center rounded-xl text-base font-bold text-white"
                >
                  Y aller (Maps)
                </a>
                <a
                  href={urls.waze}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-ink-900 flex min-h-14 items-center justify-center rounded-xl border-2 text-base font-bold"
                >
                  Waze
                </a>
              </div>
              {s.currentStep ? (
                <div>
                  <p className="label-mono text-ink-600">Étape en cours</p>
                  <p className="font-heading text-xl font-extrabold">{s.currentStep.title}</p>
                  <ProgressBar value={s.site.progress} className="mt-1" label="Avancement du chantier" />
                </div>
              ) : null}
              {s.dayInstructions || s.site.instructions ? (
                <div className="bg-ink-900 flex gap-2 rounded-xl p-3 text-white">
                  <Info className="text-signal-400 mt-0.5 size-5 shrink-0" aria-hidden />
                  <div className="whitespace-pre-wrap">
                    {s.dayInstructions ? <p className="font-semibold">{s.dayInstructions}</p> : null}
                    {s.site.instructions ? <p>{s.site.instructions}</p> : null}
                  </div>
                </div>
              ) : null}
              <WorkerTasks
                tasks={s.tasks.map((t) => ({ id: t.id, title: t.title, done: t.status === "DONE" }))}
              />
              <FieldButtons
                siteId={s.site.id}
                arrivedAt={s.arrivedAt ? s.arrivedAt.toISOString() : null}
                currentStep={s.currentStep ? { id: s.currentStep.id, title: s.currentStep.title } : null}
              />
            </section>
          );
        })
      )}

      {tomorrow.length ? (
        <section className="border-ink-200 flex items-start gap-3 rounded-2xl border bg-white p-4">
          <CalendarClock className="text-ink-500 mt-0.5 size-6" aria-hidden />
          <div>
            <p className="font-semibold">Demain</p>
            {tomorrow.map((a) => (
              <p key={a.id} className="text-ink-700">
                {a.site.title}
                {a.startTime ? `, ${a.startTime.replace(":", " h ")}` : ""}
              </p>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
