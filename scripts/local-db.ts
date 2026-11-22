/**
 * Starts a real PostgreSQL server without Docker (binaries shipped through npm by `embedded-postgres`).
 * Data is persisted in `.local/pgdata`. The process stays in the foreground; stop it with Ctrl+C.
 *
 * Usage: pnpm db:local
 */
import { existsSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const port = Number(process.env.LOCAL_PG_PORT ?? 5433);
const user = process.env.LOCAL_PG_USER ?? "chantierlink";
const password = process.env.LOCAL_PG_PASSWORD ?? "chantierlink";
const databases = ["chantierlink", "chantierlink_test", "chantierlink_e2e"];
const databaseDir = path.resolve(process.cwd(), ".local", "pgdata");

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir,
    port,
    user,
    password,
    persistent: true,
    authMethod: "scram-sha-256",
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
    onError: (error) => console.error("[postgres]", error),
  });

  if (!existsSync(path.join(databaseDir, "PG_VERSION"))) {
    console.log(`Initialisation du cluster PostgreSQL dans ${databaseDir}…`);
    await pg.initialise();
  }

  await pg.start();

  const client = pg.getPgClient("postgres", "127.0.0.1");
  await client.connect();
  for (const name of databases) {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (!rowCount) {
      await client.query(`CREATE DATABASE "${name}"`);
      console.log(`Base « ${name} » créée.`);
    }
  }
  await client.end();

  console.log(`PostgreSQL local prêt sur 127.0.0.1:${port} (utilisateur « ${user} »). Ctrl+C pour arrêter.`);

  const shutdown = async () => {
    console.log("\nArrêt de PostgreSQL…");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep the process alive.
  setInterval(() => {}, 1 << 30);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
