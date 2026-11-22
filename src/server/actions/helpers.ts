import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { type ActionState, formValues, zodFieldErrors } from "@/lib/action-state";
import { AppError, ValidationError } from "@/server/errors";
import { logger } from "@/server/logger";

/** Converts thrown errors into a user-facing ActionState (Next.js redirects / notFound are re-thrown). */
export function toActionError(error: unknown, values?: Record<string, string>): ActionState {
  unstable_rethrow(error);
  if (error instanceof AppError) return { ok: false, error: error.message, values };
  logger.error({ err: error }, "Erreur inattendue dans une action serveur");
  return { ok: false, error: "Une erreur inattendue est survenue. Réessayez.", values };
}

type ParseResult<T> = { ok: true; data: T } | { ok: false; state: ActionState };

/** Parses a FormData with a Zod schema; returns an ActionState with field errors on failure. */
export function parseForm<S extends z.ZodType>(schema: S, formData: FormData): ParseResult<z.output<S>> {
  const values = formValues(formData);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      state: {
        ok: false,
        error: "Vérifiez les champs signalés.",
        fieldErrors: zodFieldErrors(parsed.error),
        values,
      },
    };
  }
  return { ok: true, data: parsed.data };
}

/** Runs a mutation and converts domain errors to an ActionState. */
export async function attempt(
  fn: () => Promise<ActionState | void>,
  values?: Record<string, string>,
): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { ok: false, error: error.message, fieldErrors: error.fieldErrors, values };
    }
    return toActionError(error, values);
  }
}
