/**
 * Restores an archive made by `pnpm backup`: the database content is replaced (same schema: run the migrations
 * first) and the files are written back to the storage (local disk or S3 / MinIO).
 *
 *   pnpm restore backups/chantierlink-20261122-031500.tar.gz --yes
 *
 * Stop the application and the worker during the restore.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import pg from "pg";
import { storage } from "@/server/adapters/storage";

const BATCH = 500;

async function* walk(dir: string, base = ""): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) yield* walk(path.join(dir, entry.name), rel);
    else yield rel;
  }
}

async function main() {
  const archive = process.argv[2];
  if (!archive || !process.argv.includes("--yes")) {
    console.error("Usage : pnpm restore <archive.tar.gz> --yes   (remplace TOUTES les données actuelles)");
    process.exit(1);
  }
  await stat(archive);
  const url =
    process.env.DATABASE_URL ?? "postgresql://chantierlink:chantierlink@localhost:5433/chantierlink";
  const work = await mkdtemp(path.join(os.tmpdir(), "chantierlink-restore-"));
  execFileSync("tar", ["-xzf", path.relative(work, path.resolve(archive)).split(path.sep).join("/")], {
    cwd: work,
    stdio: "inherit",
  });
  const meta = JSON.parse(await readFile(path.join(work, "backup.json"), "utf8")) as {
    format: number;
    createdAt: string;
  };
  if (meta.format !== 1) throw new Error("Format de sauvegarde inconnu.");
  console.log(`Sauvegarde du ${meta.createdAt}`);

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const current = new Set(
      (
        await client.query<{ tablename: string }>(
          "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
        )
      ).rows.map((r) => r.tablename),
    );
    const files = (await readdir(path.join(work, "db"))).filter((f) => f.endsWith(".ndjson"));
    const tables = files
      .map((f) => f.replace(/\.ndjson$/, ""))
      .filter((t) => current.has(t) && t !== "_prisma_migrations");
    console.log("⏳ Base de données…");
    await client.query("BEGIN");
    // Foreign keys and triggers are disabled during the load (rows are restored exactly as saved).
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} CASCADE`);
    for (const table of tables) {
      const lines = createInterface({
        input: createReadStream(path.join(work, "db", `${table}.ndjson`), "utf8"),
        crlfDelay: Infinity,
      });
      let batch: string[] = [];
      const flush = async () => {
        if (!batch.length) return;
        await client.query(
          `INSERT INTO "${table}" SELECT * FROM json_populate_recordset(NULL::"${table}", $1::json)`,
          [`[${batch.join(",")}]`],
        );
        batch = [];
      };
      for await (const line of lines) {
        if (!line.trim()) continue;
        batch.push(line);
        if (batch.length >= BATCH) await flush();
      }
      await flush();
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }

  console.log("⏳ Fichiers…");
  let count = 0;
  const filesDir = path.join(work, "files");
  const hasFiles = await stat(filesDir)
    .then(() => true)
    .catch(() => false);
  if (hasFiles) {
    for await (const key of walk(filesDir)) {
      await storage().put(
        key,
        await readFile(path.join(filesDir, ...key.split("/"))),
        "application/octet-stream",
      );
      count++;
    }
  }
  await rm(work, { recursive: true, force: true });
  console.log(`✔ Restauration terminée (${count} fichiers).`);
}

main().catch((error) => {
  console.error("✘ Restauration impossible :", error instanceof Error ? error.message : error);
  process.exit(1);
});
