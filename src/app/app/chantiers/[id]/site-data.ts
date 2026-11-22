import { notFound } from "next/navigation";
import { cache } from "react";
import type { AuthContext } from "@/server/auth/context";
import { NotFoundError } from "@/server/errors";
import { getSite } from "@/server/services/sites";

/** Site of the current request (shared by the layout and every tab), 404 when absent or forbidden. */
export const loadSite = cache(async (ctx: AuthContext, id: string) => {
  try {
    return await getSite(ctx, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
});
