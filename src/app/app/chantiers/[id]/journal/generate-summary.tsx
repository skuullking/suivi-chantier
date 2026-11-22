"use client";

import { Sparkles } from "lucide-react";
import { useTransition } from "react";
import { notify } from "@/components/app/notify";
import { Button } from "@/components/ui/button";
import { generateSummaryNowAction } from "@/server/actions/inbox";

export function GenerateSummaryButton({ siteId }: { siteId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(async () => notify(await generateSummaryNowAction(siteId)))}
    >
      <Sparkles aria-hidden /> {pending ? "Rédaction…" : "Générer le résumé du jour"}
    </Button>
  );
}
