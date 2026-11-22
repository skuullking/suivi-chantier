import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  /** Small mono label above the title (code, date, count…). */
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="label-mono text-ink-600 mb-2">{eyebrow}</div> : null}
        <h1 className="text-ink-900 text-3xl leading-none font-extrabold sm:text-[2.6rem]">{title}</h1>
        {description ? <div className="text-ink-600 mt-2 text-sm sm:text-base">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border-ink-300 flex flex-col items-center justify-center rounded-[14px] border border-dashed bg-white px-6 py-12 text-center">
      {Icon ? <Icon className="text-ink-400 mb-3 size-10" /> : null}
      <p className="font-heading text-ink-900 text-lg font-extrabold">{title}</p>
      {description ? <p className="text-muted-foreground mt-1 max-w-md text-sm">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
