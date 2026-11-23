"use client";

import { useOptimistic, useTransition } from "react";
import { notify } from "@/components/app/notify";
import type { SiteStatus } from "@/generated/prisma/enums";
import { SITE_STATUS_LABELS } from "@/lib/labels";
import { setSiteStatusAction } from "@/server/actions/business";

export function SiteStatusMenu({ siteId, status }: { siteId: string; status: SiteStatus }) {
  const [, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(status);
  return (
    <select
      aria-label="Statut du chantier"
      value={shown}
      onChange={(e) => {
        const value = e.target.value as SiteStatus;
        startTransition(async () => {
          setShown(value);
          notify(await setSiteStatusAction(siteId, value));
        });
      }}
      className="h-9 rounded-lg border bg-white px-2 text-sm"
    >
      {(Object.keys(SITE_STATUS_LABELS) as SiteStatus[]).map((s) => (
        <option key={s} value={s}>
          {SITE_STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
