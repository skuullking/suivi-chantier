"use client";

import { useActionState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/forms/form-parts";
import { initialActionState } from "@/lib/action-state";
import { resetPasswordAction } from "@/server/actions/auth";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, initialActionState);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormAlert error={state.error} />
      <input type="hidden" name="token" value={token} />
      <Field
        name="password"
        type="password"
        label="Nouveau mot de passe"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.password}
      />
      <Field
        name="confirm"
        type="password"
        label="Confirmer le mot de passe"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.confirm}
      />
      <SubmitButton className="h-11 w-full text-base">Enregistrer</SubmitButton>
    </form>
  );
}
