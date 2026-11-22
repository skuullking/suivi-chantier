import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { PlanningBoard } from "@/components/app/planning-board";
import { Button } from "@/components/ui/button";
import { requireManager } from "@/server/auth/context";
import { buildBoard } from "../../../planning/board-data";

export default async function SitePlanningPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const ctx = await requireManager();
  const { id } = await params;
  const sp = await searchParams;
  const board = await buildBoard(ctx, { vue: "semaine", date: sp.date }, id);
  const href = (date: string) => `/app/chantiers/${id}/planning?date=${date}`;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="icon" aria-label="Semaine précédente">
          <Link href={href(board.prevKey)}>
            <ChevronLeft />
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={href(board.todayKey)}>Cette semaine</Link>
        </Button>
        <Button asChild variant="outline" size="icon" aria-label="Semaine suivante">
          <Link href={href(board.nextKey)}>
            <ChevronRight />
          </Link>
        </Button>
        <h2 className="font-semibold">{board.title}</h2>
        <Link href="/app/planning" className="ml-auto text-sm text-orange-700 hover:underline">
          Planning de toute l&apos;équipe
        </Link>
      </div>
      <PlanningBoard
        view="week"
        groupBy="person"
        days={board.days}
        rows={board.memberRows}
        assignments={board.assignments}
        members={board.memberOptions}
        sites={board.siteOptions}
        fixedSiteId={id}
        stepsBySite={board.stepsBySite}
      />
    </div>
  );
}
