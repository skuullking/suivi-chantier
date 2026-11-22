"use client";

import { toast } from "sonner";
import type { ActionState } from "@/lib/action-state";

/** Shows the result of a server action as a toast. */
export function notify(result: ActionState | undefined) {
  if (!result) return;
  if (result.error) toast.error(result.error);
  if (result.message) toast.success(result.message);
}
