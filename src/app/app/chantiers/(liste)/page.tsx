import { Download, HardHat, LayoutGrid, List, MapPin, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { LateBadge, ProgressBar, SiteStatusBadge, StepRibbon } from "@/components/app/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SiteStatus } from "@/generated/prisma/enums";
import { formatDay } from "@/lib/format";
import { SITE_STATUS_LABELS } from "@/lib/labels";
import { SITE_STATUSES } from "@/lib/validation/business";
import { requireManager } from "@/server/auth/context";
import { clientOptions } from "@/server/services/clients";
import { planningMembers } from "@/server/services/planning";
import { listSites, type SiteFilters } from "@/server/services/sites";

export const metadata: Metadata = { title: "Chantiers" };

type SP = {
  q?: string;
  statut?: string;
  client?: string;
  equipe?: string;
  du?: string;
  au?: string;
  vue?: string;
};

export default async function SitesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireManager();
  const sp = await searchParams;
  const status = (
    sp.statut === "ALL" || (SITE_STATUSES as readonly string[]).includes(sp.statut ?? "")
      ? sp.statut
      : "ACTIVE"
  ) as SiteFilters["status"];
  const [sites, clients, members] = await Promise.all([
    listSites(ctx, { q: sp.q, status, clientId: sp.client, memberId: sp.equipe, from: sp.du, to: sp.au }),
    clientOptions(ctx),
    planningMembers(ctx),
  ]);
  const table = sp.vue === "tableau";
  const params = new URLSearchParams(
    Object.entries(sp).filter(([k, v]) => v && k !== "vue") as [string, string][],
  );
  const viewHref = (v: string) => `/app/chantiers?${new URLSearchParams([...params, ["vue", v]]).toString()}`;

  return (
    <>
      <PageHeader
        title="Chantiers"
        description={`${sites.length} chantier${sites.length > 1 ? "s" : ""}`}
        actions={
          <>
            <Button asChild variant="outline">
              <a href="/api/export/chantiers.csv">
                <Download aria-hidden /> Exporter (CSV)
              </a>
            </Button>
            <Button asChild>
              <Link href="/app/chantiers/nouveau">
                <Plus aria-hidden /> Nouveau chantier
              </Link>
            </Button>
          </>
        }
      />

      <form
        className="border-ink-200 mb-5 grid gap-2 rounded-[14px] border bg-white p-3 sm:grid-cols-2 lg:grid-cols-6"
        role="search"
      >
        <Input
          name="q"
          defaultValue={sp.q}
          placeholder="Titre, code, ville…"
          aria-label="Rechercher un chantier"
          className="lg:col-span-2"
        />
        <select
          name="statut"
          defaultValue={status}
          aria-label="Statut"
          className="border-input h-11 rounded-[10px] border bg-white px-3 text-sm"
        >
          <option value="ACTIVE">En cours et à venir</option>
          <option value="ALL">Tous les statuts</option>
          {(SITE_STATUSES as readonly SiteStatus[]).map((s) => (
            <option key={s} value={s}>
              {SITE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          name="client"
          defaultValue={sp.client ?? ""}
          aria-label="Client"
          className="border-input h-11 rounded-[10px] border bg-white px-3 text-sm"
        >
          <option value="">Tous les clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="equipe"
          defaultValue={sp.equipe ?? ""}
          aria-label="Équipe"
          className="border-input h-11 rounded-[10px] border bg-white px-3 text-sm"
        >
          <option value="">Toute l&apos;équipe</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.user.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <Input name="du" type="date" defaultValue={sp.du} aria-label="Du" />
          <Input name="au" type="date" defaultValue={sp.au} aria-label="Au" />
        </div>
        {table ? <input type="hidden" name="vue" value="tableau" /> : null}
        <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
          <Button type="submit" variant="outline">
            Filtrer
          </Button>
          <Button asChild variant="ghost">
            <Link href="/app/chantiers">Réinitialiser</Link>
          </Button>
          <div className="ml-auto flex gap-1" role="group" aria-label="Affichage">
            <Button asChild variant={table ? "ghost" : "secondary"} size="sm">
              <Link href={viewHref("cartes")} aria-current={!table ? "true" : undefined}>
                <LayoutGrid aria-hidden /> Cartes
              </Link>
            </Button>
            <Button asChild variant={table ? "secondary" : "ghost"} size="sm">
              <Link href={viewHref("tableau")} aria-current={table ? "true" : undefined}>
                <List aria-hidden /> Tableau
              </Link>
            </Button>
          </div>
        </div>
      </form>

      {sites.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title="Aucun chantier"
          description="Créez votre premier chantier à partir d'un modèle d'étapes de votre métier."
          action={
            <Button asChild>
              <Link href="/app/chantiers/nouveau">Créer un chantier</Link>
            </Button>
          }
        />
      ) : table ? (
        <div className="border-ink-200 overflow-x-auto rounded-[14px] border bg-white">
          <table className="w-full text-sm">
            <thead className="label-mono text-ink-600 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Chantier</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Statut</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Dates</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Équipe</th>
                <th className="w-48 px-4 py-3 font-medium">Progression</th>
              </tr>
            </thead>
            <tbody className="divide-ink-100 border-ink-100 divide-y border-t">
              {sites.map((s) => (
                <tr key={s.id} className="hover:bg-ink-50" data-testid="site-row">
                  <td className="px-4 py-3">
                    <Link href={`/app/chantiers/${s.id}`} className="font-semibold hover:underline">
                      {s.title}
                    </Link>
                    <p className="text-ink-600 font-mono text-xs">
                      {s.code}
                      {s.city ? ` · ${s.city}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3">{s.client.name}</td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      <SiteStatusBadge status={s.status} />
                      {s.lateness.late ? <LateBadge /> : null}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    {formatDay(s.plannedStart)} → {formatDay(s.plannedEnd)}
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    {s.members.map((m) => m.user.name.split(" ")[0]).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <ProgressBar value={s.progress} label={`Progression de ${s.title}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sites.map((s) => (
            <Link
              key={s.id}
              href={`/app/chantiers/${s.id}`}
              data-testid="site-card"
              className="border-ink-200 hover:border-ink-900 grid content-start gap-3.5 rounded-[14px] border bg-white p-5 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="label-mono text-ink-600 pt-1">{s.code}</p>
                <div className="flex flex-wrap justify-end gap-1">
                  {s.lateness.late ? <LateBadge /> : <SiteStatusBadge status={s.status} />}
                </div>
              </div>
              <div className="min-w-0">
                <p className="font-heading text-ink-900 truncate text-xl font-bold tracking-tight">
                  {s.title}
                </p>
                <p className="text-ink-600 truncate text-sm">{s.client.name}</p>
              </div>
              <div className="flex items-center gap-3">
                <StepRibbon steps={s.steps} size="sm" className="flex-1" />
                <span className="font-mono text-xs font-bold tabular-nums">
                  {Math.round(s.progress)} %<span className="sr-only"> d&apos;avancement</span>
                </span>
              </div>
              <div className="text-ink-600 flex items-center justify-between gap-2 font-mono text-xs">
                <span className="flex min-w-0 items-center gap-1">
                  <MapPin className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">{s.city ?? s.address}</span>
                </span>
                <span className="shrink-0">
                  {s.plannedStart ? formatDay(s.plannedStart) : "Pas de date"}
                  {s.plannedEnd ? ` → ${formatDay(s.plannedEnd)}` : ""}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
