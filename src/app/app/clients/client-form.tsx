"use client";

import { useActionState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/forms/form-parts";
import { NativeSelect } from "@/components/forms/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { CLIENT_TYPE_LABELS } from "@/lib/labels";

export type ClientFormDefaults = {
  type?: string;
  name?: string;
  companyName?: string | null;
  emails?: string[];
  phones?: string[];
  addresses?: string[];
  tags?: string[];
  notes?: string | null;
  consentCommunications?: boolean;
};

export function ClientForm({
  action,
  defaults = {},
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  defaults?: ClientFormDefaults;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const v = state.values;
  const fe = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormAlert error={state.error} message={state.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <NativeSelect
          name="type"
          label="Type de client"
          defaultValue={v?.type ?? defaults.type ?? "INDIVIDUAL"}
          options={Object.entries(CLIENT_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <Field
          name="name"
          label="Nom du client"
          placeholder="M. et Mme Dupont"
          defaultValue={v?.name ?? defaults.name ?? ""}
          errors={fe.name}
          required
        />
        <Field
          name="companyName"
          label="Société (facultatif)"
          defaultValue={v?.companyName ?? defaults.companyName ?? ""}
          errors={fe.companyName}
        />
        <Field
          name="emails"
          label="E-mail(s)"
          type="text"
          inputMode="email"
          placeholder="client@exemple.fr"
          hint="Plusieurs adresses : séparez-les par une virgule."
          defaultValue={v?.emails ?? defaults.emails?.join(", ") ?? ""}
          errors={fe.emails}
        />
        <Field
          name="phones"
          label="Téléphone(s)"
          type="text"
          inputMode="tel"
          placeholder="06 12 34 56 78"
          hint="Plusieurs numéros : séparez-les par une virgule."
          defaultValue={v?.phones ?? defaults.phones?.join(", ") ?? ""}
          errors={fe.phones}
        />
        <Field
          name="tags"
          label="Étiquettes"
          placeholder="prioritaire, parrainage"
          hint="Séparées par des virgules."
          defaultValue={v?.tags ?? defaults.tags?.join(", ") ?? ""}
          errors={fe.tags}
        />
      </div>
      <Field
        name="addresses"
        label="Adresse(s)"
        multiline
        rows={2}
        placeholder="8 chemin des Vignes, 31320 Castanet-Tolosan"
        hint="Une adresse par ligne."
        defaultValue={v?.addresses ?? defaults.addresses?.join("\n") ?? ""}
        errors={fe.addresses}
      />
      <Field
        name="notes"
        label="Notes internes"
        multiline
        rows={3}
        defaultValue={v?.notes ?? defaults.notes ?? ""}
        errors={fe.notes}
      />
      <div className="flex items-start gap-2">
        <Checkbox
          id="consentCommunications"
          name="consentCommunications"
          defaultChecked={v ? v.consentCommunications === "on" : (defaults.consentCommunications ?? false)}
        />
        <Label htmlFor="consentCommunications" className="text-sm leading-snug font-normal">
          Le client accepte de recevoir des nouvelles du chantier (e-mail, SMS, WhatsApp).
        </Label>
      </div>
      <div>
        <SubmitButton pendingLabel="Enregistrement…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
