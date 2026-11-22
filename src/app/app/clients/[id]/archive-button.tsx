"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { ConfirmButton } from "@/components/app/confirm-button";
import { notify } from "@/components/app/notify";
import { Button } from "@/components/ui/button";
import { archiveClientAction } from "@/server/actions/business";

export function ArchiveClientButton({ clientId, archived }: { clientId: string; archived: boolean }) {
  return (
    <ConfirmButton
      title={archived ? "Réactiver ce client ?" : "Archiver ce client ?"}
      description={
        archived
          ? "Il réapparaîtra dans la liste des clients."
          : "Il disparaît de la liste mais ses chantiers et documents sont conservés."
      }
      confirmLabel={archived ? "Réactiver" : "Archiver"}
      destructive={false}
      onConfirm={async () => notify(await archiveClientAction(clientId, !archived))}
    >
      <Button variant="outline">
        {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
        {archived ? "Réactiver" : "Archiver"}
      </Button>
    </ConfirmButton>
  );
}
