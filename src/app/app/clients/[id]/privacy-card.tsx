"use client";

import { Download, EyeOff, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { ConfirmButton } from "@/components/app/confirm-button";
import { notify } from "@/components/app/notify";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { anonymizeClientAction, deleteClientAction } from "@/server/actions/account";

/** GDPR actions on a client: access / portability, anonymization, erasure. */
export function PrivacyActions({ clientId, anonymized }: { clientId: string; anonymized: boolean }) {
  const [confirmation, setConfirmation] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid gap-2">
      <Button asChild variant="outline" className="justify-start">
        <a href={`/api/export/client/${clientId}`}>
          <Download aria-hidden /> Exporter ses données (ZIP)
        </a>
      </Button>
      {!anonymized ? (
        <ConfirmButton
          title="Anonymiser ce client ?"
          description="Son nom, ses e-mails, téléphones, adresses et notes sont effacés. Les chantiers et documents comptables sont conservés (obligations légales). Les liens de suivi sont révoqués. Irréversible."
          confirmLabel="Anonymiser"
          onConfirm={async () => notify(await anonymizeClientAction(clientId))}
        >
          <Button variant="outline" className="justify-start">
            <EyeOff aria-hidden /> Anonymiser
          </Button>
        </ConfirmButton>
      ) : null}
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="ghost" className="text-destructive justify-start">
            <Trash2 aria-hidden /> Supprimer toutes ses données
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer définitivement ce client ?</DialogTitle>
            <DialogDescription>
              Le client, ses chantiers, documents, photos et fichiers sont effacés. Attention : vous devez
              conserver vos factures 10 ans ; préférez l&apos;anonymisation si des documents comptables
              existent.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="client-delete-confirm">Tapez SUPPRIMER pour confirmer</Label>
            <Input
              id="client-delete-confirm"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={pending || confirmation.trim().toUpperCase() !== "SUPPRIMER"}
              onClick={() =>
                startTransition(async () => notify(await deleteClientAction(clientId, confirmation)))
              }
            >
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
