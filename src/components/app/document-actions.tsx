"use client";

import { Download, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { ConfirmButton } from "@/components/app/confirm-button";
import { notify } from "@/components/app/notify";
import { Field, FormAlert, SubmitButton } from "@/components/forms/form-parts";
import { NativeSelect } from "@/components/forms/native-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { initialActionState } from "@/lib/action-state";
import { DOCUMENT_TYPE_LABELS } from "@/lib/labels";
import {
  deleteDocumentAction,
  setDocumentVisibilityAction,
  updateDocumentAction,
} from "@/server/actions/business";

export type EditableDocument = {
  id: string;
  name: string;
  type: string;
  siteId: string | null;
  clientId: string | null;
  documentDate: string | null;
  amount: string | null;
  supplier: string | null;
  tags: string[];
  visibleToClient: boolean;
  previewUrl: string;
  downloadUrl: string;
  mimeType: string;
};

type Option = { value: string; label: string };

export function DocumentActions({
  doc,
  sites,
  clients,
  canEdit,
}: {
  doc: EditableDocument;
  sites: Option[];
  clients: Option[];
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center justify-end gap-1">
      <Button asChild variant="ghost" size="icon" title="Aperçu">
        <a
          href={doc.previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Aperçu de ${doc.name}`}
        >
          <Eye />
        </a>
      </Button>
      <Button asChild variant="ghost" size="icon" title="Télécharger">
        <a href={doc.downloadUrl} aria-label={`Télécharger ${doc.name}`}>
          <Download />
        </a>
      </Button>
      {canEdit ? (
        <>
          <Button
            variant="ghost"
            size="icon"
            disabled={pending}
            title={doc.visibleToClient ? "Masquer au client" : "Rendre visible au client"}
            aria-label={doc.visibleToClient ? "Masquer au client" : "Rendre visible au client"}
            onClick={() =>
              startTransition(async () =>
                notify(await setDocumentVisibilityAction(doc.id, !doc.visibleToClient)),
              )
            }
          >
            {doc.visibleToClient ? <Eye className="text-emerald-700" /> : <EyeOff className="text-ink-400" />}
          </Button>
          <EditDocumentDialog doc={doc} sites={sites} clients={clients} />
          <ConfirmButton
            title="Supprimer ce document ?"
            description="Le fichier sera définitivement supprimé."
            confirmLabel="Supprimer"
            onConfirm={async () => notify(await deleteDocumentAction(doc.id))}
          >
            <Button variant="ghost" size="icon" aria-label={`Supprimer ${doc.name}`}>
              <Trash2 />
            </Button>
          </ConfirmButton>
        </>
      ) : null}
    </div>
  );
}

function EditDocumentDialog({
  doc,
  sites,
  clients,
}: {
  doc: EditableDocument;
  sites: Option[];
  clients: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(async (prev: typeof initialActionState, fd: FormData) => {
    const result = await updateDocumentAction(doc.id, prev, fd);
    if (result.ok) {
      notify(result);
      setOpen(false);
    }
    return result;
  }, initialActionState);
  const fe = state.fieldErrors ?? {};
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Modifier ${doc.name}`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier le document</DialogTitle>
          <DialogDescription>Le fichier original n&apos;est jamais modifié.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-3">
          <FormAlert error={state.error} />
          <Field name="name" label="Nom" defaultValue={doc.name} errors={fe.name} />
          <NativeSelect
            name="type"
            label="Type"
            defaultValue={doc.type}
            options={Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <NativeSelect
            name="siteId"
            label="Chantier"
            placeholder="Aucun chantier"
            defaultValue={doc.siteId ?? ""}
            options={sites}
          />
          <NativeSelect
            name="clientId"
            label="Client"
            placeholder="Aucun client (ou celui du chantier)"
            defaultValue={doc.clientId ?? ""}
            options={clients}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              name="documentDate"
              label="Date du document"
              type="date"
              defaultValue={doc.documentDate ?? ""}
              errors={fe.documentDate}
            />
            <Field
              name="amount"
              label="Montant TTC (€)"
              inputMode="decimal"
              defaultValue={doc.amount ?? ""}
              errors={fe.amount}
            />
          </div>
          <Field name="supplier" label="Fournisseur / émetteur" defaultValue={doc.supplier ?? ""} />
          <Field name="tags" label="Étiquettes" defaultValue={doc.tags.join(", ")} />
          <div className="flex items-center gap-2">
            <Checkbox id={`visible-${doc.id}`} name="visibleToClient" defaultChecked={doc.visibleToClient} />
            <Label htmlFor={`visible-${doc.id}`} className="font-normal">
              Visible par le client (portail)
            </Label>
          </div>
          <SubmitButton>Enregistrer</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
