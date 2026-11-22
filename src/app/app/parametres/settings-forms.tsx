"use client";

import { useActionState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/forms/form-parts";
import { NativeSelect } from "@/components/forms/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { initialActionState } from "@/lib/action-state";
import { TRADE_OPTIONS } from "@/lib/labels";
import { updateOrganizationAction, updateValidationSettingsAction } from "@/server/actions/business";

export function OrganizationForm({
  defaults,
}: {
  defaults: { name: string; trade: string; phone: string; email: string; address: string; timezone: string };
}) {
  const [state, formAction] = useActionState(updateOrganizationAction, initialActionState);
  const fe = state.fieldErrors ?? {};
  const v = state.values;
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormAlert error={state.error} message={state.message} />
      </div>
      <Field
        name="name"
        label="Nom de l'entreprise"
        defaultValue={v?.name ?? defaults.name}
        errors={fe.name}
      />
      <NativeSelect
        name="trade"
        label="Métier"
        defaultValue={v?.trade ?? defaults.trade}
        options={TRADE_OPTIONS}
      />
      <Field name="phone" label="Téléphone" defaultValue={v?.phone ?? defaults.phone} errors={fe.phone} />
      <Field
        name="email"
        label="E-mail de contact"
        defaultValue={v?.email ?? defaults.email}
        errors={fe.email}
      />
      <Field
        name="address"
        label="Adresse"
        className="sm:col-span-2"
        defaultValue={v?.address ?? defaults.address}
        errors={fe.address}
      />
      <NativeSelect
        name="timezone"
        label="Fuseau horaire"
        defaultValue={v?.timezone ?? defaults.timezone}
        options={[
          { value: "Europe/Paris", label: "France métropolitaine (Europe/Paris)" },
          { value: "Europe/Brussels", label: "Belgique (Europe/Brussels)" },
          { value: "Europe/Zurich", label: "Suisse (Europe/Zurich)" },
          { value: "Europe/Luxembourg", label: "Luxembourg (Europe/Luxembourg)" },
          { value: "Indian/Reunion", label: "La Réunion (Indian/Reunion)" },
          { value: "America/Martinique", label: "Martinique (America/Martinique)" },
          { value: "America/Guadeloupe", label: "Guadeloupe (America/Guadeloupe)" },
        ]}
      />
      <div className="sm:col-span-2">
        <SubmitButton>Enregistrer</SubmitButton>
      </div>
    </form>
  );
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 12).map((h) => ({
  value: String(h),
  label: `${h} h`,
}));

export function ValidationSettingsForm({
  defaults,
}: {
  defaults: {
    photosAutoApprove: boolean;
    officeCanValidatePhotos: boolean;
    summaryAutoSend: boolean;
    summaryHour: number;
    reminderHour: number;
  };
}) {
  const [state, formAction] = useActionState(updateValidationSettingsAction, initialActionState);
  const checks = [
    {
      name: "photosAutoApprove",
      label: "Approuver automatiquement les photos de l'équipe",
      hint: "Sinon, chaque photo passe par « À traiter » avant d'être visible du client.",
      value: defaults.photosAutoApprove,
    },
    {
      name: "officeCanValidatePhotos",
      label: "Le bureau peut valider les photos",
      hint: "Sinon, seul le patron valide.",
      value: defaults.officeCanValidatePhotos,
    },
    {
      name: "summaryAutoSend",
      label: "Envoyer automatiquement le résumé du jour au client",
      hint: "Par défaut, chaque résumé attend votre approbation (un clic).",
      value: defaults.summaryAutoSend,
    },
  ];
  return (
    <form action={formAction} className="grid gap-4">
      <FormAlert error={state.error} message={state.message} />
      {checks.map((c) => (
        <div key={c.name} className="flex items-start gap-3">
          <Checkbox id={c.name} name={c.name} defaultChecked={c.value} className="mt-0.5" />
          <div>
            <Label htmlFor={c.name}>{c.label}</Label>
            <p className="text-muted-foreground text-sm">{c.hint}</p>
          </div>
        </div>
      ))}
      <div className="grid gap-4 sm:grid-cols-2">
        <NativeSelect
          name="summaryHour"
          label="Heure du résumé du jour"
          defaultValue={String(defaults.summaryHour)}
          options={HOURS}
        />
        <NativeSelect
          name="reminderHour"
          label="Heure du rappel de la veille (ouvriers)"
          defaultValue={String(defaults.reminderHour)}
          options={HOURS}
        />
      </div>
      <div>
        <SubmitButton>Enregistrer</SubmitButton>
      </div>
    </form>
  );
}
