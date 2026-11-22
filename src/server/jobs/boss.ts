/** pg-boss integration (JOBS_MODE=queue): jobs stored in PostgreSQL, executed by the worker process. */
import { PgBoss } from "pg-boss";
import { env } from "@/server/env";
import { logger } from "@/server/logger";
import { JOB_HANDLERS, type JobName, type JobPayloads } from "./handlers";

let instance: Promise<PgBoss> | null = null;
let role: "producer" | "worker" = "producer";

/** The worker process supervises queues and runs schedules; the web app only sends jobs. */
export function setBossRole(r: "producer" | "worker") {
  role = r;
}

export function boss(): Promise<PgBoss> {
  instance ??= (async () => {
    const worker = role === "worker";
    const b = new PgBoss({
      connectionString: env().DATABASE_URL,
      schema: "pgboss",
      supervise: worker,
      schedule: worker,
    });
    b.on("error", (error) => logger.error({ err: error }, "pg-boss"));
    await b.start();
    for (const name of Object.keys(JOB_HANDLERS)) await b.createQueue(name).catch(() => {});
    return b;
  })();
  return instance;
}

export async function sendToQueue<N extends JobName>(name: N, payload: JobPayloads[N]) {
  const b = await boss();
  await b.send(name, payload as object, { retryLimit: 3, retryDelay: 30, retryBackoff: true });
}

/** Starts consuming every registered queue (worker process). */
export async function startWorkers(pollingIntervalSeconds = 2) {
  const b = await boss();
  for (const name of Object.keys(JOB_HANDLERS) as JobName[]) {
    await b.work<JobPayloads[typeof name]>(name, { pollingIntervalSeconds, batchSize: 1 }, async (jobs) => {
      for (const job of jobs) {
        logger.debug({ job: name, id: job.id }, "Tâche de fond");
        await (JOB_HANDLERS[name] as (p: unknown) => Promise<unknown>)(job.data);
      }
    });
  }
  return b;
}

export async function stopBoss() {
  if (!instance) return;
  const b = await instance;
  instance = null;
  await b.stop({ graceful: true, timeout: 10_000 });
}
