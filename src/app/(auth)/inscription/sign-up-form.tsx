"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/forms/form-parts";
import { NativeSelect } from "@/components/forms/native-select";
import { initialActionState } from "@/lib/action-state";
import { TRADE_OPTIONS } from "@/lib/labels";
import { signUpAction } from "@/server/actions/auth";

export function SignUpForm() {
  const [state, action] = useActionState(signUpAction, initialActionState);
  const v = state.values ?? {};
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormAlert error={state.error} />
      <Field
        name="organizationName"
        label="Nom de l'entreprise"
        autoComplete="organization"
        required
        defaultValue={v.organizationName}
        errors={fe.organizationName}
      />
      <NativeSelect
        name="trade"
        label="Votre métier principal"
        placeholder="Choisir…"
        options={TRADE_OPTIONS}
        defaultValue={v.trade ?? ""}
        errors={fe.trade}
        required
      />
      <Field
        name="name"
        label="Votre nom"
        autoComplete="name"
        required
        defaultValue={v.name}
        errors={fe.name}
      />
      <Field
        name="email"
        type="email"
        label="Adresse e-mail"
        autoComplete="email"
        required
        defaultValue={v.email}
        errors={fe.email}
      />
      <Field
        name="phone"
        type="tel"
        label="Téléphone (facultatif)"
        autoComplete="tel"
        defaultValue={v.phone}
        errors={fe.phone}
      />
      <Field
        name="password"
        type="password"
        label="Mot de passe"
        autoComplete="new-password"
        hint="10 caractères minimum."
        required
        errors={fe.password}
      />
      <SubmitButton className="h-11 w-full text-base" pendingLabel="Création…">
        Créer mon compte
      </SubmitButton>
      <p className="text-muted-foreground text-xs">
        En créant un compte, vous acceptez les{" "}
        <Link href="/cgu" className="underline">
          conditions d&apos;utilisation
        </Link>{" "}
        et la{" "}
        <Link href="/confidentialite" className="underline">
          politique de confidentialité
        </Link>
        .
      </p>
    </form>
  );
}
