"use client";

import { Pencil, Trash2, UserPlus } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { notify } from "@/components/app/notify";
import { Field, FormAlert, SubmitButton } from "@/components/forms/form-parts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { type ActionState, initialActionState } from "@/lib/action-state";
import { ROLE_LABELS } from "@/lib/labels";
import { deleteSiteAction, setSiteMembersAction, updateSiteAction } from "@/server/actions/business";

type SiteDefaults = {
  title: string;
  address: string;
  postalCode: string;
  city: string;
  plannedStart: string;
  plannedEnd: string;
  description: string;
  instructions: string;
};

export function EditSiteDialog({ siteId, defaults }: { siteId: string; defaults: SiteDefaults }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await updateSiteAction(siteId, prev, fd);
    if (result.ok) {
      notify(result);
      setOpen(false);
    }
    return result;
  }, initialActionState);
  const fe = state.fieldErrors ?? {};
  const v = state.values;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil aria-hidden /> Modifier
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Modifier le chantier</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormAlert error={state.error} />
          </div>
          <Field
            name="title"
            label="Titre"
            className="sm:col-span-2"
            defaultValue={v?.title ?? defaults.title}
            errors={fe.title}
          />
          <Field
            name="address"
            label="Adresse"
            className="sm:col-span-2"
            defaultValue={v?.address ?? defaults.address}
            errors={fe.address}
          />
          <Field name="postalCode" label="Code postal" defaultValue={v?.postalCode ?? defaults.postalCode} />
          <Field name="city" label="Ville" defaultValue={v?.city ?? defaults.city} />
          <Field
            name="plannedStart"
            label="Début prévu"
            type="date"
            defaultValue={v?.plannedStart ?? defaults.plannedStart}
            errors={fe.plannedStart}
          />
          <Field
            name="plannedEnd"
            label="Fin prévue"
            type="date"
            defaultValue={v?.plannedEnd ?? defaults.plannedEnd}
            errors={fe.plannedEnd}
          />
          <Field
            name="description"
            label="Description"
            multiline
            className="sm:col-span-2"
            defaultValue={v?.description ?? defaults.description}
          />
          <Field
            name="instructions"
            label="Consignes pour l'équipe"
            multiline
            className="sm:col-span-2"
            defaultValue={v?.instructions ?? defaults.instructions}
          />
          <div className="sm:col-span-2">
            <SubmitButton>Enregistrer</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TeamDialog({
  siteId,
  members,
  selected,
}: {
  siteId: string;
  members: { id: string; name: string; role: "OWNER" | "OFFICE" | "WORKER" }[];
  selected: string[];
}) {
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState(selected);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setIds(selected);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <UserPlus aria-hidden /> Modifier
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Équipe du chantier</DialogTitle>
          <DialogDescription>Les ouvriers cochés voient ce chantier dans leur application.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {members.map((m) => (
            <label key={m.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
              <Checkbox
                checked={ids.includes(m.id)}
                onCheckedChange={(c) =>
                  setIds((cur) => (c === true ? [...cur, m.id] : cur.filter((x) => x !== m.id)))
                }
                aria-label={m.name}
              />
              <span className="flex-1">{m.name}</span>
              <span className="text-muted-foreground text-xs">{ROLE_LABELS[m.role]}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await setSiteMembersAction(siteId, ids);
                notify(result);
                if (result.ok) setOpen(false);
              })
            }
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteSiteButton({ siteId, title }: { siteId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="text-destructive justify-start">
          <Trash2 aria-hidden /> Supprimer le chantier
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supprimer « {title} » ?</DialogTitle>
          <DialogDescription>
            Étapes, planning, photos et documents du chantier seront définitivement supprimés. Pour garder une
            trace, préférez le statut « Archivé ».
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="delete-confirm">Tapez SUPPRIMER pour confirmer</Label>
          <Input id="delete-confirm" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={pending || confirmation.trim().toUpperCase() !== "SUPPRIMER"}
            onClick={() => startTransition(async () => notify(await deleteSiteAction(siteId, confirmation)))}
          >
            Supprimer définitivement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
