import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { storage } from "@/server/adapters/storage";
import { db } from "@/server/db";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import {
  editPhoto,
  listSiteMedia,
  processMedia,
  uploadMediaFromApp,
  validateMedia,
} from "@/server/services/media";
import { createNote } from "@/server/services/notes";
import {
  createPortalLink,
  listPortalLinks,
  portalData,
  resolvePortalToken,
  revokePortalLink,
} from "@/server/services/portal";
import { createSite } from "@/server/services/sites";
import { uploadDocuments } from "@/server/services/documents";
import { addMember, contextFor, createOrganization } from "./helpers";

async function jpeg(withExif = false) {
  const img = sharp({ create: { width: 640, height: 480, channels: 3, background: "#c98b4a" } });
  return (withExif ? img.withExif({ IFD0: { Copyright: "Secret GPS device", Make: "Phone" } }) : img)
    .jpeg()
    .toBuffer();
}

async function setup() {
  const a = await createOrganization("Charpentes A");
  const b = await createOrganization("Menuiserie B");
  const worker = await addMember(a.organization.id, "WORKER", "Ouvrier");
  const outsider = await addMember(a.organization.id, "WORKER", "Pas affecté");
  const office = await addMember(a.organization.id, "OFFICE", "Bureau");
  const template = await db.stepTemplate.findFirstOrThrow({ where: { organizationId: a.organization.id } });
  const site = await createSite(a.ownerCtx, {
    newClient: { name: "M. Dupont" },
    info: { title: "Charpente Dupont", address: "8 chemin des Vignes" },
    templateId: template.id,
    memberIds: [worker.user.id],
  });
  return { a, b, worker, outsider, office, site };
}

describe("worker uploads", () => {
  it("stores a photo, processes it (display without EXIF + thumbnail) and is idempotent", async () => {
    const { worker, site } = await setup();
    const bytes = new Uint8Array(await jpeg(true));
    const first = await uploadMediaFromApp(worker.ctx, {
      siteId: site.id,
      file: { name: "photo.jpg", bytes },
      clientUploadId: "abcdef123456",
      capturedAt: new Date(Date.now() + 86_400_000), // broken device clock: ignored
    });
    expect(first.duplicate).toBe(false);
    expect(first.media.kind).toBe("PHOTO");
    expect(first.media.validationStatus).toBe("PENDING");
    expect(first.media.capturedAt).toBeNull();
    const again = await uploadMediaFromApp(worker.ctx, {
      siteId: site.id,
      file: { name: "photo.jpg", bytes },
      clientUploadId: "abcdef123456",
    });
    expect(again.duplicate).toBe(true);
    expect(again.media.id).toBe(first.media.id);
    expect(await db.media.count()).toBe(1);

    const processed = await processMedia(first.media.id);
    expect(processed?.processingStatus).toBe("DONE");
    expect(processed?.displayKey).toBeTruthy();
    const display = await storage().get(processed!.displayKey!);
    const meta = await sharp(display).metadata();
    expect(meta.exif).toBeUndefined();
    const original = await sharp(await storage().get(processed!.storageKey)).metadata();
    expect(original.exif).toBeDefined();
    // Managers are notified once
    expect(await db.notification.count({ where: { type: "photos.pending" } })).toBeGreaterThan(0);
  });

  it("refuses uploads on a site the worker is not assigned to, or of another organization", async () => {
    const { b, outsider, site } = await setup();
    const bytes = new Uint8Array(await jpeg());
    await expect(
      uploadMediaFromApp(outsider.ctx, { siteId: site.id, file: { name: "p.jpg", bytes } }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      uploadMediaFromApp(b.ownerCtx, { siteId: site.id, file: { name: "p.jpg", bytes } }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      uploadMediaFromApp(outsider.ctx, {
        siteId: site.id,
        file: { name: "p.html", bytes: new TextEncoder().encode("<html><script>x</script>") },
      }),
    ).rejects.toThrow();
  });

  it("auto-approves photos when the organization setting is on", async () => {
    const { a, worker, site } = await setup();
    await db.organization.update({ where: { id: a.organization.id }, data: { photosAutoApprove: true } });
    const { media } = await uploadMediaFromApp(worker.ctx, {
      siteId: site.id,
      file: { name: "p.jpg", bytes: new Uint8Array(await jpeg()) },
    });
    expect(media.validationStatus).toBe("APPROVED");
  });
});

describe("photo validation", () => {
  it("only authorized members validate, never across organizations", async () => {
    const { a, b, worker, office, site } = await setup();
    const { media } = await uploadMediaFromApp(worker.ctx, {
      siteId: site.id,
      file: { name: "p.jpg", bytes: new Uint8Array(await jpeg()) },
    });
    await expect(validateMedia(worker.ctx, [media.id], "APPROVED")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(validateMedia(b.ownerCtx, [media.id], "APPROVED")).rejects.toBeInstanceOf(NotFoundError);
    const officeNoRight = contextFor(office.user.id, a.organization.id, "OFFICE", false);
    await expect(validateMedia(officeNoRight, [media.id], "APPROVED")).rejects.toBeInstanceOf(ForbiddenError);
    await validateMedia(office.ctx, [media.id], "APPROVED");
    expect((await db.media.findUniqueOrThrow({ where: { id: media.id } })).validationStatus).toBe("APPROVED");
  });

  it("crops and blurs a derived copy, keeping the original", async () => {
    const { a, worker, site } = await setup();
    const { media } = await uploadMediaFromApp(worker.ctx, {
      siteId: site.id,
      file: { name: "p.jpg", bytes: new Uint8Array(await jpeg()) },
    });
    await processMedia(media.id);
    const edited = await editPhoto(a.ownerCtx, media.id, {
      crop: { x: 0, y: 0, w: 0.5, h: 0.5 },
      blurs: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }],
    });
    expect(edited.editedKey).toBeTruthy();
    const meta = await sharp(await storage().get(edited.editedKey!)).metadata();
    expect(meta.width).toBe(320);
    expect(await storage().exists(media.storageKey)).toBe(true);
    await expect(
      editPhoto(a.ownerCtx, media.id, { crop: { x: 0.9, y: 0, w: 0.5, h: 0.5 } }),
    ).rejects.toThrow();
    const reset = await editPhoto(a.ownerCtx, media.id, { reset: true });
    expect(reset.editedKey).toBeNull();
  });

  it("workers only list their own or approved media", async () => {
    const { a, worker, site } = await setup();
    const other = await addMember(a.organization.id, "WORKER", "Collègue");
    await db.siteMember.create({
      data: { organizationId: a.organization.id, siteId: site.id, userId: other.user.id },
    });
    await uploadMediaFromApp(other.ctx, {
      siteId: site.id,
      file: { name: "p.jpg", bytes: new Uint8Array(await jpeg()) },
    });
    expect(await listSiteMedia(worker.ctx, site.id)).toHaveLength(0);
    expect(await listSiteMedia(other.ctx, site.id)).toHaveLength(1);
  });
});

describe("client portal", () => {
  it("shows only what the client may see and stops working once revoked", async () => {
    const { a, b, worker, site } = await setup();
    const bytes = new Uint8Array(await jpeg());
    const approved = await uploadMediaFromApp(worker.ctx, {
      siteId: site.id,
      file: { name: "ok.jpg", bytes },
    });
    const pending = await uploadMediaFromApp(worker.ctx, {
      siteId: site.id,
      file: { name: "wait.jpg", bytes },
    });
    await processMedia(approved.media.id);
    await processMedia(pending.media.id);
    await validateMedia(a.ownerCtx, [approved.media.id], "APPROVED");
    await createNote(worker.ctx, site.id, { text: "Panne fendue", kind: "PROBLEM" });
    const firstStep = await db.siteStep.findFirstOrThrow({
      where: { siteId: site.id },
      orderBy: { order: "asc" },
    });
    await db.siteStep.update({ where: { id: firstStep.id }, data: { visibleToClient: false } });
    const pdf = new TextEncoder().encode("%PDF-1.4\n%%EOF");
    await uploadDocuments(a.ownerCtx, [{ name: "devis.pdf", bytes: pdf }], {
      siteId: site.id,
      type: "QUOTE",
      visibleToClient: true,
    });
    await uploadDocuments(a.ownerCtx, [{ name: "interne.pdf", bytes: pdf }], {
      siteId: site.id,
      type: "INVOICE",
    });

    await expect(createPortalLink(b.ownerCtx, site.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(createPortalLink(worker.ctx, site.id)).rejects.toBeInstanceOf(NotFoundError);
    const { token, link } = await createPortalLink(a.ownerCtx, site.id);
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(link.tokenHash).not.toContain(token);
    expect((await listPortalLinks(a.ownerCtx, site.id))[0]!.url).toContain(`/s/${token}`);

    const resolved = await resolvePortalToken(token);
    expect(resolved.status).toBe("ok");
    if (resolved.status !== "ok") return;
    const data = await portalData({
      kind: "client",
      organizationId: resolved.organizationId,
      siteId: resolved.siteId,
    });
    expect(data.photos.map((p) => p.id)).toEqual([approved.media.id]);
    expect(data.photos[0]!.display).toContain("/api/files/");
    expect(data.steps.some((s) => s.id === firstStep.id)).toBe(false);
    expect(data.documents.map((d) => d.name)).toEqual(["devis"]);
    expect(JSON.stringify(data)).not.toContain("Panne fendue");

    // Another site of the same organization is not reachable with this actor.
    const other = await createSite(a.ownerCtx, {
      newClient: { name: "Autre" },
      info: { title: "Autre", address: "1 rue" },
    });
    await expect(
      portalData({ kind: "client", organizationId: a.organization.id, siteId: other.id }),
    ).resolves.toBeTruthy();
    expect((await resolvePortalToken("x".repeat(43))).status).toBe("expired");

    await revokePortalLink(a.ownerCtx, link.id);
    expect((await resolvePortalToken(token)).status).toBe("expired");
  });

  it("expired links and malformed tokens are rejected", async () => {
    const { a, site } = await setup();
    const { token, link } = await createPortalLink(a.ownerCtx, site.id, { expiresInDays: 1 });
    await db.clientPortalLink.update({
      where: { id: link.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await resolvePortalToken(token)).toEqual({ status: "expired", organizationId: a.organization.id });
    expect((await resolvePortalToken("../../etc/passwd")).status).toBe("expired");
    const regenerated = await createPortalLink(a.ownerCtx, site.id, { replace: true });
    expect((await resolvePortalToken(regenerated.token)).status).toBe("ok");
  });
});
