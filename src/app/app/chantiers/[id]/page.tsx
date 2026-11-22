import { CalendarDays, ListChecks, Phone, Share2, Users } from "lucide-react";
import Link from "next/link";
import { MapsLinks } from "@/components/app/maps-links";
import { LateBadge, StepStatusBadge } from "@/components/app/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addDays, today, toDateKey } from "@/lib/dates";
import { formatDay } from "@/lib/format";
import { SLOT_LABELS } from "@/lib/labels";
import { requireManager } from "@/server/auth/context";
import { nextStep } from "@/server/domain/progress";
import { listAssignments, planningMembers } from "@/server/services/planning";
import { loadSite } from "./site-data";
import { listSiteTasks } from "@/server/services/tasks";
import { DeleteSiteButton, EditSiteDialog, TeamDialog } from "./summary-dialogs";
import { TaskList } from "./task-list";

export default async function SiteSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireManager();
  const { id } = await params;
  const site = await loadSite(ctx, id);
  const day = today(ctx.organizationTimeZone);
  const [tasks, members, upcoming] = await Promise.all([
    listSiteTasks(ctx, id),
    planningMembers(ctx),
    listAssignments(ctx, { from: day, to: addDays(day, 13), siteId: id }),
  ]);
  const next = nextStep(site.steps);
  const doneCount = site.steps.filter((s) => s.status === "DONE").length;
  const lateIds = new Set(site.lateness.lateSteps.map((s) => s.id));

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="grid content-start gap-6 lg:col-span-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Avancement</CardTitle>
            <Button asChild size="sm" variant="outline">
              <Link href={`/app/chantiers/${id}/etapes`}>
                <ListChecks aria-hidden /> Gérer les étapes
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p className="text-sm">
              <strong className="text-2xl">{site.progress} %</strong>{" "}
              <span className="text-muted-foreground">
                — {doneCount} étape{doneCount > 1 ? "s" : ""} terminée{doneCount > 1 ? "s" : ""} sur{" "}
                {site.steps.length}
              </span>
            </p>
            {next ? (
              <div className="bg-signal-50/50 rounded-lg border p-3">
                <p className="text-muted-foreground text-xs uppercase">Prochaine étape</p>
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {next.title} <StepStatusBadge status={next.status} />
                  {lateIds.has(next.id) ? <LateBadge /> : null}
                </p>
                {next.plannedEnd ? (
                  <p className="text-muted-foreground text-xs">
                    Prévue jusqu&apos;au {formatDay(next.plannedEnd)}
                  </p>
                ) : null}
              </div>
            ) : site.steps.length ? (
              <p className="text-sm text-emerald-700">Toutes les étapes sont terminées.</p>
            ) : (
              <p className="text-muted-foreground text-sm">Aucune étape pour l&apos;instant.</p>
            )}
            {site.lateness.siteOverdue ? (
              <p className="text-sm text-red-700">
                La date de fin prévue ({formatDay(site.plannedEnd)}) est dépassée.
              </p>
            ) : null}
            <ol className="grid gap-1 text-sm">
              {site.steps.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <span className="text-ink-400 w-5 text-right text-xs tabular-nums">{s.order}</span>
                  <span className={s.status === "DONE" ? "text-ink-500 line-through" : ""}>{s.title}</span>
                  <StepStatusBadge status={s.status} />
                  {lateIds.has(s.id) ? <LateBadge /> : null}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tâches</CardTitle>
          </CardHeader>
          <CardContent>
            <TaskList
              siteId={id}
              tasks={tasks.map((t) => ({
                id: t.id,
                title: t.title,
                done: t.status === "DONE",
                date: t.date ? formatDay(t.date) : null,
                assignee: t.assignee?.name ?? null,
              }))}
              members={members.map((m) => ({ value: m.userId, label: m.user.name }))}
              steps={site.steps.map((s) => ({ value: s.id, label: s.title }))}
              defaultDate={toDateKey(day)}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid content-start gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Informations</CardTitle>
            <EditSiteDialog
              siteId={id}
              defaults={{
                title: site.title,
                address: site.address,
                postalCode: site.postalCode ?? "",
                city: site.city ?? "",
                plannedStart: site.plannedStart ? toDateKey(site.plannedStart) : "",
                plannedEnd: site.plannedEnd ? toDateKey(site.plannedEnd) : "",
                description: site.description ?? "",
                instructions: site.instructions ?? "",
              }}
            />
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div>
              <p className="font-medium">
                {site.address}
                {site.postalCode || site.city ? `, ${site.postalCode ?? ""} ${site.city ?? ""}` : ""}
              </p>
              <div className="mt-2">
                <MapsLinks
                  address={[site.address, site.postalCode, site.city].filter(Boolean).join(" ")}
                  latitude={site.latitude}
                  longitude={site.longitude}
                />
              </div>
            </div>
            <p className="flex items-center gap-2">
              <CalendarDays className="text-ink-400 size-4" aria-hidden />
              {formatDay(site.plannedStart)} → {formatDay(site.plannedEnd)}
            </p>
            {site.actualStart ? (
              <p className="text-muted-foreground text-xs">Démarré le {formatDay(site.actualStart)}</p>
            ) : null}
            {site.description ? <p className="text-ink-700 whitespace-pre-wrap">{site.description}</p> : null}
            {site.instructions ? (
              <div className="bg-signal-50 rounded-lg p-3">
                <p className="text-ink-900 text-xs font-semibold uppercase">Consignes équipe</p>
                <p className="text-ink-900 whitespace-pre-wrap">{site.instructions}</p>
              </div>
            ) : null}
            <div className="border-t pt-3">
              <p className="text-muted-foreground text-xs uppercase">Client</p>
              <Link href={`/app/clients/${site.client.id}`} className="font-medium hover:underline">
                {site.client.name}
              </Link>
              {site.client.phones[0] ? (
                <a
                  href={`tel:${site.client.phones[0].replace(/\s/g, "")}`}
                  className="text-ink-700 flex items-center gap-2 hover:underline"
                >
                  <Phone className="text-ink-400 size-4" aria-hidden /> {site.client.phones[0]}
                </a>
              ) : null}
            </div>
            <Button asChild variant="secondary" className="mt-1">
              <Link href={`/app/chantiers/${id}/espace-client`}>
                <Share2 aria-hidden /> Partager le lien de suivi au client
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Équipe</CardTitle>
            <TeamDialog
              siteId={id}
              members={members.map((m) => ({ id: m.userId, name: m.user.name, role: m.role }))}
              selected={site.members.map((m) => m.userId)}
            />
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {site.members.length === 0 ? (
              <p className="text-muted-foreground">Personne n&apos;est encore affecté.</p>
            ) : (
              site.members.map((m) => (
                <p key={m.userId} className="flex items-center gap-2">
                  <Users className="text-ink-400 size-4" aria-hidden /> {m.user.name}
                </p>
              ))
            )}
            {upcoming.length ? (
              <div className="mt-2 border-t pt-3">
                <p className="text-muted-foreground mb-1 text-xs uppercase">Prochaines interventions</p>
                <ul className="grid gap-1">
                  {upcoming.slice(0, 6).map((a) => (
                    <li key={a.id}>
                      {formatDay(a.date)} — {a.user.name} ({SLOT_LABELS[a.slot].toLowerCase()}
                      {a.startTime ? `, ${a.startTime}` : ""})
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <DeleteSiteButton siteId={id} title={site.title} />
      </div>
    </div>
  );
}
