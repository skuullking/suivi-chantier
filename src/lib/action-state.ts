import type { z } from "zod";

/** Standard result of a form server action (consumed with `useActionState`). */
export type ActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Echo of submitted values, to refill the form after an error. */
  values?: Record<string, string>;
  data?: Record<string, unknown>;
};

export const initialActionState: ActionState = {};

export function formValues(
  formData: FormData,
  exclude: string[] = ["password", "confirm"],
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !exclude.includes(key) && !key.startsWith("$ACTION"))
      values[key] = value;
  }
  return values;
}

export function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
