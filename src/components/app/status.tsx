import { AlertTriangle } from "lucide-react";
import type { SiteStatus, StepStatus } from "@/generated/prisma/enums";
import { SITE_STATUS_LABELS, STEP_STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

const SITE_STATUS_STYLES: Record<SiteStatus, string> = {
  DRAFT: "bg-stone-100 text-stone-700",
  PLANNED: "bg-sky-100 text-sky-800",
  IN_PROGRESS: "bg-orange-100 text-orange-800",
  PAUSED: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  ARCHIVED: "bg-stone-200 text-stone-600",
};

const STEP_STATUS_STYLES: Record<StepStatus, string> = {
  TODO: "bg-stone-100 text-stone-700",
  IN_PROGRESS: "bg-orange-100 text-orange-800",
  DONE: "bg-emerald-100 text-emerald-800",
};

const pill = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

export function SiteStatusBadge({ status }: { status: SiteStatus }) {
  return <span className={cn(pill, SITE_STATUS_STYLES[status])}>{SITE_STATUS_LABELS[status]}</span>;
}

export function StepStatusBadge({ status }: { status: StepStatus }) {
  return <span className={cn(pill, STEP_STATUS_STYLES[status])}>{STEP_STATUS_LABELS[status]}</span>;
}

export function LateBadge({ label = "En retard" }: { label?: string }) {
  return (
    <span className={cn(pill, "bg-red-100 text-red-800")}>
      <AlertTriangle className="size-3" aria-hidden /> {label}
    </span>
  );
}

/** Accessible progress bar (value 0-100). */
export function ProgressBar({
  value,
  className,
  label,
}: {
  value: number;
  className?: string;
  label?: string;
}) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="progressbar"
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progression"}
        className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200"
      >
        <div
          className={cn("h-full rounded-full transition-all", v === 100 ? "bg-emerald-600" : "bg-orange-600")}
          style={{ width: `${v}%` }}
        />
      </div>
      <span className="w-10 text-right text-xs font-semibold text-stone-700 tabular-nums">{v} %</span>
    </div>
  );
}
