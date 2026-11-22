"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type FieldProps = Omit<React.ComponentProps<typeof Input>, "name"> & {
  name: string;
  label: string;
  hint?: string;
  errors?: string[];
  multiline?: boolean;
  rows?: number;
};

/** Labelled input with accessible error messages. */
export function Field({ name, label, hint, errors, multiline, rows, className, id, ...props }: FieldProps) {
  const fieldId = id ?? `field-${name}`;
  const describedBy = errors?.length ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={fieldId}>{label}</Label>
      {multiline ? (
        <Textarea
          id={fieldId}
          name={name}
          rows={rows ?? 3}
          aria-invalid={errors?.length ? true : undefined}
          aria-describedby={describedBy}
          defaultValue={props.defaultValue as string | undefined}
          placeholder={props.placeholder}
          required={props.required}
        />
      ) : (
        <Input
          id={fieldId}
          name={name}
          aria-invalid={errors?.length ? true : undefined}
          aria-describedby={describedBy}
          {...props}
        />
      )}
      {hint && !errors?.length ? (
        <p id={`${fieldId}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
      {errors?.length ? (
        <p id={`${fieldId}-error`} className="text-destructive text-sm" role="alert">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({
  children,
  pendingLabel,
  className,
  variant,
  size,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className={className}
      variant={variant}
      size={size}
      aria-busy={pending}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {pending ? (pendingLabel ?? "Envoi…") : children}
    </Button>
  );
}

export function FormAlert({ error, message }: { error?: string; message?: string }) {
  if (!error && !message) return null;
  return (
    <div
      role={error ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg border p-3 text-sm",
        error
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-emerald-600/30 bg-emerald-50 text-emerald-900",
      )}
    >
      {error ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      ) : (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
      )}
      <span>{error ?? message}</span>
    </div>
  );
}
