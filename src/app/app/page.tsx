import {
  AlertTriangle,
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
import { LateBadge, ProgressBar, SiteStatusBadge } from "@/components/app/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelative } from "@/lib/format";
import { SLOT_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { requireManager } from "@/server/auth/context";
import { dashboardData } from "@/server/services/dashboard";

export const metadata: Metadata = { title: "Tableau de bord" };

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

  const alertCards = [
    {
      key: "late",
      count: alerts.lateSites.length,
      label: "chantier(s) en retard",
      icon: AlertTriangle,
      href: "/app/chantiers",
      tone: "text-red-700 bg-red-50 border-red-200",
    },
    {
      key: "photos",
      count: alerts.pendingPhotos,
      label: "photo(s) à valider",
      icon: Camera,
      href: "/app/a-traiter",
      tone: "text-orange-800 bg-orange-50 border-orange-200",
    },
    {
      key: "inbox",
      count: alerts.openInbox,
      label: "élément(s) à classer",
      icon: Inbox,
      href: "/app/a-traiter",
      tone: "text-sky-800 bg-sky-50 border-sky-200",
    },
    {
      key: "summaries",
      count: alerts.draftSummaries,
      label: "résumé(s) à approuver",
      icon: Sparkles,
      href: "/app/a-traiter",
      tone: "text-violet-800 bg-violet-50 border-violet-200",
    },
  ];

  return (
    <>
      <PageHeader
        title={`Bonjour ${ctx.user.name.split(" ")[0]}`}
        description={ctx.organization.name}
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
        <Card className="mb-6 border-orange-200 bg-orange-50/40" data-testid="onboarding">
          <CardHeader>
            <CardTitle>
              Prise en main — {onboardingDone}/{onboardingSteps.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <ProgressBar
              value={(onboardingDone / onboardingSteps.length) * 100}
              label="Progression de la prise en main"
            />
            <ul className="grid gap-1 sm:grid-cols-2">
              {onboardingSteps.map((s) => (
                <li key={s.label}>
                  <Link href={s.href} className="flex items-center gap-2 text-sm hover:underline">
                    {s.done ? (
                      <CheckCircle2 className="size-4 text-emerald-600" aria-label="Fait" />
                    ) : (
                      <Circle className="size-4 text-stone-400" aria-label="À faire" />
                    )}
                    <span className={s.done ? "text-stone-500 line-through" : ""}>{s.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <section aria-label="Alertes" className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {alertCards.map((a) => (
          <Link
            key={a.key}
            href={a.href}
            data-testid={`alert-${a.key}`}
            className={cn(
              "flex items-center gap-3 rounded-xl border p-4 transition hover:shadow-sm",
              a.count ? a.tone : "border-stone-200 bg-white text-stone-500",
            )}
          >
            <a.icon className="size-6 shrink-0" aria-hidden />
            <span>
              <span className="block text-2xl font-bold tabular-nums">{a.count}</span>
              <span className="text-sm">{a.label}</span>
            </span>
          </Link>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="grid min-w-0 content-start gap-3 lg:col-span-2" aria-labelledby="sites-title">
          <div className="flex items-center justify-between">
            <h2 id="sites-title" className="text-lg font-semibold">
              Chantiers en cours
            </h2>
            <Link href="/app/chantiers" className="text-sm text-orange-700 hover:underline">
              Tous les chantiers
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
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {data.sites.map((s) => (
                <Link
                  key={s.id}
                  href={`/app/chantiers/${s.id}`}
                  className="grid min-w-0 gap-2 rounded-xl border bg-white p-4 transition hover:border-orange-300 hover:shadow-sm"
                  data-testid="dashboard-site"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{s.title}</p>
                      <p className="text-muted-foreground truncate text-sm">{s.client.name}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <SiteStatusBadge status={s.status} />
                      {s.lateness.late ? <LateBadge /> : null}
                    </div>
                  </div>
                  <ProgressBar value={s.progress} label={`Progression de ${s.title}`} />
                  <p className="text-muted-foreground truncate text-xs">
                    {s.next ? `Prochaine étape : ${s.next.title}` : "Toutes les étapes sont terminées"}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="size-4" aria-hidden /> Aujourd&apos;hui
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {data.todayAssignments.length === 0 ? (
                <p className="text-muted-foreground">Personne n&apos;est planifié aujourd&apos;hui.</p>
              ) : (
                data.todayAssignments.map((a) => (
                  <Link
                    key={a.id}
                    href={`/app/chantiers/${a.site.id}`}
                    className="flex justify-between gap-2 hover:underline"
                  >
                    <span>
                      <strong>{a.user.name.split(" ")[0]}</strong> — {a.site.title}
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      {a.startTime ?? SLOT_LABELS[a.slot].toLowerCase()}
                      {a.arrivedAt ? " ✔" : ""}
                    </span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Activité récente</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-3 text-sm">
                {data.activity.length === 0 ? (
                  <p className="text-muted-foreground">Rien pour l&apos;instant.</p>
                ) : null}
                {data.activity.map((e) => (
                  <li key={e.id}>
                    <p>
                      <strong>{e.actor}</strong> {e.text}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      <Link href={`/app/chantiers/${e.site.id}`} className="hover:underline">
                        {e.site.title}
                      </Link>{" "}
                      · {formatRelative(e.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
