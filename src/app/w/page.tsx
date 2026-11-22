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
        <h1 className="text-2xl font-bold">Bonjour {ctx.user.name.split(" ")[0]}</h1>
        <p className="text-stone-600 capitalize">{formatDayLong(day)}</p>
      </div>

      {sites.length === 0 ? (
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-lg font-semibold">Pas de chantier prévu aujourd&apos;hui.</p>
          {teamSites.length ? (
            <>
              <p className="mt-1 text-stone-600">Vos chantiers en cours :</p>
              <ul className="mt-3 grid gap-2">
                {teamSites.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/w/chantier/${s.id}`}
                      className="flex min-h-14 items-center justify-between rounded-xl border px-4 font-medium"
                    >
                      {s.title}
                      <ChevronRight className="size-5 text-stone-400" aria-hidden />
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
              className="grid gap-4 rounded-2xl bg-white p-4 shadow-sm"
              data-testid="worker-site"
            >
              <div>
                <p className="text-sm font-medium text-orange-700">
                  {s.startTime ? `${s.startTime} · ` : ""}
                  {SLOT_LABELS[s.slot]}
                </p>
                <Link href={`/w/chantier/${s.site.id}`} className="block text-xl font-bold">
                  {s.site.title}
                </Link>
                <p className="flex items-start gap-1 text-stone-600">
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
                  className="flex min-h-14 items-center justify-center rounded-xl border-2 border-stone-800 text-base font-bold"
                >
                  Y aller (Maps)
                </a>
                <a
                  href={urls.waze}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-14 items-center justify-center rounded-xl border-2 border-stone-800 text-base font-bold"
                >
                  Waze
                </a>
              </div>
              {s.currentStep ? (
                <div>
                  <p className="text-sm text-stone-500">Étape en cours</p>
                  <p className="text-lg font-semibold">{s.currentStep.title}</p>
                  <ProgressBar value={s.site.progress} className="mt-1" label="Avancement du chantier" />
                </div>
              ) : null}
              {s.dayInstructions || s.site.instructions ? (
                <div className="flex gap-2 rounded-xl bg-amber-50 p-3 text-amber-950">
                  <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
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
        <section className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <CalendarClock className="mt-0.5 size-6 text-stone-500" aria-hidden />
          <div>
            <p className="font-semibold">Demain</p>
            {tomorrow.map((a) => (
              <p key={a.id} className="text-stone-700">
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
