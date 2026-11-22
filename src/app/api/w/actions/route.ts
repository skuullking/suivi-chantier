import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/server/auth/context";
import { AppError } from "@/server/errors";
import { logger } from "@/server/logger";
import { isSameOrigin } from "@/server/security/request";
import { setStepStatus } from "@/server/services/steps";
import { setTaskDone } from "@/server/services/tasks";
import { arriveOnSite } from "@/server/services/worker";

export const dynamic = "force-dynamic";

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("arrive"), siteId: z.string().min(1).max(64) }),
  z.object({ type: z.literal("step_done"), stepId: z.string().min(1).max(64) }),
  z.object({ type: z.literal("task"), taskId: z.string().min(1).max(64), done: z.boolean() }),
]);

/** Field actions replayed by the offline queue (all idempotent). */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Session expirée, reconnectez-vous." }, { status: 401 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Action invalide." }, { status: 400 });
  try {
    const action = parsed.data;
    if (action.type === "arrive") await arriveOnSite(ctx, action.siteId);
    if (action.type === "step_done") await setStepStatus(ctx, action.stepId, "DONE");
    if (action.type === "task") await setTaskDone(ctx, action.taskId, action.done);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AppError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    logger.error({ err: error }, "Action terrain impossible");
    return NextResponse.json({ error: "Erreur inattendue." }, { status: 500 });
  }
}
