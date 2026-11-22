import { CalendarDays, Check, Circle, Download, Loader, Mail, MessageCircle, Phone } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { LogoMark } from "@/components/brand/logo";
import { formatDateTime, formatDay, formatDayLong } from "@/lib/format";
import { DOCUMENT_TYPE_LABELS, SLOT_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { StepRibbon } from "@/components/app/status";
import { db } from "@/server/db";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { clientIpFromHeaders } from "@/server/security/request";
import { portalData, resolvePortalToken } from "@/server/services/portal";
import { PhotoFeed } from "./photo-feed";

export const metadata: Metadata = {
  title: "Suivi de votre chantier",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

function waLink(phone: string) {
  const digits = phone.replace(/[^\d+]/g, "");
  return `https://wa.me/${digits.startsWith("+") ? digits.slice(1) : digits.startsWith("0") ? `33${digits.slice(1)}` : digits}`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background min-h-dvh">
      <div className="mx-auto max-w-2xl px-4 pt-0 pb-16 sm:pt-6">{children}</div>
    </div>
  );
}

async function ExpiredPage({ organizationId }: { organizationId: string | null }) {
  const org = organizationId
    ? await db.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, phone: true, email: true },
      })
    : null;
  return (
    <Shell>
      <div
        className="border-ink-200 rounded-2xl border bg-white p-6 text-center"
        data-testid="portal-expired"
      >
        <LogoMark className="mx-auto mb-4 size-10" />
        <h1 className="text-2xl font-bold">Ce lien n&apos;est plus valide</h1>
        <p className="text-ink-600 mt-2">
          Le lien de suivi a expiré ou a été remplacé. Demandez un nouveau lien à votre artisan.
        </p>
        {org ? (
          <div className="text-ink-700 mt-4 grid gap-1">
            <p className="font-semibold">{org.name}</p>
            {org.phone ? (
              <a href={`tel:${org.phone}`} className="font-semibold underline">
                {org.phone}
              </a>
            ) : null}
            {org.email ? (
              <a href={`mailto:${org.email}`} className="font-semibold underline">
                {org.email}
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </Shell>
  );
}

export default async function ClientPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = clientIpFromHeaders(await headers());
  const limit = await consumeRateLimit(`portal:${ip}`, 120, 600);
  if (!limit.allowed) {
    return (
      <Shell>
        <p className="border-ink-200 rounded-2xl border bg-white p-6 text-center">
          Trop de consultations en peu de temps. Réessayez dans quelques minutes.
        </p>
      </Shell>
    );
  }
  const resolved = await resolvePortalToken(token);
  if (resolved.status !== "ok") return <ExpiredPage organizationId={resolved.organizationId} />;
  const data = await portalData({
    kind: "client",
    organizationId: resolved.organizationId,
    siteId: resolved.siteId,
  });
  const { site, organization: org } = data;

  // Feed: summaries and photos, newest first, grouped by day.
  type FeedDay = { key: string; summary: string | null; photos: typeof data.photos };
  const days = new Map<string, FeedDay>();
  const dayOf = (d: Date) => d.toISOString().slice(0, 10);
  for (const s of data.summaries) {
    const key = dayOf(s.date);
    days.set(key, { key, summary: s.text, photos: days.get(key)?.photos ?? [] });
  }
  for (const p of data.photos) {
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: org.timezone }).format(p.takenAt);
    const entry = days.get(key) ?? { key, summary: null, photos: [] };
    entry.photos.push(p);
    days.set(key, entry);
  }
  const feed = [...days.values()].sort((a, b) => b.key.localeCompare(a.key));
  const doneCount = data.steps.filter((s) => s.status === "DONE").length;

  return (
    <Shell>
      <header className="bg-ink-900 -mx-4 mb-4 grid gap-4 px-5 pt-6 pb-6 text-white sm:mx-0 sm:rounded-2xl">
        <div className="flex items-center gap-3">
          <LogoMark className="size-9 shrink-0" />
          <p className="label-mono text-ink-300 min-w-0 truncate">{org.name}</p>
        </div>
        <div>
          <h1 className="text-[2rem] leading-none font-extrabold">{site.title}</h1>
          <p className="text-ink-300 mt-2 truncate text-sm">{site.address}</p>
        </div>
        <div className="flex items-end justify-between gap-3">
          <span
            className="font-heading text-signal-400 text-[4.5rem] leading-[0.85] font-extrabold tracking-[-0.05em]"
            data-testid="portal-progress"
          >
            {site.progress} %
          </span>
          <span className="text-ink-200 pb-1 text-right text-sm">
            {doneCount} étape{doneCount > 1 ? "s" : ""} sur {data.steps.length}
            {site.plannedEnd ? (
              <>
                <br />
                fin prévue le {formatDay(site.plannedEnd)}
              </>
            ) : null}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={site.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Avancement du chantier"
        >
          <StepRibbon steps={data.steps} size="sm" tone="dark" />
        </div>
      </header>

      <section className="border-ink-200 mb-4 rounded-2xl border bg-white p-5" aria-labelledby="avancement">
        <h2 id="avancement" className="text-xl font-extrabold">
          Les étapes
        </h2>
        <ol className="mt-4 grid gap-2">
          {data.steps.map((s) => (
            <li key={s.id} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-lg",
                  s.status === "DONE" && "bg-ink-900 text-white",
                  s.status === "IN_PROGRESS" && "bg-signal-400 border-ink-900 text-ink-900 border-[1.5px]",
                  s.status === "TODO" && "border-ink-300 text-ink-300 border-2",
                )}
                aria-hidden
              >
                {s.status === "DONE" ? (
                  <Check className="size-4" />
                ) : s.status === "IN_PROGRESS" ? (
                  <Loader className="size-4" />
                ) : (
                  <Circle className="size-3" />
                )}
              </span>
              <span className={cn(s.status === "TODO" ? "text-ink-500" : "font-medium")}>{s.title}</span>
              <span className="label-mono text-ink-600 ml-auto">
                {s.status === "DONE" ? "Terminée" : s.status === "IN_PROGRESS" ? "En cours" : "À venir"}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {data.upcoming.length ? (
        <section
          className="border-ink-200 mb-4 rounded-2xl border bg-white p-5"
          aria-labelledby="interventions"
        >
          <h2 id="interventions" className="mb-3 flex items-center gap-2 text-lg font-bold">
            <CalendarDays className="size-5" aria-hidden /> Prochaines interventions
          </h2>
          <ul className="grid gap-2">
            {data.upcoming.slice(0, 6).map((u) => (
              <li
                key={u.date.toISOString()}
                className="flex justify-between gap-2 border-b pb-2 last:border-0"
              >
                <span className="font-medium capitalize">{formatDayLong(u.date)}</span>
                <span className="text-ink-600 text-right text-sm">
                  {u.fullDay ? "Journée" : SLOT_LABELS[u.slot as keyof typeof SLOT_LABELS]}
                  {u.startTime ? ` dès ${u.startTime.replace(":", " h ")}` : ""}
                  <br />
                  {u.people.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mb-4 grid gap-4" aria-labelledby="actualites">
        <h2 id="actualites" className="text-lg font-bold">
          Fil d&apos;actualité
        </h2>
        {feed.length === 0 ? (
          <p className="text-ink-600 rounded-2xl bg-white p-5 shadow-sm">
            Les nouvelles du chantier arriveront ici.
          </p>
        ) : (
          feed.map((d) => (
            <article
              key={d.key}
              className="border-ink-200 rounded-2xl border bg-white p-5"
              data-testid="portal-day"
            >
              <h3 className="font-semibold capitalize">{formatDayLong(new Date(`${d.key}T00:00:00Z`))}</h3>
              {d.summary ? <p className="text-ink-800 mt-2 whitespace-pre-wrap">{d.summary}</p> : null}
              {d.photos.length ? (
                <PhotoFeed
                  photos={d.photos.map((p) => ({
                    id: p.id,
                    thumbnail: p.thumbnail,
                    display: p.display,
                    caption: p.caption ?? p.step ?? "",
                    takenAt: formatDateTime(p.takenAt, org.timezone),
                  }))}
                />
              ) : null}
            </article>
          ))
        )}
      </section>

      {data.documents.length ? (
        <section className="border-ink-200 mb-4 rounded-2xl border bg-white p-5" aria-labelledby="documents">
          <h2 id="documents" className="mb-3 text-lg font-bold">
            Documents
          </h2>
          <ul className="grid gap-2">
            {data.documents.map((d) => (
              <li key={d.id}>
                <a
                  href={d.url}
                  className="hover:bg-ink-50 flex min-h-12 items-center gap-3 rounded-xl border px-3"
                >
                  <Download className="size-5" aria-hidden />
                  <span className="flex-1">{d.name}</span>
                  <span className="text-ink-500 text-xs">{DOCUMENT_TYPE_LABELS[d.type]}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="border-ink-200 rounded-2xl border bg-white p-5" aria-labelledby="contact">
        <h2 id="contact" className="mb-3 text-lg font-bold">
          Contacter {org.name}
        </h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {org.phone ? (
            <a
              href={`tel:${org.phone}`}
              className="bg-ink-900 flex min-h-12 items-center justify-center gap-2 rounded-xl font-semibold text-white"
            >
              <Phone className="size-5" aria-hidden /> Appeler
            </a>
          ) : null}
          {org.phone ? (
            <a
              href={waLink(org.phone)}
              target="_blank"
              rel="noopener noreferrer"
              className="border-ink-900 flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 font-semibold"
            >
              <MessageCircle className="size-5" aria-hidden /> WhatsApp
            </a>
          ) : null}
          {org.email ? (
            <a
              href={`mailto:${org.email}`}
              className="border-ink-800 flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 font-semibold"
            >
              <Mail className="size-5" aria-hidden /> E-mail
            </a>
          ) : null}
        </div>
      </section>
      <p className="label-mono text-ink-600 mt-6 text-center">
        Espace de suivi fourni par {org.name} avec ChantierLink. Ce lien est personnel.
      </p>
    </Shell>
  );
}
