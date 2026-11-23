import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clientSchema } from "@/lib/validation/business";
import { setStorageProvider, storage } from "@/server/adapters/storage";
import { LocalStorageProvider } from "@/server/adapters/storage/local";
import { db } from "@/server/db";
import { samplePdf } from "@/server/dev/fixtures";
import { AppError, NotFoundError } from "@/server/errors";
import { updateClient } from "@/server/services/clients";
import { uploadDocuments } from "@/server/services/documents";
import { createPortalLink, emailPortalLink, revokePortalLink } from "@/server/services/portal";
import { createSite } from "@/server/services/sites";
import { addMember, createOrganization, lastMailLink } from "./helpers";

const ROOT = path.resolve(__dirname, "../..");
const TSX = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");

let storageDir: string;
let backupDir: string;

beforeAll(async () => {
  // Dedicated storage folder: the backup copies every stored file.
  storageDir = await mkdtemp(path.join(os.tmpdir(), "chantierlink-test-storage-"));
  backupDir = await mkdtemp(path.join(os.tmpdir(), "chantierlink-test-backups-"));
  setStorageProvider(new LocalStorageProvider(storageDir));
});

afterAll(async () => {
  setStorageProvider(undefined);
  await rm(storageDir, { recursive: true, force: true });
  await rm(backupDir, { recursive: true, force: true });
});

function runScript(script: string, args: string[] = []) {
  return execFileSync(process.execPath, [TSX, script, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "pipe",
    env: {
      ...process.env,
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_DIR: storageDir,
      BACKUP_DIR: backupDir,
    },
  });
}

async function setup() {
  const a = await createOrganization("Charpentes A");
  const worker = await addMember(a.organization.id, "WORKER", "Ouvrier");
  const site = await createSite(a.ownerCtx, {
    newClient: { name: "M. Dupont", emails: "dupont@test.fr" },
    info: { title: "Charpente Dupont", address: "8 chemin des Vignes" },
    memberIds: [worker.user.id],
  });
  return { a, worker, site };
}

describe("sauvegarde et restauration", () => {
  it("restaure la base et les fichiers après une perte totale", async () => {
    const { a, site } = await setup();
    const pdf = new Uint8Array(await samplePdf("Facture Dupont", ["Charpente : 12 000 €"]));
    const { created } = await uploadDocuments(a.ownerCtx, [{ name: "facture.pdf", bytes: pdf }], {
      siteId: site.id,
    });
    const doc = await db.document.findUniqueOrThrow({ where: { id: created[0]!.id } });
    const auditRows = await db.auditLog.count();

    const out = runScript("scripts/backup.ts");
    expect(out).toContain("Sauvegarde");
    const archives = (await readdir(backupDir)).filter((f) => f.endsWith(".tar.gz"));
    expect(archives).toHaveLength(1);

    // Disaster: every row and every file is lost.
    await db.$executeRawUnsafe(`TRUNCATE "Organization", "User" RESTART IDENTITY CASCADE`);
    await rm(storageDir, { recursive: true, force: true });
    expect(await db.site.count()).toBe(0);
    expect(await storage().exists(doc.storageKey)).toBe(false);

    runScript("scripts/restore.ts", [path.join(backupDir, archives[0]!), "--yes"]);

    const restoredSite = await db.site.findUniqueOrThrow({
      where: { id: site.id },
      include: { client: true },
    });
    expect(restoredSite.title).toBe("Charpente Dupont");
    expect(restoredSite.client.name).toBe("M. Dupont");
    expect(await db.auditLog.count()).toBe(auditRows);
    const restoredDoc = await db.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(restoredDoc.sha256).toBe(doc.sha256);
    expect(Buffer.from(await storage().get(doc.storageKey)).equals(Buffer.from(pdf))).toBe(true);
    // The owner can still sign in with the same password hash.
    expect(await db.user.count({ where: { id: a.owner.id, passwordHash: a.owner.passwordHash } })).toBe(1);
  }, 180_000);

  it("la restauration exige la confirmation --yes", () => {
    expect(() => runScript("scripts/restore.ts", ["inexistant.tar.gz"])).toThrow();
  });
});

describe("lien client envoyé par e-mail", () => {
  it("envoie le lien de suivi à l'adresse du client, ou à une autre adresse", async () => {
    const { a, site } = await setup();
    const { link, url } = await createPortalLink(a.ownerCtx, site.id);
    await expect(emailPortalLink(a.ownerCtx, link.id)).resolves.toEqual({ to: "dupont@test.fr" });
    expect(await lastMailLink("dupont@test.fr")).toBe(url);
    await emailPortalLink(a.ownerCtx, link.id, "conjoint@test.fr");
    expect(await lastMailLink("conjoint@test.fr")).toBe(url);
  });

  it("refuse un lien révoqué ou un client sans e-mail", async () => {
    const { a, site } = await setup();
    const { link } = await createPortalLink(a.ownerCtx, site.id);
    await updateClient(a.ownerCtx, site.clientId, clientSchema.parse({ name: "M. Dupont" }));
    await expect(emailPortalLink(a.ownerCtx, link.id)).rejects.toThrow("pas d'adresse e-mail");
    await revokePortalLink(a.ownerCtx, link.id);
    await expect(emailPortalLink(a.ownerCtx, link.id, "dupont@test.fr")).rejects.toBeInstanceOf(AppError);
    expect(await db.messageLog.count({ where: { channel: "EMAIL", toAddress: "dupont@test.fr" } })).toBe(0);
  });

  it("un ouvrier ou une autre organisation n'envoie pas le lien", async () => {
    const { a, worker, site } = await setup();
    const b = await createOrganization("Menuiserie B");
    const { link } = await createPortalLink(a.ownerCtx, site.id);
    await expect(emailPortalLink(worker.ctx, link.id)).rejects.toThrow();
    await expect(emailPortalLink(b.ownerCtx, link.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.messageLog.count({ where: { channel: "EMAIL", toAddress: "dupont@test.fr" } })).toBe(0);
  });
});
