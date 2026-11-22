"use client";

import { useActionState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/forms/form-parts";
import { initialActionState } from "@/lib/action-state";
import { forgotPasswordAction } from "@/server/actions/auth";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, initialActionState);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormAlert error={state.error} message={state.message} />
      <Field
        name="email"
        type="email"
        label="Adresse e-mail"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        errors={state.fieldErrors?.email}
      />
      <SubmitButton className="h-11 w-full text-base">Envoyer le lien</SubmitButton>
    </form>
  );
}
