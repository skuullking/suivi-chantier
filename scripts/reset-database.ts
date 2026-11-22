/**
 * Empties every application table of the database pointed by DATABASE_URL (schema kept).
 * Refuses to run against a database whose name does not end with `_test` or `_e2e`, unless --force.
 */
import "dotenv/config";
import { rm } from "node:fs/promises";
import pg from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant");
  const dbName = new URL(url).pathname.slice(1);
  if (!/_(test|e2e)$/.test(dbName) && !process.argv.includes("--force")) {
    throw new Error(`Refus de vider la base « ${dbName} » (utilisez --force).`);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const { rows } = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
  );
  if (rows.length) {
    await client.query(
      `TRUNCATE TABLE ${rows.map((r) => `"public"."${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
    );
  }
  // pg-boss schema (jobs) if present.
  await client.query("DROP SCHEMA IF EXISTS pgboss CASCADE");
  await client.end();
  if (process.env.STORAGE_DRIVER !== "s3" && process.env.STORAGE_LOCAL_DIR) {
    await rm(process.env.STORAGE_LOCAL_DIR, { recursive: true, force: true });
  }
  console.log(`Base « ${dbName} » vidée.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
