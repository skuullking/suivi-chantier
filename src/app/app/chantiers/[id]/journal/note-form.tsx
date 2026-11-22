"use client";

import { useActionState, useRef, useState } from "react";
import { notify } from "@/components/app/notify";
import { FormAlert, SubmitButton } from "@/components/forms/form-parts";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type ActionState, initialActionState } from "@/lib/action-state";
import { createNoteAction } from "@/server/actions/business";

export function NoteForm({ siteId }: { siteId: string }) {
  const form = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<"NOTE" | "PROBLEM">("NOTE");
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await createNoteAction(siteId, prev, fd);
    if (result.ok) {
      notify(result);
      form.current?.reset();
      setKind("NOTE");
    }
    return result;
  }, initialActionState);
  return (
    <form ref={form} action={formAction} className="grid gap-3">
      <FormAlert error={state.error} />
      <div className="flex gap-4 text-sm" role="radiogroup" aria-label="Type d'entrée">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="kind"
            value="NOTE"
            checked={kind === "NOTE"}
            onChange={() => setKind("NOTE")}
          />
          Note
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="kind"
            value="PROBLEM"
            checked={kind === "PROBLEM"}
            onChange={() => setKind("PROBLEM")}
          />
          Problème (prévient le patron, jamais visible du client)
        </label>
      </div>
      <Textarea
        name="text"
        rows={3}
        aria-label="Texte de la note"
        placeholder="Ce qui s'est passé aujourd'hui…"
      />
      {kind === "NOTE" ? (
        <div className="flex items-center gap-2">
          <Checkbox id="note-internal" name="internal" defaultChecked />
          <Label htmlFor="note-internal" className="font-normal">
            Note interne (non visible par le client)
          </Label>
        </div>
      ) : null}
      <div>
        <SubmitButton>Ajouter</SubmitButton>
      </div>
    </form>
  );
}
