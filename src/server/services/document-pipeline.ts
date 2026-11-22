/**
 * Common pipeline for uploaded / e-mailed / WhatsApp documents:
 * immutable original → text (PDF text layer or OCR) → classification (type, supplier, date, amount, site, client
 * + confidence) → filed automatically, or proposed in "À traiter".
 */
import { parseDateOnlyOrNull } from "@/lib/dates";
import { llm } from "@/server/adapters/llm";
import { documentText } from "@/server/adapters/ocr";
import { storage } from "@/server/adapters/storage";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { logger } from "@/server/logger";
import { recordSiteEvent } from "./events";
import { notifyManagers } from "./notifications";

export async function processDocument(
  documentId: string,
  context: { emailSubject?: string | null; fromName?: string | null } = {},
) {
  const doc = await db.document.findUnique({ where: { id: documentId } });
  if (!doc || doc.processingStatus === "DONE") return doc;
  await db.document.update({ where: { id: documentId }, data: { processingStatus: "PROCESSING" } });
  try {
    const bytes = new Uint8Array(await storage().get(doc.storageKey));
    const text = (await documentText({ bytes, mimeType: doc.mimeType }))
      .replace(/\u0000/g, "")
      .slice(0, 200_000);
    const [sites, clients] = await Promise.all([
      db.site.findMany({
        where: { organizationId: doc.organizationId, status: { notIn: ["ARCHIVED"] } },
        select: {
          id: true,
          title: true,
          code: true,
          clientId: true,
          city: true,
          client: { select: { name: true } },
        },
      }),
      db.client.findMany({
        where: { organizationId: doc.organizationId, archivedAt: null, anonymizedAt: null },
        select: { id: true, name: true, companyName: true },
      }),
    ]);
    const result = await llm().classifyDocument({
      fileName: doc.originalName,
      text,
      emailSubject: context.emailSubject ?? null,
      sites: sites.map((s) => ({
        id: s.id,
        label: `${s.title} ${s.code} ${s.client.name} ${s.city ?? ""}`,
        clientId: s.clientId,
      })),
      clients: clients.map((c) => ({ id: c.id, label: [c.name, c.companyName].filter(Boolean).join(" ") })),
    });
    const auto = result.confidence >= env().AUTO_CLASSIFY_THRESHOLD;
    // A type chosen by hand at upload time is kept.
    const manualType = doc.type !== "OTHER";
    // A site chosen at upload time always wins over the proposal.
    const siteId = doc.siteId ?? (auto ? result.siteId : null);
    const clientId =
      doc.clientId ??
      (siteId ? sites.find((s) => s.id === siteId)?.clientId : null) ??
      (auto ? result.clientId : null);
    const updated = await db.document.update({
      where: { id: documentId },
      data: {
        ocrText: text || null,
        type: manualType ? doc.type : auto ? result.type : "OTHER",
        supplier: result.supplier,
        documentDate: parseDateOnlyOrNull(result.documentDate),
        amountCents: result.amountCents,
        siteId,
        clientId,
        classificationConfidence: result.confidence,
        processingStatus: "DONE",
      },
    });
    if (siteId && !doc.siteId) {
      await recordSiteEvent({
        organizationId: doc.organizationId,
        siteId,
        actorId: doc.uploadedById,
        type: "document.added",
        payload: { name: doc.name },
      });
    }
    if (!auto && !doc.siteId && !(doc.source === "UPLOAD" && manualType)) {
      await db.inboxItem.create({
        data: {
          organizationId: doc.organizationId,
          kind: "DOCUMENT",
          documentId,
          authorId: doc.uploadedById,
          proposedSiteId: result.siteId,
          proposedClientId: result.clientId,
          proposedDocumentType: result.type,
          confidence: result.confidence,
          reason: result.reason,
        },
      });
      await notifyManagers({
        organizationId: doc.organizationId,
        type: "inbox.item",
        title: `Document à classer : ${doc.name}`,
        link: "/app/a-traiter",
      });
    }
    return updated;
  } catch (error) {
    logger.error({ err: error, documentId }, "Traitement du document impossible");
    return db.document.update({ where: { id: documentId }, data: { processingStatus: "FAILED" } });
  }
}
