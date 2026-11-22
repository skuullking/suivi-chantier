import {
  CalendarDays,
  Camera,
  CheckCircle2,
  Circle,
  HardHat,
  Inbox,
  Plus,
  Sparkles,
  UserPlus,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { LateBadge, ProgressBar, SiteStatusBadge, StepRibbon } from "@/components/app/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { today } from "@/lib/dates";
import { formatDayLong, formatRelative } from "@/lib/format";
import { SLOT_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { requireManager } from "@/server/auth/context";
import { dashboardData } from "@/server/services/dashboard";
import { OnboardingActions } from "./dismiss-onboarding";

export const metadata: Metadata = { title: "Tableau de bord" };

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

export default async function DashboardPage() {
  const ctx = await requireManager();
  const data = await dashboardData(ctx);
  const { alerts, onboarding } = data;
  const onboardingSteps = [
    { done: true, label: "Créer votre compte et choisir votre métier", href: "/app/parametres" },
    { done: onboarding.hasWorker, label: "Inviter un ouvrier", href: "/app/equipe" },
    { done: onboarding.hasClient, label: "Ajouter un client", href: "/app/clients/nouveau" },
    {
      done: onboarding.hasSite,
      label: "Créer un premier chantier depuis un modèle",
      href: "/app/chantiers/nouveau",
    },
    { done: onboarding.hasPortalLink, label: "Partager le lien de suivi au client", href: "/app/chantiers" },
  ];
  const onboardingDone = onboardingSteps.filter((s) => s.done).length;
  const showOnboarding = !ctx.organization.onboardingDismissed && onboardingDone < onboardingSteps.length;

  const toHandle = alerts.pendingPhotos + alerts.openInbox + alerts.draftSummaries;
  const stats = [
    {
      key: "late",
      count: alerts.lateSites.length,
      label: "En retard",
      detail: alerts.lateSites[0]?.title ?? "Tout est dans les temps",
      href: "/app/chantiers",
      danger: alerts.lateSites.length > 0,
    },
    {
      key: "photos",
      count: alerts.pendingPhotos,
      label: "Photos à valider",
      detail: "Avant envoi au client",
    },
    { key: "inbox", count: alerts.openInbox, label: "À classer", detail: "WhatsApp et e-mails" },
    {
      key: "summaries",
      count: alerts.draftSummaries,
      label: "Résumés à envoyer",
      detail: "Le point du jour",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={formatDayLong(today(ctx.organizationTimeZone))}
        title={`Bonjour ${ctx.user.name.split(" ")[0]}`}
        description={
          <span className="font-heading text-ink-900 text-lg font-bold sm:text-xl">
            {alerts.lateSites.length
              ? `${plural(alerts.lateSites.length, "chantier")} en retard`
              : "Aucun retard"}
            ,{" "}
            <span className={cn(toHandle > 0 && "bg-signal-400 rounded-md px-1.5")}>
              {toHandle ? `${plural(toHandle, "chose")} à traiter` : "rien à traiter"}.
            </span>
          </span>
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/app/clients/nouveau">
                <UserPlus aria-hidden /> Nouveau client
              </Link>
            </Button>
            <Button asChild>
              <Link href="/app/chantiers/nouveau">
                <Plus aria-hidden /> Nouveau chantier
              </Link>
            </Button>
          </>
        }
      />

      {showOnboarding ? (
        <Card className="ring-ink-900 mb-6 ring-[1.5px]" data-testid="onboarding">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>
              Prise en main{" "}
              <span className="text-ink-600 font-mono text-sm">
                {onboardingDone}/{onboardingSteps.length}
              </span>
            </CardTitle>
            <OnboardingActions canDismiss={ctx.role === "OWNER"} />
          </CardHeader>
          <CardContent className="grid gap-3">
            <ProgressBar
              value={(onboardingDone / onboardingSteps.length) * 100}
              label="Progression de la prise en main"
            />
            <ul className="grid gap-1 sm:grid-cols-2">
              {onboardingSteps.map((s) => (
                <li key={s.label}>
                  <Link href={s.href} className="flex min-h-9 items-center gap-2 text-sm hover:underline">
                    {s.done ? (
                      <CheckCircle2 className="size-4 text-emerald-700" aria-label="Fait" />
                    ) : (
                      <Circle className="text-ink-400 size-4" aria-label="À faire" />
                    )}
                    <span className={s.done ? "text-ink-500 line-through" : ""}>{s.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <section
        aria-label="Chiffres clés"
        className="border-ink-200 mb-8 grid grid-cols-2 overflow-hidden rounded-[14px] border bg-white lg:grid-cols-4"
      >
        {stats.map((a, i) => (
          <Link
            key={a.key}
            href={a.href ?? "/app/a-traiter"}
            data-testid={`alert-${a.key}`}
            className={cn(
              "border-ink-200 hover:bg-ink-50 flex min-w-0 flex-col gap-1.5 p-5 transition-colors",
              i % 2 === 0 && "border-r",
              i < 2 && "border-b lg:border-b-0",
              i === 1 && "lg:border-r",
              i === 2 && "lg:border-r",
            )}
          >
            <span className={cn("label-mono", a.danger ? "text-red-700" : "text-ink-600")}>{a.label}</span>
            <span
              className={cn(
                "font-heading text-[2.6rem] leading-none font-extrabold tabular-nums",
                a.danger && "text-red-700",
              )}
            >
              {a.count}
            </span>
            <span className="text-ink-600 truncate text-[13px]">{a.detail}</span>
          </Link>
        ))}
      </section>

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="grid min-w-0 content-start gap-3" aria-labelledby="sites-title">
          <div className="flex items-baseline justify-between">
            <h2 id="sites-title" className="text-2xl font-extrabold">
              Chantiers en cours
            </h2>
            <Link href="/app/chantiers" className="text-sm font-semibold hover:underline">
              Tous les chantiers →
            </Link>
          </div>
          {data.sites.length === 0 ? (
            <EmptyState
              icon={HardHat}
              title="Aucun chantier en cours"
              description="Créez un chantier à partir d'un modèle d'étapes : c'est prêt en une minute."
              action={
                <Button asChild>
                  <Link href="/app/chantiers/nouveau">Créer un chantier</Link>
                </Button>
              }
            />
          ) : (
            data.sites.map((s) => (
              <Link
                key={s.id}
                href={`/app/chantiers/${s.id}`}
                className="border-ink-200 hover:border-ink-900 grid min-w-0 gap-4 rounded-[14px] border bg-white p-5 transition-colors"
                data-testid="dashboard-site"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="label-mono text-ink-600">
                      {s.code}
                      {s.city ? ` · ${s.city}` : ""}
                    </p>
                    <p className="font-heading mt-1 truncate text-xl font-bold tracking-tight">{s.title}</p>
                    <p className="text-ink-600 truncate text-sm">{s.client.name}</p>
                  </div>
                  {s.lateness.late ? <LateBadge /> : <SiteStatusBadge status={s.status} />}
                </div>
                <div className="flex items-center gap-4">
                  <StepRibbon steps={s.steps} className="flex-1" />
                  <span className="font-mono text-sm font-bold tabular-nums">
                    {Math.round(s.progress)} %<span className="sr-only"> d&apos;avancement</span>
                  </span>
                </div>
                <div className="text-ink-600 flex flex-wrap justify-between gap-2 text-sm">
                  <span className="truncate">
                    {s.next ? (
                      <>
                        Prochaine étape : <strong className="text-ink-900">{s.next.title}</strong>
                      </>
                    ) : (
                      "Toutes les étapes sont terminées"
                    )}
                  </span>
                  {s.members.length ? (
                    <span className="truncate">
                      {s.members.map((m) => m.user.name.split(" ")[0]).join(", ")}
                    </span>
                  ) : null}
                </div>
              </Link>
            ))
          )}
        </section>

        <div className="grid content-start gap-5">
          <section
            className="bg-ink-900 grid gap-3 rounded-[14px] p-5 text-white"
            aria-labelledby="todo-title"
          >
            <div className="flex items-center justify-between">
              <h2 id="todo-title" className="text-[1.35rem] font-extrabold">
                À traiter
              </h2>
              <span className="bg-signal-400 text-ink-900 rounded-md px-2 py-0.5 font-mono text-xs font-bold">
                {toHandle}
              </span>
            </div>
            {toHandle === 0 ? (
              <p className="text-ink-300 text-sm">Tout est rangé. Rien n&apos;attend votre validation.</p>
            ) : (
              <ul className="grid text-sm">
                {alerts.pendingPhotos ? (
                  <li className="border-ink-800 flex items-center gap-3 border-t py-2.5">
                    <Camera className="text-signal-400 size-4" aria-hidden />
                    {plural(alerts.pendingPhotos, "photo")} à valider
                  </li>
                ) : null}
                {alerts.openInbox ? (
                  <li className="border-ink-800 flex items-center gap-3 border-t py-2.5">
                    <Inbox className="text-signal-400 size-4" aria-hidden />
                    {plural(alerts.openInbox, "élément")} à classer
                  </li>
                ) : null}
                {alerts.draftSummaries ? (
                  <li className="border-ink-800 flex items-center gap-3 border-t py-2.5">
                    <Sparkles className="text-signal-400 size-4" aria-hidden />
                    {plural(alerts.draftSummaries, "résumé")} à envoyer
                  </li>
                ) : null}
              </ul>
            )}
            <Button asChild className="h-11 border-0">
              <Link href="/app/a-traiter">Tout traiter</Link>
            </Button>
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="size-4" aria-hidden /> Sur le terrain aujourd&apos;hui
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {data.todayAssignments.length === 0 ? (
                <p className="text-muted-foreground">Personne n&apos;est planifié aujourd&apos;hui.</p>
              ) : (
                data.todayAssignments.map((a) => (
                  <Link
                    key={a.id}
                    href={`/app/chantiers/${a.site.id}`}
                    className="flex min-h-10 items-center justify-between gap-2 hover:underline"
                  >
                    <span className="truncate">
                      <strong>{a.user.name.split(" ")[0]}</strong> · {a.site.title}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 font-mono text-xs font-bold uppercase",
                        a.arrivedAt ? "text-emerald-700" : "text-ink-600",
                      )}
                    >
                      {a.arrivedAt ? "● Sur place" : (a.startTime ?? SLOT_LABELS[a.slot])}
                    </span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <section aria-labelledby="activity-title" className="px-1">
            <h2 id="activity-title" className="label-mono text-ink-600 mb-2">
              Fil d&apos;activité
            </h2>
            {data.activity.length === 0 ? (
              <p className="text-muted-foreground text-sm">Rien pour l&apos;instant.</p>
            ) : null}
            <ol className="text-sm">
              {data.activity.map((e) => (
                <li key={e.id} className="border-ink-200 grid grid-cols-[84px_1fr] gap-2 border-t py-2.5">
                  <span className="text-ink-600 font-mono text-[11px] leading-5 uppercase">
                    {formatRelative(e.createdAt)}
                  </span>
                  <span className="min-w-0">
                    <strong>{e.actor}</strong> {e.text}
                    <Link
                      href={`/app/chantiers/${e.site.id}`}
                      className="text-ink-600 block truncate text-xs hover:underline"
                    >
                      {e.site.title}
                    </Link>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
