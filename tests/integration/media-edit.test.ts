import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { storage } from "@/server/adapters/storage";
import { db } from "@/server/db";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import {
  deleteMedia,
  editPhoto,
  processMedia,
  reassignMedia,
  updateMediaCaption,
  uploadMediaFromApp,
} from "@/server/services/media";
import { createSite } from "@/server/services/sites";
import { addMember, contextFor, createOrganization } from "./helpers";

async function jpeg() {
  return new Uint8Array(
    await sharp({ create: { width: 400, height: 300, channels: 3, background: "#6b8e23" } })
      .jpeg()
      .toBuffer(),
  );
}

async function setup() {
  const a = await createOrganization("Charpentes A");
  const b = await createOrganization("Menuiserie B");
  const worker = await addMember(a.organization.id, "WORKER", "Ouvrier");
  const otherWorker = await addMember(a.organization.id, "WORKER", "Collègue");
  const office = await addMember(a.organization.id, "OFFICE", "Bureau");
  const template = await db.stepTemplate.findFirstOrThrow({ where: { organizationId: a.organization.id } });
  const dupont = await createSite(a.ownerCtx, {
    newClient: { name: "M. Dupont" },
    info: { title: "Charpente Dupont", address: "8 chemin des Vignes" },
    templateId: template.id,
    memberIds: [worker.user.id, otherWorker.user.id],
  });
  const martin = await createSite(a.ownerCtx, {
    newClient: { name: "Mme Martin" },
    info: { title: "Pergola Martin", address: "2 rue des Lilas" },
    templateId: template.id,
  });
  const foreignSite = await createSite(b.ownerCtx, {
    newClient: { name: "Client de B" },
    info: { title: "Chantier de B", address: "1 rue de B" },
  });
  const { media } = await uploadMediaFromApp(worker.ctx, {
    siteId: dupont.id,
    file: { name: "photo.jpg", bytes: await jpeg() },
    caption: "Fermes posées",
  });
  return { a, b, worker, otherWorker, office, dupont, martin, foreignSite, media };
}

describe("photos : rattacher à un autre chantier", () => {
  it("le bureau déplace la photo vers un autre chantier et une de ses étapes", async () => {
    const { office, martin, media } = await setup();
    const step = await db.siteStep.findFirstOrThrow({
      where: { siteId: martin.id },
      orderBy: { order: "desc" },
    });
    const moved = await reassignMedia(office.ctx, media.id, martin.id, step.id);
    expect(moved).toMatchObject({ siteId: martin.id, stepId: step.id });
  });

  it("sans étape, l'ancienne étape est retirée", async () => {
    const { a, dupont, martin, media } = await setup();
    const step = await db.siteStep.findFirstOrThrow({ where: { siteId: dupont.id } });
    await db.media.update({ where: { id: media.id }, data: { stepId: step.id } });
    const moved = await reassignMedia(a.ownerCtx, media.id, martin.id);
    expect(moved).toMatchObject({ siteId: martin.id, stepId: null });
  });

  it("refuse une étape d'un autre chantier, un chantier ou une photo d'une autre organisation", async () => {
    const { a, b, dupont, martin, foreignSite, media } = await setup();
    const dupontStep = await db.siteStep.findFirstOrThrow({ where: { siteId: dupont.id } });
    await expect(reassignMedia(a.ownerCtx, media.id, martin.id, dupontStep.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(reassignMedia(a.ownerCtx, media.id, foreignSite.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(reassignMedia(b.ownerCtx, media.id, foreignSite.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await db.media.findUniqueOrThrow({ where: { id: media.id } })).siteId).toBe(dupont.id);
  });

  it("un ouvrier ne déplace pas de photo, ni le bureau quand la validation lui est retirée", async () => {
    const { a, worker, office, martin, media } = await setup();
    await expect(reassignMedia(worker.ctx, media.id, martin.id)).rejects.toBeInstanceOf(ForbiddenError);
    const officeWithoutValidation = contextFor(office.user.id, a.organization.id, "OFFICE", false);
    await expect(reassignMedia(officeWithoutValidation, media.id, martin.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("photos : légende", () => {
  it("l'auteur et le bureau modifient la légende, un collègue non", async () => {
    const { worker, otherWorker, office, media } = await setup();
    expect((await updateMediaCaption(worker.ctx, media.id, "Fermes posées côté sud")).caption).toBe(
      "Fermes posées côté sud",
    );
    expect((await updateMediaCaption(office.ctx, media.id, "Vue d'ensemble")).caption).toBe("Vue d'ensemble");
    await expect(updateMediaCaption(otherWorker.ctx, media.id, "Pirate")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("une légende vide est effacée et une légende trop longue est coupée à 500 caractères", async () => {
    const { worker, media } = await setup();
    expect((await updateMediaCaption(worker.ctx, media.id, "")).caption).toBeNull();
    expect((await updateMediaCaption(worker.ctx, media.id, null)).caption).toBeNull();
    expect((await updateMediaCaption(worker.ctx, media.id, "x".repeat(800))).caption).toHaveLength(500);
  });

  it("une autre organisation ne voit pas la photo", async () => {
    const { b, media } = await setup();
    await expect(updateMediaCaption(b.ownerCtx, media.id, "Pirate")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("photos : supprimer", () => {
  it("supprime la photo et tous ses fichiers (original, affichage, miniature, retouche)", async () => {
    const { office, media } = await setup();
    await processMedia(media.id);
    await editPhoto(office.ctx, media.id, { blurs: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }] });
    const full = await db.media.findUniqueOrThrow({ where: { id: media.id } });
    const keys = [full.storageKey, full.displayKey, full.thumbnailKey, full.editedKey].filter(
      (k): k is string => Boolean(k),
    );
    expect(keys).toHaveLength(4);
    for (const key of keys) expect(await storage().exists(key)).toBe(true);

    await deleteMedia(office.ctx, media.id);

    expect(await db.media.count({ where: { id: media.id } })).toBe(0);
    for (const key of keys) expect(await storage().exists(key), key).toBe(false);
  });

  it("un ouvrier, même auteur, et une autre organisation ne suppriment pas", async () => {
    const { b, worker, media } = await setup();
    await expect(deleteMedia(worker.ctx, media.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteMedia(b.ownerCtx, media.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.media.count({ where: { id: media.id } })).toBe(1);
    expect(await storage().exists(media.storageKey)).toBe(true);
  });
});
