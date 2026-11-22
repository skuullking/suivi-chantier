import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { PlanningBoard } from "@/components/app/planning-board";
import { Button } from "@/components/ui/button";
import { requireManager } from "@/server/auth/context";
import { buildBoard, type PlanningParams } from "./board-data";

export const metadata: Metadata = { title: "Planning" };

export default async function PlanningPage({ searchParams }: { searchParams: Promise<PlanningParams> }) {
  const ctx = await requireManager();
  const sp = await searchParams;
  const board = await buildBoard(ctx, sp);
  const groupBy = sp.par === "chantier" ? "site" : "person";
  const href = (patch: Partial<PlanningParams>) => {
    const p = new URLSearchParams({
      vue: board.view === "month" ? "mois" : "semaine",
      par: groupBy === "site" ? "chantier" : "personne",
      date: sp.date ?? board.todayKey,
      ...patch,
    } as Record<string, string>);
    return `/app/planning?${p.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Planning"
        description="Glissez-déposez une affectation pour la déplacer. Cliquez sur une case pour ajouter quelqu'un."
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon" aria-label="Période précédente">
            <Link href={href({ date: board.prevKey })}>
              <ChevronLeft />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={href({ date: board.todayKey })}>Aujourd&apos;hui</Link>
          </Button>
          <Button asChild variant="outline" size="icon" aria-label="Période suivante">
            <Link href={href({ date: board.nextKey })}>
              <ChevronRight />
            </Link>
          </Button>
        </div>
        <h2 className="text-lg font-semibold">{board.title}</h2>
        {board.conflictCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
            <AlertTriangle className="size-3" aria-hidden /> {board.conflictCount} conflit(s)
          </span>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-1">
          <div className="flex rounded-lg border bg-white p-0.5" role="group" aria-label="Période">
            <Button asChild size="sm" variant={board.view === "week" ? "secondary" : "ghost"}>
              <Link href={href({ vue: "semaine" })}>Semaine</Link>
            </Button>
            <Button asChild size="sm" variant={board.view === "month" ? "secondary" : "ghost"}>
              <Link href={href({ vue: "mois" })}>Mois</Link>
            </Button>
          </div>
          {board.view === "week" ? (
            <div className="flex rounded-lg border bg-white p-0.5" role="group" aria-label="Regrouper">
              <Button asChild size="sm" variant={groupBy === "person" ? "secondary" : "ghost"}>
                <Link href={href({ par: "personne" })}>Par personne</Link>
              </Button>
              <Button asChild size="sm" variant={groupBy === "site" ? "secondary" : "ghost"}>
                <Link href={href({ par: "chantier" })}>Par chantier</Link>
              </Button>
            </div>
          ) : null}
        </div>
      </div>
      <PlanningBoard
        view={board.view}
        groupBy={groupBy}
        days={board.days}
        weeks={board.weeks}
        rows={groupBy === "site" ? board.siteRows : board.memberRows}
        assignments={board.assignments}
        members={board.memberOptions}
        sites={board.siteOptions}
        stepsBySite={board.stepsBySite}
      />
    </>
  );
}
