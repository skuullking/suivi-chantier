"use client";

import { useActionState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/forms/form-parts";
import { initialActionState } from "@/lib/action-state";
import { acceptInvitationAction } from "@/server/actions/auth";

export function AcceptInvitationForm({
  token,
  defaultName,
  existingUser,
}: {
  token: string;
  defaultName: string;
  existingUser: boolean;
}) {
  const [state, action] = useActionState(acceptInvitationAction, initialActionState);
  const v = state.values ?? {};
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormAlert error={state.error} />
      <input type="hidden" name="token" value={token} />
      <Field
        name="name"
        label="Votre nom"
        autoComplete="name"
        required
        defaultValue={v.name ?? defaultName}
        errors={state.fieldErrors?.name}
      />
      <Field
        name="phone"
        type="tel"
        label="Téléphone (facultatif)"
        autoComplete="tel"
        defaultValue={v.phone}
        errors={state.fieldErrors?.phone}
      />
      <Field
        name="password"
        type="password"
        label={existingUser ? "Votre mot de passe actuel" : "Choisissez un mot de passe"}
        hint={existingUser ? "Vous avez déjà un compte ChantierLink." : "10 caractères minimum."}
        autoComplete={existingUser ? "current-password" : "new-password"}
        required
        errors={state.fieldErrors?.password}
      />
      <SubmitButton className="h-11 w-full text-base">Rejoindre l&apos;équipe</SubmitButton>
    </form>
  );
}
