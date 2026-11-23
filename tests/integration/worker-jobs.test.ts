import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetEnvCache } from "@/server/env";
import { setBossRole, startWorkers, stopBoss } from "@/server/jobs/boss";
import { JOB_HANDLERS } from "@/server/jobs/handlers";
import { enqueue, runJob } from "@/server/jobs/queue";
import { createOrganization } from "./helpers";

async function waitFor(check: () => Promise<boolean>, timeoutMs = 20_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

async function pendingNotification() {
  const { organization, owner } = await createOrganization();
  return db.notification.create({
    data: {
      organizationId: organization.id,
      userId: owner.id,
      type: "photos.pending",
      title: "Photos à valider",
    },
  });
}

const delivered = (id: string) => async () =>
  (await db.notification.findUniqueOrThrow({ where: { id } })).deliveredAt !== null;

afterEach(async () => {
  await stopBoss();
  delete process.env.JOBS_MODE;
  resetEnvCache();
});

describe("tâches de fond", () => {
  it("mode direct : la tâche s'exécute tout de suite hors requête HTTP", async () => {
    const n = await pendingNotification();
    await enqueue("notifications.deliver", {});
    expect(await delivered(n.id)()).toBe(true);
  });

  it("une tâche en échec remonte l'erreur (pour que la file la relance)", async () => {
    const original = JOB_HANDLERS["notifications.deliver"];
    JOB_HANDLERS["notifications.deliver"] = async () => {
      throw new Error("Serveur e-mail injoignable");
    };
    try {
      await expect(runJob("notifications.deliver", {})).rejects.toThrow("Serveur e-mail injoignable");
      // In direct mode the error is logged but never breaks the request that triggered the job.
      await expect(enqueue("notifications.deliver", {})).resolves.toBeUndefined();
    } finally {
      JOB_HANDLERS["notifications.deliver"] = original;
    }
  });

  it("mode file (pg-boss) : la tâche est stockée en base puis exécutée par le worker", async () => {
    process.env.JOBS_MODE = "queue";
    resetEnvCache();
    const n = await pendingNotification();

    await enqueue("notifications.deliver", {});
    // Nothing runs before a worker picks the job up.
    expect(await delivered(n.id)()).toBe(false);
    const waiting = await db.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) AS count FROM pgboss.job WHERE name = 'notifications.deliver' AND state = 'created'`;
    expect(Number(waiting[0]?.count ?? 0)).toBeGreaterThan(0);

    setBossRole("worker");
    await startWorkers(0.5);
    expect(await waitFor(delivered(n.id))).toBe(true);
  }, 60_000);
});
