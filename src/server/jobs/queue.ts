/**
 * Background jobs. Handlers are registered in `handlers.ts`.
 *
 * - `JOBS_MODE=inline` (default in development without worker): the job runs right after the HTTP response
 *   (Next.js `after()`), or immediately outside a request (scripts, tests).
 * - `JOBS_MODE=queue`: the job is stored in PostgreSQL (pg-boss) and executed by the `worker` process.
 */
import { after } from "next/server";
import { env } from "@/server/env";
import { logger } from "@/server/logger";
import { JOB_HANDLERS, type JobName, type JobPayloads } from "./handlers";

export async function runJob<N extends JobName>(name: N, payload: JobPayloads[N]) {
  const handler = JOB_HANDLERS[name] as (p: JobPayloads[N]) => Promise<unknown>;
  try {
    await handler(payload);
  } catch (error) {
    logger.error({ err: error, job: name }, "Échec d'une tâche de fond");
    throw error;
  }
}

export async function enqueue<N extends JobName>(name: N, payload: JobPayloads[N]) {
  if (env().JOBS_MODE === "queue") {
    const { sendToQueue } = await import("./boss");
    await sendToQueue(name, payload);
    return;
  }
  const run = () => runJob(name, payload).catch(() => {});
  try {
    after(run);
  } catch {
    // Outside a request scope (tests, scripts): run now.
    await run();
  }
}
