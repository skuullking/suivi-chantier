import { unstable_rethrow } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { AppError } from "@/server/errors";
import { logger } from "@/server/logger";

/** Converts thrown errors into a user-facing ActionState (Next.js redirects / notFound are re-thrown). */
export function toActionError(error: unknown, values?: Record<string, string>): ActionState {
  unstable_rethrow(error);
  if (error instanceof AppError) return { ok: false, error: error.message, values };
  logger.error({ err: error }, "Erreur inattendue dans une action serveur");
  return { ok: false, error: "Une erreur inattendue est survenue. Réessayez.", values };
}
