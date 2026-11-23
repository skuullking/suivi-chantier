import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { clientSchema, siteInfoSchema, stepSchema } from "@/lib/validation/business";
import type { ServiceContext } from "@/server/auth/context";
import { storage } from "@/server/adapters/storage";
import { db } from "@/server/db";
import { samplePdf } from "@/server/dev/fixtures";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";
import {
  clientHistory,
  createClient,
  listClients,
  listClientTags,
  setClientArchived,
  updateClient,
} from "@/server/services/clients";
import { uploadDocuments } from "@/server/services/documents";
import { anonymizeClient } from "@/server/services/gdpr";
import { processMedia, uploadMediaFromApp } from "@/server/services/media";
import { createSite, deleteSite, setSiteStatus, updateSite } from "@/server/services/sites";
import { addStep, deleteStep, setStepStatus, setStepVisibility, updateStep } from "@/server/services/steps";
import { addMember, createOrganization } from "./helpers";

const client = (raw: Record<string, unknown>) => clientSchema.parse(raw);
const editSite = (ctx: ServiceContext, id: string, raw: Record<string, unknown>) =>
  updateSite(ctx, id, siteInfoSchema.parse(raw));

async function setup() {
  const a = await createOrganization("Charpentes A");
  const b = await createOrganization("Menuiserie B");
  const office = await addMember(a.organization.id, "OFFICE", "Bureau");
  const worker = await addMember(a.organization.id, "WORKER", "Ouvrier");
  const template = await db.stepTemplate.findFirstOrThrow({ where: { organizationId: a.organization.id } });
  const site = await createSite(a.ownerCtx, {
    newClient: { name: "M. Dupont", emails: "dupont@test.fr", tags: "Particulier" },
    info: { title: "Charpente Dupont", address: "8 chemin des Vignes" },
    templateId: template.id,
    memberIds: [worker.user.id],
  });
  return { a, b, office, worker, site };
}

describe("clients : modifier, étiquettes, archiver, historique", () => {
  it("modifie un client et trace les champs changés dans l'historique", async () => {
    const { a, office, site } = await setup();
    await updateClient(
      office.ctx,
      site.clientId,
      client({
        name: "M. Dupont",
        emails: "Nouveau@Test.fr",
        phones: "06 11 22 33 44",
        tags: "Particulier, VIP",
      }),
    );
    const updated = await db.client.findUniqueOrThrow({ where: { id: site.clientId } });
    expect(updated.emails).toEqual(["nouveau@test.fr"]);
    expect(updated.tags).toEqual(["Particulier", "VIP"]);
    const history = await clientHistory(a.ownerCtx, site.clientId);
    const update = history.find((h) => h.action === "client.update");
    expect((update?.after as { fields: string[] }).fields.sort()).toEqual(["emails", "phones", "tags"]);
    expect(await listClientTags(a.ownerCtx)).toEqual(["Particulier", "VIP"]);
  });

  it("archive puis désarchive un client, sans perdre ses chantiers", async () => {
    const { a, site } = await setup();
    await setClientArchived(a.ownerCtx, site.clientId, true);
    expect((await listClients(a.ownerCtx)).map((c) => c.id)).not.toContain(site.clientId);
    expect((await listClients(a.ownerCtx, { archived: true })).map((c) => c.id)).toEqual([site.clientId]);
    expect(await listClientTags(a.ownerCtx)).toEqual([]);
    expect(await db.site.count({ where: { clientId: site.clientId } })).toBe(1);

    await setClientArchived(a.ownerCtx, site.clientId, false);
    expect((await listClients(a.ownerCtx)).map((c) => c.id)).toContain(site.clientId);
    const actions = (await clientHistory(a.ownerCtx, site.clientId)).map((h) => h.action);
    expect(actions).toEqual(expect.arrayContaining(["client.archive", "client.unarchive"]));
  });

  it("refuse les ouvriers, les autres organisations et les clients anonymisés", async () => {
    const { a, b, worker, site } = await setup();
    const input = client({ name: "Pirate" });
    await expect(updateClient(worker.ctx, site.clientId, input)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setClientArchived(worker.ctx, site.clientId, true)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateClient(b.ownerCtx, site.clientId, input)).rejects.toBeInstanceOf(NotFoundError);
    await expect(clientHistory(b.ownerCtx, site.clientId)).rejects.toBeInstanceOf(NotFoundError);

    const other = await createClient(a.ownerCtx, client({ name: "Mme Effacée" }));
    await anonymizeClient(a.ownerCtx, other.id);
    await expect(updateClient(a.ownerCtx, other.id, client({ name: "Retour" }))).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it("les étiquettes ne mélangent jamais deux organisations", async () => {
    const { a, b } = await setup();
    await createClient(b.ownerCtx, client({ name: "Client de B", tags: "Secret B" }));
    expect(await listClientTags(a.ownerCtx)).toEqual(["Particulier"]);
  });
});

describe("chantiers : modifier, changer le statut, supprimer", () => {
  it("modifie les informations et journalise l'événement", async () => {
    const { office, site } = await setup();
    await editSite(office.ctx, site.id, {
      title: "Charpente et couverture Dupont",
      address: "10 chemin des Vignes",
      city: "Castanet",
      plannedStart: "2026-12-01",
      plannedEnd: "2026-12-20",
    });
    const updated = await db.site.findUniqueOrThrow({ where: { id: site.id } });
    expect(updated).toMatchObject({ title: "Charpente et couverture Dupont", city: "Castanet" });
    expect(await db.siteEvent.count({ where: { siteId: site.id, type: "site.updated" } })).toBe(1);
  });

  it("démarrer puis terminer : dates réelles, audit et notification des responsables", async () => {
    const { a, office, site } = await setup();
    const started = await setSiteStatus(office.ctx, site.id, "IN_PROGRESS");
    expect(started.status).toBe("IN_PROGRESS");
    expect(started.actualStart).not.toBeNull();
    const done = await setSiteStatus(office.ctx, site.id, "COMPLETED");
    expect(done.actualEnd).not.toBeNull();
    expect(done.actualStart).toEqual(started.actualStart);

    const audits = await db.auditLog.findMany({ where: { entityId: site.id, action: "site.status" } });
    expect(audits.map((l) => (l.after as { status: string }).status).sort()).toEqual([
      "COMPLETED",
      "IN_PROGRESS",
    ]);
    const notified = await db.notification.findMany({ where: { userId: a.owner.id } });
    expect(notified.map((n) => n.type).sort()).toEqual(["site.completed", "site.started"]);
    // The person who changed the status is not notified.
    expect(await db.notification.count({ where: { userId: office.user.id } })).toBe(0);
  });

  it("remettre le même statut ne fait rien", async () => {
    const { a, site } = await setup();
    await setSiteStatus(a.ownerCtx, site.id, "DRAFT");
    expect(await db.auditLog.count({ where: { entityId: site.id, action: "site.status" } })).toBe(0);
  });

  it("refuse l'ouvrier et une autre organisation", async () => {
    const { b, worker, site } = await setup();
    await expect(setSiteStatus(worker.ctx, site.id, "COMPLETED")).rejects.toThrow();
    await expect(editSite(worker.ctx, site.id, { title: "Pirate", address: "1 rue" })).rejects.toThrow();
    await expect(deleteSite(worker.ctx, site.id)).rejects.toThrow();
    await expect(setSiteStatus(b.ownerCtx, site.id, "COMPLETED")).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteSite(b.ownerCtx, site.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.site.count({ where: { id: site.id } })).toBe(1);
  });

  it("supprime le chantier, ses photos, ses documents et tous leurs fichiers", async () => {
    const { a, worker, site } = await setup();
    const bytes = new Uint8Array(
      await sharp({ create: { width: 320, height: 240, channels: 3, background: "#c98b4a" } })
        .jpeg()
        .toBuffer(),
    );
    const { media } = await uploadMediaFromApp(worker.ctx, {
      siteId: site.id,
      file: { name: "p.jpg", bytes },
    });
    const processed = await processMedia(media.id);
    const { created } = await uploadDocuments(
      a.ownerCtx,
      [{ name: "devis.pdf", bytes: new Uint8Array(await samplePdf("Devis Dupont", ["Charpente"])) }],
      { siteId: site.id },
    );
    const doc = await db.document.findUniqueOrThrow({ where: { id: created[0]!.id } });
    const keys = [processed!.storageKey, processed!.displayKey!, processed!.thumbnailKey!, doc.storageKey];
    for (const key of keys) expect(await storage().exists(key)).toBe(true);

    await deleteSite(a.ownerCtx, site.id);

    expect(await db.site.count({ where: { id: site.id } })).toBe(0);
    expect(await db.media.count({ where: { id: media.id } })).toBe(0);
    expect(await db.document.count({ where: { id: doc.id } })).toBe(0);
    for (const key of keys) expect(await storage().exists(key), key).toBe(false);
    expect(await db.auditLog.count({ where: { entityId: site.id, action: "site.delete" } })).toBe(1);
  });
});

describe("étapes : modifier, supprimer, visibilité client", () => {
  it("modifie une étape et recalcule l'avancement avec le nouveau poids", async () => {
    const { a, site } = await setup();
    const steps = await db.siteStep.findMany({ where: { siteId: site.id }, orderBy: { order: "asc" } });
    const total = steps.length;
    await setStepStatus(a.ownerCtx, steps[0]!.id, "DONE");
    expect((await db.site.findUniqueOrThrow({ where: { id: site.id } })).progress).toBe(
      Math.round(100 / total),
    );
    await updateStep(a.ownerCtx, steps[0]!.id, {
      title: "Prise de côtes détaillée",
      weight: total - 1,
      visibleToClient: true,
      plannedStart: "2026-12-01",
      plannedEnd: "2026-12-02",
    });
    // (total - 1) / ((total - 1) + (total - 1) × 1) = 50 %
    expect((await db.site.findUniqueOrThrow({ where: { id: site.id } })).progress).toBe(50);
    const updated = await db.siteStep.findUniqueOrThrow({ where: { id: steps[0]!.id } });
    expect(updated.title).toBe("Prise de côtes détaillée");
  });

  it("supprime une étape, renumérote les suivantes et recalcule l'avancement", async () => {
    const { a, site } = await setup();
    const steps = await db.siteStep.findMany({ where: { siteId: site.id }, orderBy: { order: "asc" } });
    await setStepStatus(a.ownerCtx, steps[0]!.id, "DONE");
    await deleteStep(a.ownerCtx, steps[1]!.id);
    const rest = await db.siteStep.findMany({ where: { siteId: site.id }, orderBy: { order: "asc" } });
    expect(rest.map((s) => s.order)).toEqual(rest.map((_, i) => i + 1));
    expect(rest.map((s) => s.id)).not.toContain(steps[1]!.id);
    expect((await db.site.findUniqueOrThrow({ where: { id: site.id } })).progress).toBe(
      Math.round(100 / rest.length),
    );
    expect(await db.siteEvent.count({ where: { siteId: site.id, type: "step.removed" } })).toBe(1);
  });

  it("masque et réaffiche une étape pour le client", async () => {
    const { office, site } = await setup();
    const step = await db.siteStep.findFirstOrThrow({ where: { siteId: site.id } });
    expect((await setStepVisibility(office.ctx, step.id, false)).visibleToClient).toBe(false);
    expect((await setStepVisibility(office.ctx, step.id, true)).visibleToClient).toBe(true);
  });

  it("ajoute une étape à la fin", async () => {
    const { a, site } = await setup();
    const before = await db.siteStep.count({ where: { siteId: site.id } });
    const step = await addStep(
      a.ownerCtx,
      site.id,
      stepSchema.parse({ title: "Nettoyage final", visibleToClient: "on" }),
    );
    expect(step.order).toBe(before + 1);
  });

  it("l'ouvrier et une autre organisation ne modifient pas les étapes", async () => {
    const { b, worker, site } = await setup();
    const step = await db.siteStep.findFirstOrThrow({ where: { siteId: site.id } });
    const input = stepSchema.parse({ title: "Pirate", visibleToClient: "on" });
    await expect(updateStep(worker.ctx, step.id, input)).rejects.toThrow();
    await expect(deleteStep(worker.ctx, step.id)).rejects.toThrow();
    await expect(setStepVisibility(worker.ctx, step.id, false)).rejects.toThrow();
    await expect(updateStep(b.ownerCtx, step.id, input)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteStep(b.ownerCtx, step.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setStepVisibility(b.ownerCtx, step.id, false)).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.siteStep.findUniqueOrThrow({ where: { id: step.id } })).toMatchObject({
      title: step.title,
      visibleToClient: step.visibleToClient,
    });
  });
});
