import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { DocumentSource, DocumentType } from "@/generated/prisma/enums";
import { parseDateOnlyOrNull } from "@/lib/dates";
import type { DocumentUpdateInput } from "@/lib/validation/business";
import { storage } from "@/server/adapters/storage";
import { sha256Hex } from "@/server/auth/tokens";
import type { ServiceContext } from "@/server/auth/context";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { signFileUrl } from "@/server/files";
import { assertCan, can } from "@/server/permissions/can";
import { validateUpload } from "@/server/security/file-validation";
import { loadClientFor, loadSiteFor, siteMemberIds } from "./access";
import { audit } from "./audit";
import { recordSiteEvent } from "./events";
import { ftsIds, sortByIds } from "./fts";
import { enqueue } from "@/server/jobs/queue";
import { assertStorageLimit } from "./plan-limits";

export type UploadedFile = { name: string; type?: string; bytes: Uint8Array };

export type StoreDocumentInput = {
  organizationId: string;
  file: UploadedFile;
  source: DocumentSource;
  uploadedById?: string | null;
  siteId?: string | null;
  clientId?: string | null;
  type?: DocumentType;
  visibleToClient?: boolean;
  /** Already classified (generated PDFs, manual type choice): skip the classification pipeline. */
  processed?: boolean;
};

/** Validates and stores an original file (immutable) and creates the Document row. */
export async function storeDocument(input: StoreDocumentInput) {
  const maxBytes = env().MAX_UPLOAD_MB * 1024 * 1024;
  const validated = await validateUpload(input.file.bytes, input.file.name, {
    allowed: ["document", "image"],
    maxBytes,
  });
  await assertStorageLimit(input.organizationId, input.file.bytes.byteLength);
  const storageKey = `org/${input.organizationId}/documents/${randomUUID()}.${validated.ext}`;
  const buffer = Buffer.from(input.file.bytes);
  await storage().put(storageKey, buffer, validated.mimeType);
  const name = validated.safeName.replace(/\.[a-z0-9]+$/i, "");
  return db.document.create({
    data: {
      organizationId: input.organizationId,
      siteId: input.siteId ?? null,
      clientId: input.clientId ?? null,
      type: input.type ?? "OTHER",
      name,
      storageKey,
      mimeType: validated.mimeType,
      sizeBytes: buffer.byteLength,
      originalName: validated.safeName,
      sha256: sha256Hex(buffer),
      visibleToClient: input.visibleToClient ?? false,
      source: input.source,
      processingStatus: input.processed ? "DONE" : "PENDING",
      uploadedById: input.uploadedById ?? null,
    },
  });
}

export type UploadOptions = {
  siteId?: string;
  clientId?: string;
  type?: DocumentType;
  visibleToClient?: boolean;
};

/** Manual upload (drag & drop, several files). Returns created documents and per-file errors. */
export async function uploadDocuments(ctx: ServiceContext, files: UploadedFile[], options: UploadOptions) {
  let clientId = options.clientId;
  if (options.siteId) {
    const { site, assignedUserIds } = await loadSiteFor(ctx, options.siteId, "site.view");
    assertCan(ctx.actor, "document.create", {
      organizationId: ctx.organizationId,
      siteId: site.id,
      assignedUserIds,
      documentType: options.type ?? "OTHER",
    });
    clientId ??= site.clientId;
  } else {
    assertCan(ctx.actor, "document.create", {
      organizationId: ctx.organizationId,
      documentType: options.type ?? "OTHER",
    });
  }
  if (clientId) await loadClientFor(ctx, clientId, "client.viewLimited");

  const created: { id: string; name: string }[] = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      const doc = await storeDocument({
        organizationId: ctx.organizationId,
        file,
        source: "UPLOAD",
        uploadedById: ctx.userId,
        siteId: options.siteId,
        clientId,
        type: options.type,
        visibleToClient: options.visibleToClient,
        // Always analysed (text extraction for search); a type chosen by hand is kept.
        processed: false,
      });
      created.push({ id: doc.id, name: doc.name });
      if (doc.processingStatus === "PENDING") await enqueue("document.process", { documentId: doc.id });
      if (options.siteId) {
        await recordSiteEvent({
          organizationId: ctx.organizationId,
          siteId: options.siteId,
          actorId: ctx.userId,
          type: "document.added",
          payload: { name: doc.name },
        });
      }
      await audit({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "document.upload",
        entityType: "document",
        entityId: doc.id,
        after: { name: doc.originalName, size: doc.sizeBytes },
        ip: ctx.ip,
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Échec de l'envoi de « ${file.name} ».`);
    }
  }
  return { created, errors };
}

export type DocumentFilters = {
  q?: string;
  type?: DocumentType;
  clientId?: string;
  siteId?: string;
  from?: string;
  to?: string;
  limit?: number;
};

const documentInclude = {
  site: { select: { id: true, title: true, code: true } },
  client: { select: { id: true, name: true } },
} satisfies Prisma.DocumentInclude;

export async function listDocuments(ctx: ServiceContext, filters: DocumentFilters = {}) {
  assertCan(ctx.actor, "document.update", { organizationId: ctx.organizationId });
  const where: Prisma.DocumentWhereInput = { organizationId: ctx.organizationId };
  if (filters.type) where.type = filters.type;
  if (filters.clientId) where.clientId = filters.clientId;
  if (filters.siteId) where.siteId = filters.siteId;
  const from = parseDateOnlyOrNull(filters.from);
  const to = parseDateOnlyOrNull(filters.to);
  if (from || to) {
    // Document date when known, otherwise upload date.
    const range = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    const createdRange = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lt: new Date(to.getTime() + 86_400_000) } : {}),
    };
    where.OR = [{ documentDate: range }, { documentDate: null, createdAt: createdRange }];
  }
  const take = filters.limit ?? 200;
  if (filters.q?.trim()) {
    const ids = await ftsIds("document", ctx.organizationId, filters.q, take);
    const rows = await db.document.findMany({
      where: { ...where, id: { in: ids } },
      include: documentInclude,
    });
    return sortByIds(rows, ids);
  }
  return db.document.findMany({ where, include: documentInclude, orderBy: { createdAt: "desc" }, take });
}

/** Documents of a site, filtered by what the caller may see (workers: plans only). */
export async function listSiteDocuments(ctx: ServiceContext, siteId: string) {
  const { assignedUserIds } = await loadSiteFor(ctx, siteId, "site.view");
  const docs = await db.document.findMany({
    where: { organizationId: ctx.organizationId, siteId },
    include: documentInclude,
    orderBy: { createdAt: "desc" },
  });
  return docs.filter((d) =>
    can(ctx.actor, "document.view", {
      organizationId: d.organizationId,
      siteId,
      assignedUserIds,
      documentType: d.type,
      documentVisibleToClient: d.visibleToClient,
    }),
  );
}

export async function getDocument(ctx: ServiceContext, documentId: string) {
  const doc = await db.document.findFirst({
    where: { id: documentId, organizationId: ctx.organizationId },
    include: documentInclude,
  });
  if (!doc) throw new NotFoundError("Document introuvable.");
  const assignedUserIds = doc.siteId ? await siteMemberIds(doc.siteId) : [];
  if (
    !can(ctx.actor, "document.view", {
      organizationId: doc.organizationId,
      siteId: doc.siteId ?? undefined,
      assignedUserIds,
      documentType: doc.type,
      documentVisibleToClient: doc.visibleToClient,
    })
  ) {
    throw new NotFoundError("Document introuvable.");
  }
  return doc;
}

export function documentUrls(doc: { storageKey: string; originalName: string; mimeType: string }) {
  return {
    preview: signFileUrl(doc.storageKey, {
      disposition: "inline",
      filename: doc.originalName,
      contentType: doc.mimeType,
    }),
    download: signFileUrl(doc.storageKey, {
      disposition: "attachment",
      filename: doc.originalName,
      contentType: doc.mimeType,
    }),
  };
}

export async function updateDocument(ctx: ServiceContext, documentId: string, input: DocumentUpdateInput) {
  const doc = await db.document.findFirst({ where: { id: documentId, organizationId: ctx.organizationId } });
  if (!doc) throw new NotFoundError("Document introuvable.");
  assertCan(ctx.actor, "document.update", { organizationId: doc.organizationId });
  let clientId = input.clientId ?? null;
  if (input.siteId) {
    const { site } = await loadSiteFor(ctx, input.siteId, "site.view");
    clientId ??= site.clientId;
  }
  if (clientId) await loadClientFor(ctx, clientId, "client.view");
  const updated = await db.document.update({
    where: { id: documentId },
    data: {
      name: input.name,
      type: input.type,
      siteId: input.siteId ?? null,
      clientId,
      documentDate: parseDateOnlyOrNull(input.documentDate),
      amountCents: input.amount ?? null,
      supplier: input.supplier ?? null,
      tags: input.tags,
      visibleToClient: input.visibleToClient,
      processingStatus: "DONE",
    },
  });
  await audit({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    action: "document.update",
    entityType: "document",
    entityId: documentId,
    after: { type: updated.type, visibleToClient: updated.visibleToClient },
    ip: ctx.ip,
  });
  return updated;
}

export async function setDocumentVisibility(ctx: ServiceContext, documentId: string, visible: boolean) {
  const doc = await db.document.findFirst({ where: { id: documentId, organizationId: ctx.organizationId } });
  if (!doc) throw new NotFoundError("Document introuvable.");
  assertCan(ctx.actor, "document.update", { organizationId: doc.organizationId });
  await db.document.update({ where: { id: documentId }, data: { visibleToClient: visible } });
}

export async function deleteDocument(ctx: ServiceContext, documentId: string) {
  const doc = await db.document.findFirst({ where: { id: documentId, organizationId: ctx.organizationId } });
  if (!doc) throw new NotFoundError("Document introuvable.");
  if (!can(ctx.actor, "document.delete", { organizationId: doc.organizationId })) throw new ForbiddenError();
  await db.document.delete({ where: { id: documentId } });
  await storage()
    .delete(doc.storageKey)
    .catch(() => {});
  await audit({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    action: "document.delete",
    entityType: "document",
    entityId: documentId,
    before: { name: doc.originalName, sha256: doc.sha256 },
    ip: ctx.ip,
  });
}
