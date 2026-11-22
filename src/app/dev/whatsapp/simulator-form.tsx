"use client";

import { useActionState, useRef, useState } from "react";
import { FormAlert, SubmitButton } from "@/components/forms/form-parts";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";
import { simulateWhatsAppAction } from "./actions";

const TYPES = [
  { value: "text", label: "Texte" },
  { value: "image", label: "Photo" },
  { value: "audio", label: "Vocal" },
  { value: "document", label: "Document" },
] as const;

export function SimulatorForm({ from, name }: { from: string; name: string }) {
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("text");
  const form = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await simulateWhatsAppAction(prev, fd);
    if (result.ok) form.current?.reset();
    return result;
  }, initialActionState);

  return (
    <form ref={form} action={action} className="grid gap-2 border-t bg-white p-3">
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="type" value={type} />
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Type de message">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={type === t.value}
            onClick={() => setType(t.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              type === t.value ? "border-emerald-600 bg-emerald-50 font-semibold" : "bg-white",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {type === "text" ? (
        <textarea
          name="text"
          rows={2}
          placeholder="J'arrive · Étape terminée · Problème : …"
          aria-label="Message"
          className="rounded-lg border p-2 text-sm"
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            name="caption"
            placeholder={type === "document" ? "Titre (ex. Facture Point P)" : "Légende (facultatif)"}
            aria-label="Légende"
            className="h-9 rounded-lg border px-2 text-sm"
          />
          <input
            type="file"
            name="file"
            aria-label="Fichier (facultatif)"
            accept={type === "image" ? "image/*" : type === "audio" ? "audio/*" : ".pdf,image/*"}
            className="text-sm"
          />
          {type === "audio" ? (
            <textarea
              name="transcript"
              rows={2}
              placeholder="Texte que la transcription simulée renverra (facultatif)"
              aria-label="Texte du vocal"
              className="rounded-lg border p-2 text-sm sm:col-span-2"
            />
          ) : null}
          {type === "document" ? (
            <textarea
              name="text"
              rows={3}
              placeholder={
                "Contenu du PDF généré si aucun fichier n'est joint (ex. Facture n°123 — Chantier Dupont — Total TTC 1 250,00 €)"
              }
              aria-label="Contenu du document"
              className="rounded-lg border p-2 text-sm sm:col-span-2"
            />
          ) : null}
          <p className="text-muted-foreground text-xs sm:col-span-2">
            Sans fichier, un exemple est généré automatiquement.
          </p>
        </div>
      )}
      <FormAlert error={state.error} />
      <div>
        <SubmitButton pendingLabel="Envoi…">Envoyer</SubmitButton>
      </div>
    </form>
  );
}
