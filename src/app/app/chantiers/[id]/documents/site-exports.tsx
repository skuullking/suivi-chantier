"use client";

import { Archive, FileCheck2 } from "lucide-react";
import { useState, useTransition } from "react";
import { notify } from "@/components/app/notify";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { generateHandoverAction } from "@/server/actions/data";

/** "Dossier de fin de chantier" (PDF) and complete ZIP export of the site. */
export function SiteExports({ siteId }: { siteId: string }) {
  const [signatures, setSignatures] = useState(true);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3">
      <Button
        disabled={pending}
        onClick={() => startTransition(async () => notify(await generateHandoverAction(siteId, signatures)))}
      >
        <FileCheck2 aria-hidden /> Générer le dossier de fin de chantier
      </Button>
      <div className="flex items-center gap-2">
        <Checkbox
          id="handover-signatures"
          checked={signatures}
          onCheckedChange={(c) => setSignatures(c === true)}
        />
        <Label htmlFor="handover-signatures" className="font-normal">
          Avec cadre de signatures
        </Label>
      </div>
      <Button asChild variant="outline" className="ml-auto">
        <a href={`/api/export/site/${siteId}`}>
          <Archive aria-hidden /> Exporter le chantier (ZIP)
        </a>
      </Button>
    </div>
  );
}
