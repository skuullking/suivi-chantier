import type { SiteStatus, StepStatus } from "@/generated/prisma/enums";
import { SITE_STATUS_LABELS, STEP_STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

const SITE_STATUS_STYLES: Record<SiteStatus, string> = {
  DRAFT: "bg-ink-100 text-ink-700",
  PLANNED: "bg-ink-100 text-ink-700",
  IN_PROGRESS: "bg-signal-400 text-ink-900",
  PAUSED: "bg-ink-200 text-ink-800",
  COMPLETED: "bg-emerald-100 text-emerald-900",
  ARCHIVED: "bg-ink-200 text-ink-600",
};

const STEP_STATUS_STYLES: Record<StepStatus, string> = {
  TODO: "bg-ink-100 text-ink-700",
  IN_PROGRESS: "bg-signal-400 text-ink-900",
  DONE: "bg-emerald-100 text-emerald-900",
};

/** Mono, uppercase label chip (the « Ruban » site-label look). */
export const chip = "label-mono inline-flex h-6 items-center gap-1.5 rounded-md px-2 whitespace-nowrap";

export function SiteStatusBadge({ status }: { status: SiteStatus }) {
  return <span className={cn(chip, SITE_STATUS_STYLES[status])}>{SITE_STATUS_LABELS[status]}</span>;
}

export function StepStatusBadge({ status }: { status: StepStatus }) {
  return <span className={cn(chip, STEP_STATUS_STYLES[status])}>{STEP_STATUS_LABELS[status]}</span>;
}

/** Hazard tape swatch: the only place yellow/black stripes are used, to flag a delay. */
export function HazardSwatch({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("hazard inline-block size-3.5 shrink-0 rounded-[3px]", className)} />
  );
}

export function LateBadge({ label = "En retard" }: { label?: string }) {
  return (
    <span className={cn(chip, "bg-red-100 pl-1 text-red-800")}>
      <HazardSwatch /> {label}
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
    <div className={cn("flex items-center gap-3", className)}>
      <div
        role="progressbar"
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progression"}
        className="bg-ink-200 h-2.5 flex-1 overflow-hidden rounded-[3px]"
      >
        <div
          className={cn("h-full rounded-[3px] transition-all", v === 100 ? "bg-emerald-700" : "bg-ink-900")}
          style={{ width: `${v}%` }}
        />
      </div>
      <span className="text-ink-900 w-11 text-right font-mono text-xs font-bold tabular-nums">{v} %</span>
    </div>
  );
}

/**
 * Segmented "ribbon": one segment per step (done = ink, in progress = signal yellow, to do = grey).
 * Purely visual; pair it with a textual progress for assistive tech.
 */
export function StepRibbon({
  steps,
  className,
  size = "md",
  tone = "light",
}: {
  steps: { status: StepStatus }[];
  className?: string;
  size?: "sm" | "md";
  tone?: "light" | "dark";
}) {
  if (steps.length === 0) return null;
  return (
    <div
      aria-hidden
      className={cn("grid gap-[3px]", className)}
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
    >
      {steps.map((s, i) => (
        <span
          key={i}
          className={cn(
            "rounded-[2px]",
            size === "sm" ? "h-2" : "h-3",
            s.status === "DONE" && (tone === "dark" ? "bg-white" : "bg-ink-900"),
            s.status === "IN_PROGRESS" && "bg-signal-400 shadow-[inset_0_0_0_1.5px_#121212]",
            s.status === "TODO" && (tone === "dark" ? "bg-ink-700" : "bg-ink-200"),
          )}
        />
      ))}
    </div>
  );
}
