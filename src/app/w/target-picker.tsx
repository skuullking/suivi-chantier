"use client";

export type UploadTarget = {
  id: string;
  code: string;
  title: string;
  today: boolean;
  steps: { id: string; title: string; status: string }[];
  defaultStepId: string | null;
};

/** Active site + step selectors (changeable in one tap). */
export function TargetPicker({
  targets,
  siteId,
  stepId,
  onSite,
  onStep,
  dark,
}: {
  targets: UploadTarget[];
  siteId: string;
  stepId: string;
  onSite: (id: string) => void;
  onStep: (id: string) => void;
  dark?: boolean;
}) {
  const site = targets.find((t) => t.id === siteId);
  const cls = dark
    ? "h-12 w-full rounded-xl border border-white/30 bg-black/50 px-3 text-base font-semibold text-white"
    : "h-12 w-full rounded-xl border bg-white px-3 text-base font-semibold";
  return (
    <div className="grid grid-cols-2 gap-2">
      <select aria-label="Chantier" className={cls} value={siteId} onChange={(e) => onSite(e.target.value)}>
        {targets.map((t) => (
          <option key={t.id} value={t.id}>
            {t.today ? "★ " : ""}
            {t.title}
          </option>
        ))}
      </select>
      <select aria-label="Étape" className={cls} value={stepId} onChange={(e) => onStep(e.target.value)}>
        <option value="">Sans étape</option>
        {(site?.steps ?? []).map((s) => (
          <option key={s.id} value={s.id}>
            {s.status === "DONE" ? "✔ " : ""}
            {s.title}
          </option>
        ))}
      </select>
    </div>
  );
}
