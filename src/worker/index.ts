/**
 * Background worker: consumes the job queues (JOBS_MODE=queue) and runs the scheduled tasks
 * (daily summaries, day-before reminders, maintenance) in every mode.
 *   pnpm worker
 */
import "dotenv/config";
import { boss, setBossRole, startWorkers, stopBoss } from "@/server/jobs/boss";
import { env } from "@/server/env";
import { logger } from "@/server/logger";

const SCHEDULES: { name: string; cron: string }[] = [
  { name: "summaries.tick", cron: "*/15 * * * *" },
  { name: "reminders.tick", cron: "*/15 * * * *" },
  { name: "notifications.deliver", cron: "* * * * *" },
  { name: "maintenance.daily", cron: "30 3 * * *" },
  { name: "retention.purge", cron: "0 4 * * *" },
];

async function main() {
  setBossRole("worker");
  const b = await boss();
  await startWorkers(env().WORKER_POLL_INTERVAL_SECONDS);
  for (const s of SCHEDULES) {
    await b.schedule(s.name, s.cron, {}, { tz: "UTC" });
  }
  logger.info(
    { mode: env().JOBS_MODE, schedules: SCHEDULES.map((s) => s.name) },
    "Worker ChantierLink démarré",
  );
}

async function shutdown(signal: string) {
  logger.info({ signal }, "Arrêt du worker…");
  await stopBoss().catch(() => {});
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main().catch((error) => {
  logger.error({ err: error }, "Le worker n'a pas pu démarrer");
  process.exit(1);
});
