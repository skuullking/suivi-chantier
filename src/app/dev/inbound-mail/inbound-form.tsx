"use client";

import { useActionState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/forms/form-parts";
import { NativeSelect } from "@/components/forms/native-select";
import { initialActionState } from "@/lib/action-state";
import { simulateInboundMailAction } from "./actions";

export function InboundMailForm({ addresses }: { addresses: { label: string; address: string }[] }) {
  const [state, action] = useActionState(simulateInboundMailAction, initialActionState);
  return (
    <form action={action} className="grid gap-3 rounded-xl border bg-white p-4">
      <FormAlert error={state.error} message={state.message} />
      <NativeSelect
        name="to"
        label="Destinataire"
        options={addresses.map((a) => ({ value: a.address, label: `${a.address} (${a.label})` }))}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="from" label="Expéditeur" type="email" defaultValue="factures@scierie-comminges.fr" />
        <Field name="fromName" label="Nom de l'expéditeur" defaultValue="Scierie du Comminges" />
      </div>
      <Field name="subject" label="Objet" defaultValue="Facture F-2026-881 — chantier Dupont" />
      <Field
        name="body"
        label="Texte de l'e-mail"
        multiline
        rows={3}
        defaultValue="Bonjour, veuillez trouver ci-joint notre facture."
      />
      <fieldset className="grid gap-2 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">Pièce jointe</legend>
        <input type="file" name="file" aria-label="Fichier joint" className="text-sm" />
        <p className="text-muted-foreground text-xs">
          Ou laissez vide pour générer un PDF à partir du texte ci-dessous :
        </p>
        <Field name="attachmentTitle" label="Titre du PDF" defaultValue="Facture F-2026-881" />
        <Field
          name="attachmentText"
          label="Contenu du PDF"
          multiline
          rows={5}
          defaultValue={
            "SCIERIE DU COMMINGES SARL\nFacture n° F-2026-881 du 18/11/2026\nLivraison chantier Dupont — Castanet-Tolosan\nLiteaux et contre-liteaux douglas\nTotal TTC : 1 284,00 €"
          }
        />
      </fieldset>
      <div>
        <SubmitButton pendingLabel="Envoi…">Envoyer l&apos;e-mail</SubmitButton>
      </div>
    </form>
  );
}
