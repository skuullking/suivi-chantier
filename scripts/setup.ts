/**
 * One-shot local setup: waits for PostgreSQL, applies migrations and loads the demo data.
 *   pnpm run setup            → migrate + seed (demo organization recreated)
 *   pnpm run setup --no-seed  → migrate only
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import pg from "pg";

const url = process.env.DATABASE_URL ?? "postgresql://chantierlink:chantierlink@localhost:5433/chantierlink";

async function waitForDatabase(timeoutMs = 60_000) {
  const start = Date.now();
  for (;;) {
    const client = new pg.Client({ connectionString: url });
    try {
      await client.connect();
      await client.end();
      return;
    } catch {
      await client.end().catch(() => {});
      if (Date.now() - start > timeoutMs) {
        throw new Error(
          `PostgreSQL injoignable (${new URL(url).host}). Lancez « pnpm db:local » (sans Docker) ou « docker compose -f docker-compose.dev.yml up -d ».`,
        );
      }
      process.stdout.write(".");
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function main() {
  console.log("⏳ Attente de PostgreSQL…");
  await waitForDatabase();
  console.log("\n✔ PostgreSQL disponible");
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
  if (!process.argv.includes("--no-seed")) {
    execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
  }
  console.log("\n✔ Prêt. Lancez « pnpm dev » puis ouvrez http://localhost:3000");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
