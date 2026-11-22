/**
 * Photos, voice notes and videos sent by the team (app, WhatsApp, e-mail).
 * The original file is immutable. Processing derives a display version (auto-rotated, resized, EXIF/GPS stripped)
 * and a thumbnail; crop / blur edits produce another derived file. Clients only ever get derived files.
 */
import { randomUUID } from "node:crypto";
import exifr from "exifr";
import sharp from "sharp";
import type { Prisma } from "@/generated/prisma/client";
import type { MediaKind, MediaSource, ValidationStatus } from "@/generated/prisma/enums";
import { storage } from "@/server/adapters/storage";
import type { ServiceContext } from "@/server/auth/context";
import { db, type Tx } from "@/server/db";
import { env } from "@/server/env";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { signFileUrl } from "@/server/files";
import { logger } from "@/server/logger";
import { assertCan, can } from "@/server/permissions/can";
import { validateUpload } from "@/server/security/file-validation";
import { assertStepOfSite, loadSiteFor, siteMemberIds } from "./access";
import { audit } from "./audit";
import { recordSiteEvent } from "./events";
import { notifyManagers } from "./notifications";
import { assertStorageLimit } from "./plan-limits";

export type NewMedia = {
  organizationId: string;
  authorId: string | null;
  siteId: string | null;
  stepId?: string | null;
  source: MediaSource;
  file: { name: string; bytes: Uint8Array };
  caption?: string | null;
  capturedAt?: Date | null;
  latitude?: number | null;
  longitude?: number | null;
  clientUploadId?: string | null;
  /** Override the organization setting (e.g. media classified later from the inbox). */
  validationStatus?: ValidationStatus;
  /** Voice recorders may produce video containers (Safari audio/mp4): trust the declared intent. */
  kindHint?: MediaKind;
};

/** Stores an original file and creates the Media row (processing is done afterwards). */
export async function storeMedia(input: NewMedia, tx: Tx = db) {
  if (input.clientUploadId) {
    const existing = await tx.media.findUnique({ where: { clientUploadId: input.clientUploadId } });
    if (existing) {
      if (existing.organizationId !== input.organizationId) throw new ForbiddenError();
      return { media: existing, duplicate: true };
    }
  }
  const validated = await validateUpload(input.file.bytes, input.file.name, {
    allowed: ["image", "audio", "video"],
    maxBytes: env().MAX_UPLOAD_MB * 1024 * 1024,
  });
  await assertStorageLimit(input.organizationId, input.file.bytes.byteLength);
  const kind: MediaKind =
    validated.category === "image"
      ? "PHOTO"
      : validated.category === "audio" || input.kindHint === "VOICE"
        ? "VOICE"
        : "VIDEO";
  const org = await tx.organization.findUniqueOrThrow({
    where: { id: input.organizationId },
    select: { photosAutoApprove: true },
  });
  const base = `org/${input.organizationId}/media/${randomUUID()}`;
  const storageKey = `${base}/original.${validated.ext}`;
  await storage().put(storageKey, Buffer.from(input.file.bytes), validated.mimeType);
  const media = await tx.media.create({
    data: {
      organizationId: input.organizationId,
      siteId: input.siteId,
      stepId: input.stepId ?? null,
      authorId: input.authorId,
      kind,
      source: input.source,
      storageKey,
      mimeType: validated.mimeType,
      sizeBytes: input.file.bytes.byteLength,
      originalName: validated.safeName,
      capturedAt: input.capturedAt ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      caption: input.caption ?? null,
      clientUploadId: input.clientUploadId ?? null,
      validationStatus:
        input.validationStatus ?? (kind === "PHOTO" && org.photosAutoApprove ? "APPROVED" : "PENDING"),
      processingStatus: "PENDING",
      transcriptionStatus: kind === "VOICE" ? "PENDING" : null,
    },
  });
  return { media, duplicate: false };
}

function baseOf(storageKey: string) {
  return storageKey.slice(0, storageKey.lastIndexOf("/"));
}

/**
 * Background processing: EXIF date + GPS, display version and thumbnail for photos.
 * HEIC files cannot be decoded by the bundled libvips: the original is kept and shown as a download.
 */
export async function processMedia(mediaId: string) {
  const media = await db.media.findUnique({ where: { id: mediaId } });
  if (!media || media.processingStatus === "DONE") return media;
  await db.media.update({ where: { id: mediaId }, data: { processingStatus: "PROCESSING" } });
  try {
    if (media.kind !== "PHOTO") {
      await db.media.update({ where: { id: mediaId }, data: { processingStatus: "DONE" } });
      return media;
    }
    const original = await storage().get(media.storageKey);
    const exif = await exifr
      .parse(original, { gps: true, pick: ["DateTimeOriginal", "CreateDate", "latitude", "longitude"] })
      .catch(() => null);
    const base = baseOf(media.storageKey);
    const image = sharp(original, { failOn: "none" }).rotate();
    const meta = await image.metadata();
    const display = await image
      .clone()
      .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    const thumbnail = await sharp(display.data)
      .resize(480, 360, { fit: "cover" })
      .jpeg({ quality: 72 })
      .toBuffer();
    await storage().put(`${base}/display.jpg`, display.data, "image/jpeg");
    await storage().put(`${base}/thumb.jpg`, thumbnail, "image/jpeg");
    const exifDate = (exif?.DateTimeOriginal ?? exif?.CreateDate) as Date | undefined;
    return await db.media.update({
      where: { id: mediaId },
      data: {
        displayKey: `${base}/display.jpg`,
        thumbnailKey: `${base}/thumb.jpg`,
        width: display.info.width ?? meta.width ?? null,
        height: display.info.height ?? meta.height ?? null,
        capturedAt:
          media.capturedAt ??
          (exifDate instanceof Date && !Number.isNaN(exifDate.getTime()) ? exifDate : null),
        latitude: media.latitude ?? (typeof exif?.latitude === "number" ? exif.latitude : null),
        longitude: media.longitude ?? (typeof exif?.longitude === "number" ? exif.longitude : null),
        processingStatus: "DONE",
      },
    });
  } catch (error) {
    logger.warn({ err: error, mediaId }, "Traitement du média impossible");
    return db.media.update({ where: { id: mediaId }, data: { processingStatus: "FAILED" } });
  }
}

/** Upload from the worker app (camera / voice). */
export async function uploadMediaFromApp(
  ctx: ServiceContext,
  input: {
    siteId: string;
    stepId?: string | null;
    file: { name: string; bytes: Uint8Array };
    caption?: string | null;
    capturedAt?: Date | null;
    latitude?: number | null;
    longitude?: number | null;
    clientUploadId?: string | null;
    kindHint?: MediaKind;
  },
) {
  const { site } = await loadSiteFor(ctx, input.siteId, "media.upload");
  if (ctx.actor.role === "WORKER") {
    const members = await siteMemberIds(site.id);
    assertCan(ctx.actor, "media.upload", {
      organizationId: site.organizationId,
      siteId: site.id,
      assignedUserIds: members,
    });
  }
  await assertStepOfSite(site.id, input.stepId);
  // A capture date far in the future is a broken device clock: the server reception time is authoritative.
  const capturedAt =
    input.capturedAt && input.capturedAt.getTime() < Date.now() + 5 * 60_000 ? input.capturedAt : null;
  const { media, duplicate } = await storeMedia({
    organizationId: ctx.organizationId,
    authorId: ctx.userId,
    siteId: site.id,
    stepId: input.stepId,
    source: "APP",
    file: input.file,
    caption: input.caption,
    capturedAt,
    latitude: input.latitude,
    longitude: input.longitude,
    clientUploadId: input.clientUploadId,
    kindHint: input.kindHint,
  });
  if (!duplicate) {
    await recordSiteEvent({
      organizationId: ctx.organizationId,
      siteId: site.id,
      actorId: ctx.userId,
      type: "media.added",
      payload: { kind: media.kind },
    });
    if (media.kind === "PHOTO" && media.validationStatus === "PENDING") {
      await notifyPendingPhotos(ctx.organizationId, site.title, ctx.userId);
    }
  }
  return { media, duplicate };
}

/** One grouped notification per site and hour, not one per photo. */
export async function notifyPendingPhotos(organizationId: string, siteTitle: string, excludeUserId?: string) {
  const recent = await db.notification.findFirst({
    where: {
      organizationId,
      type: "photos.pending",
      body: siteTitle,
      readAt: null,
      createdAt: { gt: new Date(Date.now() - 3600_000) },
    },
  });
  if (recent) return;
  await notifyManagers({
    organizationId,
    type: "photos.pending",
    title: "Nouvelles photos à valider",
    body: siteTitle,
    link: "/app/a-traiter",
    excludeUserId,
  });
}

export type MediaFilters = { status?: ValidationStatus; kind?: MediaKind; stepId?: string };

export async function listSiteMedia(ctx: ServiceContext, siteId: string, filters: MediaFilters = {}) {
  const { assignedUserIds } = await loadSiteFor(ctx, siteId, "site.view");
  assertCan(ctx.actor, "media.view", { organizationId: ctx.organizationId, siteId, assignedUserIds });
  return db.media.findMany({
    where: {
      organizationId: ctx.organizationId,
      siteId,
      ...(filters.status ? { validationStatus: filters.status } : {}),
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.stepId ? { stepId: filters.stepId } : {}),
      // Workers see their own uploads and approved photos of their sites.
      ...(ctx.actor.role === "WORKER"
        ? { OR: [{ authorId: ctx.userId }, { validationStatus: "APPROVED" }] }
        : {}),
    },
    include: mediaInclude,
    orderBy: [{ capturedAt: { sort: "desc", nulls: "last" } }, { receivedAt: "desc" }],
  });
}

export const mediaInclude = {
  author: { select: { id: true, name: true } },
  step: { select: { id: true, title: true } },
  site: { select: { id: true, title: true, code: true } },
} satisfies Prisma.MediaInclude;

/** Validation queue (all sites). */
export async function pendingPhotos(ctx: ServiceContext) {
  assertCan(ctx.actor, "media.validate", { organizationId: ctx.organizationId });
  return db.media.findMany({
    where: {
      organizationId: ctx.organizationId,
      kind: "PHOTO",
      validationStatus: "PENDING",
      siteId: { not: null },
    },
    include: mediaInclude,
    orderBy: { receivedAt: "asc" },
    take: 200,
  });
}

export async function validateMedia(
  ctx: ServiceContext,
  ids: string[],
  status: "APPROVED" | "REJECTED" | "PENDING",
) {
  assertCan(ctx.actor, "media.validate", { organizationId: ctx.organizationId });
  const unique = Array.from(new Set(ids));
  const items = await db.media.findMany({
    where: { id: { in: unique }, organizationId: ctx.organizationId },
    select: { id: true, siteId: true },
  });
  if (items.length !== unique.length) throw new NotFoundError("Photo introuvable.");
  await db.$transaction(async (tx) => {
    await tx.media.updateMany({
      where: { id: { in: unique }, organizationId: ctx.organizationId },
      data: { validationStatus: status, validatedById: ctx.userId, validatedAt: new Date() },
    });
    const bySite = new Map<string, number>();
    for (const m of items) if (m.siteId) bySite.set(m.siteId, (bySite.get(m.siteId) ?? 0) + 1);
    if (status === "APPROVED") {
      for (const [siteId, count] of bySite) {
        await recordSiteEvent(
          {
            organizationId: ctx.organizationId,
            siteId,
            actorId: ctx.userId,
            type: "media.validated",
            payload: { count },
          },
          tx,
        );
      }
    }
    await audit(
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "media.validate",
        entityType: "media",
        after: { status, count: unique.length },
        ip: ctx.ip,
      },
      tx,
    );
    // Photos handled: mark the related notifications as read.
    if (status !== "PENDING") {
      const remaining = await tx.media.count({
        where: { organizationId: ctx.organizationId, kind: "PHOTO", validationStatus: "PENDING" },
      });
      if (remaining === 0) {
        await tx.notification.updateMany({
          where: { organizationId: ctx.organizationId, type: "photos.pending", readAt: null },
          data: { readAt: new Date() },
        });
      }
    }
  });
}

/** Moves a media to another site / step (e.g. misclassified WhatsApp photo). */
export async function reassignMedia(
  ctx: ServiceContext,
  mediaId: string,
  siteId: string,
  stepId?: string | null,
) {
  assertCan(ctx.actor, "media.validate", { organizationId: ctx.organizationId });
  const media = await db.media.findFirst({ where: { id: mediaId, organizationId: ctx.organizationId } });
  if (!media) throw new NotFoundError("Média introuvable.");
  await loadSiteFor(ctx, siteId, "site.view");
  await assertStepOfSite(siteId, stepId);
  return db.media.update({ where: { id: mediaId }, data: { siteId, stepId: stepId ?? null } });
}

export type Rect = { x: number; y: number; w: number; h: number };

const rectOk = (r: Rect) =>
  [r.x, r.y, r.w, r.h].every((v) => Number.isFinite(v) && v >= 0 && v <= 1) &&
  r.w > 0.01 &&
  r.h > 0.01 &&
  r.x + r.w <= 1.001 &&
  r.y + r.h <= 1.001;

/**
 * Crop and / or blur zones (faces, number plates). Coordinates are relative (0-1) to the displayed image.
 * The original stays untouched; a new derived file is written. `reset` removes the edit.
 */
export async function editPhoto(
  ctx: ServiceContext,
  mediaId: string,
  edit: { crop?: Rect | null; blurs?: Rect[]; reset?: boolean },
) {
  assertCan(ctx.actor, "media.validate", { organizationId: ctx.organizationId });
  const media = await db.media.findFirst({ where: { id: mediaId, organizationId: ctx.organizationId } });
  if (!media || media.kind !== "PHOTO") throw new NotFoundError("Photo introuvable.");
  const base = baseOf(media.storageKey);
  if (edit.reset) {
    if (media.editedKey)
      await storage()
        .delete(media.editedKey)
        .catch(() => {});
    const thumbSource = await storage().get(media.displayKey ?? media.storageKey);
    const thumb = await sharp(thumbSource, { failOn: "none" })
      .rotate()
      .resize(480, 360, { fit: "cover" })
      .jpeg({ quality: 72 })
      .toBuffer();
    await storage().put(`${base}/thumb.jpg`, thumb, "image/jpeg");
    return db.media.update({
      where: { id: mediaId },
      data: { editedKey: null, thumbnailKey: `${base}/thumb.jpg` },
    });
  }
  const blurs = edit.blurs ?? [];
  if (edit.crop && !rectOk(edit.crop)) throw new ValidationError("Zone de recadrage invalide.");
  if (blurs.length > 30 || !blurs.every(rectOk)) throw new ValidationError("Zones de floutage invalides.");
  if (!edit.crop && blurs.length === 0) throw new ValidationError("Aucune modification.");

  const source = await storage().get(media.displayKey ?? media.storageKey);
  const rotated = await sharp(source, { failOn: "none" }).rotate().toBuffer({ resolveWithObject: true });
  const W = rotated.info.width;
  const H = rotated.info.height;
  const px = (r: Rect) => {
    const left = Math.max(0, Math.round(r.x * W));
    const top = Math.max(0, Math.round(r.y * H));
    return {
      left,
      top,
      width: Math.max(1, Math.min(W - left, Math.round(r.w * W))),
      height: Math.max(1, Math.min(H - top, Math.round(r.h * H))),
    };
  };
  let buffer = rotated.data;
  if (blurs.length) {
    const overlays = await Promise.all(
      blurs.map(async (r) => {
        const area = px(r);
        const sigma = Math.max(8, Math.round(Math.min(area.width, area.height) / 6));
        const input = await sharp(buffer).extract(area).blur(sigma).toBuffer();
        return { input, left: area.left, top: area.top };
      }),
    );
    buffer = await sharp(buffer).composite(overlays).toBuffer();
  }
  let pipeline = sharp(buffer);
  if (edit.crop) pipeline = pipeline.extract(px(edit.crop));
  const edited = await pipeline.jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true });
  const thumb = await sharp(edited.data).resize(480, 360, { fit: "cover" }).jpeg({ quality: 72 }).toBuffer();
  await storage().put(`${base}/edited.jpg`, edited.data, "image/jpeg");
  await storage().put(`${base}/thumb.jpg`, thumb, "image/jpeg");
  return db.media.update({
    where: { id: mediaId },
    data: { editedKey: `${base}/edited.jpg`, thumbnailKey: `${base}/thumb.jpg` },
  });
}

export async function updateMediaCaption(ctx: ServiceContext, mediaId: string, caption: string | null) {
  const media = await db.media.findFirst({ where: { id: mediaId, organizationId: ctx.organizationId } });
  if (!media) throw new NotFoundError("Média introuvable.");
  if (
    !can(ctx.actor, "media.validate", { organizationId: ctx.organizationId }) &&
    media.authorId !== ctx.userId
  ) {
    throw new ForbiddenError();
  }
  return db.media.update({ where: { id: mediaId }, data: { caption: caption?.slice(0, 500) || null } });
}

export async function deleteMedia(ctx: ServiceContext, mediaId: string) {
  assertCan(ctx.actor, "media.validate", { organizationId: ctx.organizationId });
  const media = await db.media.findFirst({ where: { id: mediaId, organizationId: ctx.organizationId } });
  if (!media) throw new NotFoundError("Média introuvable.");
  await db.media.delete({ where: { id: mediaId } });
  await storage()
    .deletePrefix(`${baseOf(media.storageKey)}/`)
    .catch(() => {});
}

type MediaKeys = {
  id: string;
  kind: MediaKind;
  mimeType: string;
  storageKey: string;
  thumbnailKey: string | null;
  displayKey: string | null;
  editedKey: string | null;
  originalName: string | null;
};

/** Signed URLs. `forClient` never exposes the original (which may contain EXIF / GPS metadata). */
export function mediaUrls(media: MediaKeys, options: { forClient?: boolean; ttlSeconds?: number } = {}) {
  const ttl = options.ttlSeconds ?? 3600;
  const displayKey = media.editedKey ?? media.displayKey;
  if (media.kind !== "PHOTO") {
    const url = signFileUrl(media.storageKey, {
      ttlSeconds: ttl,
      contentType: media.mimeType,
      filename: media.originalName ?? undefined,
    });
    return { thumbnail: null, display: url, original: url };
  }
  if (options.forClient && !displayKey) throw new AppError("Photo pas encore prête.");
  return {
    thumbnail: media.thumbnailKey
      ? signFileUrl(media.thumbnailKey, { ttlSeconds: ttl, contentType: "image/jpeg" })
      : null,
    display: signFileUrl(displayKey ?? media.storageKey, {
      ttlSeconds: ttl,
      contentType: displayKey ? "image/jpeg" : media.mimeType,
    }),
    original: options.forClient
      ? null
      : signFileUrl(media.storageKey, {
          ttlSeconds: ttl,
          disposition: "attachment",
          filename: media.originalName ?? "photo",
          contentType: media.mimeType,
        }),
  };
}
