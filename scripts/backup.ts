/**
 * Backup of the database (every table as JSON lines, PostgreSQL-version independent) and of every stored file
 * (local disk or S3 / MinIO), in one .tar.gz archive. Works with and without Docker.
 *
 *   pnpm backup                 → backups/chantierlink-AAAAMMJJ-HHMMSS.tar.gz
 *   BACKUP_DIR=/srv/backups BACKUP_KEEP=30 pnpm backup
 *
 * Rotation: only the BACKUP_KEEP most recent archives are kept (14 by default).
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import pg from "pg";
import { storage } from "@/server/adapters/storage";

const BATCH = 2000;

async function main() {
  const url =
    process.env.DATABASE_URL ?? "postgresql://chantierlink:chantierlink@localhost:5433/chantierlink";
  const outDir = path.resolve(process.env.BACKUP_DIR ?? "backups");
  const keep = Number(process.env.BACKUP_KEEP ?? 14);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const work = await mkdtemp(path.join(os.tmpdir(), "chantierlink-backup-"));
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    console.log("⏳ Base de données…");
    await mkdir(path.join(work, "db"), { recursive: true });
    const tables = (
      await client.query<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
      )
    ).rows.map((r) => r.tablename);
    const counts: Record<string, number> = {};
    // A single snapshot for every table (consistent backup).
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    for (const table of tables) {
      const file = createWriteStream(path.join(work, "db", `${table}.ndjson`), "utf8");
      let offset = 0;
      counts[table] = 0;
      for (;;) {
        const { rows } = await client.query<{ row: unknown }>(
          `SELECT row_to_json(t) AS row FROM "${table}" t ORDER BY t.ctid LIMIT ${BATCH} OFFSET ${offset}`,
        );
        for (const r of rows) file.write(`${JSON.stringify(r.row)}\n`);
        counts[table] += rows.length;
        if (rows.length < BATCH) break;
        offset += BATCH;
      }
      await new Promise<void>((resolve, reject) =>
        file.end((err?: Error | null) => (err ? reject(err) : resolve())),
      );
    }
    await client.query("COMMIT");

    console.log("⏳ Fichiers…");
    let files = 0;
    for await (const key of storage().listKeys()) {
      if (key.startsWith("dev/")) continue; // simulator data
      const target = path.join(work, "files", ...key.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      const { stream } = await storage().getStream(key);
      await pipeline(stream, createWriteStream(target));
      files++;
    }
    await writeFile(
      path.join(work, "backup.json"),
      JSON.stringify(
        { format: 1, createdAt: new Date().toISOString(), storage: storage().name, tables: counts, files },
        null,
        2,
      ),
    );

    await mkdir(outDir, { recursive: true });
    const archive = path.join(outDir, `chantierlink-${stamp}.tar.gz`);
    // tar is available on Linux, macOS and Windows 10+.
    // Relative paths: GNU tar would read "C:\…" as a remote host.
    execFileSync("tar", ["-czf", path.relative(work, archive).split(path.sep).join("/"), "."], {
      cwd: work,
      stdio: "inherit",
    });
    console.log(
      `✔ Sauvegarde : ${archive} (${Object.values(counts).reduce((a, b) => a + b, 0)} lignes, ${files} fichiers)`,
    );

    const archives = (await readdir(outDir))
      .filter((f) => /^chantierlink-\d{8}-\d{6}\.tar\.gz$/.test(f))
      .sort();
    for (const old of archives.slice(0, Math.max(0, archives.length - keep))) {
      await rm(path.join(outDir, old));
      console.log(`  rotation : ${old} supprimée`);
    }
  } finally {
    await client.end();
    await rm(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("✘ Sauvegarde impossible :", error instanceof Error ? error.message : error);
  process.exit(1);
});
