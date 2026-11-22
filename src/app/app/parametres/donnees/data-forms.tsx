"use client";

import { useActionState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/forms/form-parts";
import { NativeSelect } from "@/components/forms/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { initialActionState } from "@/lib/action-state";
import { deleteAccountAction, updateRetentionAction } from "@/server/actions/account";

const years = (min: number) =>
  Array.from({ length: 31 - min }, (_, i) => min + i).map((y) => ({ value: String(y), label: `${y} ans` }));

export function RetentionForm({
  defaults,
}: {
  defaults: { retentionDocumentsYears: number; retentionMediaYears: number; retentionPurgeEnabled: boolean };
}) {
  const [state, action] = useActionState(updateRetentionAction, initialActionState);
  return (
    <form action={action} className="grid gap-4">
      <FormAlert error={state.error} message={state.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <NativeSelect
          name="retentionDocumentsYears"
          label="Documents (factures, devis…)"
          hint="10 ans minimum (obligations comptables, garantie décennale)."
          defaultValue={String(defaults.retentionDocumentsYears)}
          options={years(10)}
        />
        <NativeSelect
          name="retentionMediaYears"
          label="Photos et vocaux"
          defaultValue={String(defaults.retentionMediaYears)}
          options={years(1)}
        />
      </div>
      <div className="flex items-start gap-3">
        <Checkbox
          id="retentionPurgeEnabled"
          name="retentionPurgeEnabled"
          defaultChecked={defaults.retentionPurgeEnabled}
          className="mt-0.5"
        />
        <div>
          <Label htmlFor="retentionPurgeEnabled">Supprimer automatiquement ce qui dépasse ces durées</Label>
          <p className="text-muted-foreground text-sm">
            Chaque nuit. Désactivé par défaut : rien n&apos;est effacé sans votre accord.
          </p>
        </div>
      </div>
      <div>
        <SubmitButton>Enregistrer</SubmitButton>
      </div>
    </form>
  );
}

export function DeleteAccountForm({ organizationName }: { organizationName: string }) {
  const [state, action] = useActionState(deleteAccountAction, initialActionState);
  return (
    <form action={action} className="grid gap-3 text-sm">
      <p className="text-muted-foreground">
        Supprime définitivement l&apos;entreprise, ses clients, chantiers, documents, photos et comptes de
        l&apos;équipe. Pensez à télécharger l&apos;export complet avant. Cette action est irréversible.
      </p>
      <FormAlert error={state.error} />
      <Field
        key={`name-${state.values?.organizationName ?? ""}`}
        name="organizationName"
        label={`Tapez le nom de l'entreprise : ${organizationName}`}
        autoComplete="off"
        defaultValue={state.values?.organizationName ?? ""}
      />
      <Field name="password" label="Votre mot de passe" type="password" autoComplete="current-password" />
      <div>
        <SubmitButton variant="destructive" pendingLabel="Suppression…">
          Supprimer définitivement mon compte
        </SubmitButton>
      </div>
    </form>
  );
}
