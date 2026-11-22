"use client";

import { Copy } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Field, FormAlert, SubmitButton } from "@/components/forms/form-parts";
import { NativeSelect } from "@/components/forms/native-select";
import { Button } from "@/components/ui/button";
import { initialActionState } from "@/lib/action-state";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/labels";
import { inviteMemberAction } from "@/server/actions/team";

const ROLE_OPTIONS = (["WORKER", "OFFICE", "OWNER"] as const).map((r) => ({
  value: r,
  label: `${ROLE_LABELS[r]} — ${ROLE_DESCRIPTIONS[r]}`,
}));

export function InviteForm() {
  const [state, action] = useActionState(inviteMemberAction, initialActionState);
  const formRef = useRef<HTMLFormElement>(null);
  const url = typeof state.data?.url === "string" ? state.data.url : null;

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="grid gap-4" noValidate>
      <FormAlert error={state.error} message={state.message} />
      {url ? (
        <div className="bg-ink-50 grid gap-2 rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">Lien d&apos;invitation (affiché une seule fois) :</p>
          <code className="text-xs break-all" data-testid="invitation-link">
            {url}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(url).then(() => toast.success("Lien copié"));
            }}
          >
            <Copy /> Copier le lien
          </Button>
        </div>
      ) : null}
      <Field
        name="email"
        type="email"
        label="E-mail"
        required
        defaultValue={state.ok ? undefined : state.values?.email}
        errors={state.fieldErrors?.email}
      />
      <Field
        name="name"
        label="Nom (facultatif)"
        defaultValue={state.ok ? undefined : state.values?.name}
        errors={state.fieldErrors?.name}
      />
      <NativeSelect
        name="role"
        label="Rôle"
        options={ROLE_OPTIONS}
        defaultValue={state.values?.role ?? "WORKER"}
        errors={state.fieldErrors?.role}
      />
      <SubmitButton className="w-full">Envoyer l&apos;invitation</SubmitButton>
    </form>
  );
}
