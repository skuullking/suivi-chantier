"use client";

import { useActionState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/forms/form-parts";
import { initialActionState } from "@/lib/action-state";
import { signInAction } from "@/server/actions/auth";

export function SignInForm({ next, resetDone }: { next?: string; resetDone?: boolean }) {
  const [state, action] = useActionState(signInAction, initialActionState);
  return (
    <form action={action} className="grid gap-4" noValidate>
      {resetDone && !state.error ? (
        <FormAlert message="Mot de passe modifié. Vous pouvez vous connecter." />
      ) : null}
      <FormAlert error={state.error} />
      <input type="hidden" name="suite" value={next ?? ""} />
      <Field
        name="email"
        type="email"
        label="Adresse e-mail"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        errors={state.fieldErrors?.email}
      />
      <Field
        name="password"
        type="password"
        label="Mot de passe"
        autoComplete="current-password"
        required
        errors={state.fieldErrors?.password}
      />
      <SubmitButton className="h-11 w-full text-base" pendingLabel="Connexion…">
        Se connecter
      </SubmitButton>
    </form>
  );
}
