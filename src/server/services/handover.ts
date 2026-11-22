/**
 * "Dossier de fin de chantier" (PDF): cover page, steps with dates, approved photos with timestamps grouped by step,
 * list of documents, optional signatures. Stored in the site documents. Footer: no legal value claimed.
 */
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { formatAmount, formatDateTime, formatDay } from "@/lib/format";
import { DOCUMENT_TYPE_LABELS, STEP_STATUS_LABELS } from "@/lib/labels";
import { storage } from "@/server/adapters/storage";
import type { ServiceContext } from "@/server/auth/context";
import { db } from "@/server/db";
import { logger } from "@/server/logger";
import { loadSiteFor } from "./access";
import { storeDocument } from "./documents";
import { recordSiteEvent } from "./events";
import { notifyUsers } from "./notifications";

const INK = "#121212";
const SIGNAL = "#ffd400";
const GREY = "#57534e";
/** Narrow / non-breaking spaces (fr-FR number format) and arrows are missing from the WinAnsi PDF fonts. */
const PDF_SPACES = new RegExp(`[${String.fromCharCode(0x202f, 0xa0)}]`, "g");
const PDF_ARROW = new RegExp(String.fromCharCode(0x2192), "g");
export const HANDOVER_FOOTER = "Document récapitulatif généré par ChantierLink";

async function photoBuffer(key: string): Promise<Buffer | null> {
  try {
    const raw = await storage().get(key);
    return await sharp(raw, { failOn: "none" })
      .rotate()
      .resize(900, 675, { fit: "inside" })
      .jpeg({ quality: 75 })
      .toBuffer();
  } catch {
    return null;
  }
}

export async function buildHandoverPdf(siteId: string, options: { signatures: boolean }): Promise<Buffer> {
  const site = await db.site.findUniqueOrThrow({
    where: { id: siteId },
    include: {
      organization: true,
      client: true,
      steps: { orderBy: { order: "asc" } },
      documents: { orderBy: [{ documentDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] },
      media: {
        where: { kind: "PHOTO", validationStatus: "APPROVED" },
        orderBy: [{ capturedAt: { sort: "asc", nulls: "last" } }, { receivedAt: "asc" }],
      },
    },
  });
  const tz = site.organization.timezone;
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 50, bottom: 60, left: 50, right: 50 },
    bufferPages: true,
    info: {
      Title: `Dossier de fin de chantier — ${site.title}`,
      Author: site.organization.name,
      Creator: "ChantierLink",
    },
  });
  // Standard PDF fonts use WinAnsi: replace the characters it lacks (narrow spaces of fr-FR numbers, arrows).
  const originalText = doc.text.bind(doc) as (...args: unknown[]) => PDFKit.PDFDocument;
  (doc as unknown as { text: (...args: unknown[]) => PDFKit.PDFDocument }).text = (
    value: unknown,
    ...rest: unknown[]
  ) =>
    originalText(
      typeof value === "string" ? value.replace(PDF_SPACES, " ").replace(PDF_ARROW, "au") : value,
      ...rest,
    );
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const width = doc.page.width - 100;

  // ── Cover ──
  doc.rect(0, 0, doc.page.width, 12).fill(SIGNAL);
  doc
    .moveDown(4)
    .fillColor(INK)
    .fontSize(14)
    .text(site.organization.name.toUpperCase(), { characterSpacing: 1 });
  doc.moveDown(0.5).fillColor("#111").fontSize(28).text("Dossier de fin de chantier");
  doc.moveDown(0.3).fontSize(18).fillColor(GREY).text(site.title);
  doc.moveDown(2).fontSize(12).fillColor("#111");
  const rows: [string, string][] = [
    ["Client", [site.client.name, site.client.companyName].filter(Boolean).join(" — ")],
    [
      "Adresse du chantier",
      [site.address, [site.postalCode, site.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    ],
    ["Référence", site.code],
    ["Dates prévues", `${formatDay(site.plannedStart)} → ${formatDay(site.plannedEnd)}`],
    ["Dates réelles", `${formatDay(site.actualStart)} → ${formatDay(site.actualEnd)}`],
    ["Avancement", `${site.progress} %`],
  ];
  for (const [label, value] of rows) {
    doc.fillColor(GREY).fontSize(10).text(label);
    doc
      .fillColor("#111")
      .fontSize(12)
      .text(value || "—");
    doc.moveDown(0.6);
  }
  doc
    .moveDown(2)
    .fillColor(GREY)
    .fontSize(10)
    .text(
      [site.organization.name, site.organization.address, site.organization.phone, site.organization.email]
        .filter(Boolean)
        .join(" · "),
    );
  doc.text(`Édité le ${formatDateTime(new Date(), tz)}`);

  // ── Steps ──
  doc.addPage();
  doc.fillColor(INK).fontSize(18).text("Étapes du chantier");
  doc.moveDown(0.8);
  for (const step of site.steps) {
    const y = doc.y;
    doc.fillColor("#111").fontSize(11).text(`${step.order}. ${step.title}`, 50, y, { width: 260 });
    doc.fillColor(GREY).fontSize(10).text(STEP_STATUS_LABELS[step.status], 320, y, { width: 80 });
    doc.text(
      step.completedAt
        ? `Terminée le ${formatDateTime(step.completedAt, tz)}`
        : step.plannedEnd
          ? `Prévue le ${formatDay(step.plannedEnd)}`
          : "",
      400,
      y,
      { width: 145 },
    );
    doc.moveDown(0.8);
    doc.x = 50;
  }

  // ── Photos by step ──
  const photosByStep = new Map<string, typeof site.media>();
  for (const m of site.media) {
    const key = m.stepId ?? "";
    photosByStep.set(key, [...(photosByStep.get(key) ?? []), m]);
  }
  const groups = [
    ...site.steps.map((s) => ({ id: s.id, title: s.title })),
    { id: "", title: "Autres photos" },
  ].filter((g) => photosByStep.get(g.id)?.length);
  if (groups.length) {
    doc.addPage();
    doc.fillColor(INK).fontSize(18).text("Photos");
    const colW = (width - 20) / 2;
    const imgH = colW * 0.72;
    for (const group of groups) {
      if (doc.y + 30 + imgH > doc.page.height - 80) doc.addPage();
      doc.moveDown(0.6).fillColor("#111").fontSize(13).text(group.title, 50);
      doc.moveDown(0.3);
      const photos = photosByStep.get(group.id)!;
      for (let i = 0; i < photos.length; i += 2) {
        if (doc.y + imgH + 40 > doc.page.height - 70) doc.addPage();
        const top = doc.y;
        for (let j = 0; j < 2 && i + j < photos.length; j++) {
          const p = photos[i + j]!;
          const x = 50 + j * (colW + 20);
          const buf = await photoBuffer(p.editedKey ?? p.displayKey ?? p.storageKey);
          if (buf) {
            doc.image(buf, x, top, { fit: [colW, imgH], align: "center", valign: "center" });
          } else {
            doc.rect(x, top, colW, imgH).stroke("#d6d3d1");
          }
          doc
            .fillColor(GREY)
            .fontSize(8.5)
            .text(
              `${p.caption ? `${p.caption} — ` : ""}${formatDateTime(p.capturedAt ?? p.receivedAt, tz)}`,
              x,
              top + imgH + 4,
              {
                width: colW,
              },
            );
        }
        doc.x = 50;
        doc.y = top + imgH + 30;
      }
    }
  }

  // ── Documents ──
  doc.addPage();
  doc.fillColor(INK).fontSize(18).text("Documents du chantier", 50);
  doc.moveDown(0.8);
  if (site.documents.length === 0) doc.fillColor(GREY).fontSize(11).text("Aucun document.");
  for (const d of site.documents) {
    const y = doc.y;
    doc.fillColor("#111").fontSize(10.5).text(d.name, 50, y, { width: 270 });
    doc.fillColor(GREY).fontSize(9.5).text(DOCUMENT_TYPE_LABELS[d.type], 330, y, { width: 90 });
    doc.text(d.documentDate ? formatDay(d.documentDate) : formatDay(d.createdAt), 420, y, { width: 60 });
    doc.text(d.amountCents != null ? formatAmount(d.amountCents) : "", 480, y, { width: 65, align: "right" });
    doc.moveDown(0.6);
    doc.x = 50;
  }

  // ── Signatures ──
  if (options.signatures) {
    if (doc.y > doc.page.height - 260) doc.addPage();
    doc.moveDown(2).fillColor(INK).fontSize(18).text("Réception", 50);
    doc
      .moveDown(0.5)
      .fillColor(GREY)
      .fontSize(10)
      .text("Fait à : ............................................  le : ......../......../............");
    const top = doc.y + 20;
    for (const [i, label] of ["Pour l'entreprise", "Le client"].entries()) {
      const x = 50 + i * (width / 2 + 10);
      doc.rect(x, top, width / 2 - 10, 110).stroke("#a8a29e");
      doc
        .fillColor("#111")
        .fontSize(10)
        .text(label, x + 8, top + 8);
      doc
        .fillColor(GREY)
        .fontSize(8)
        .text("Signature précédée de « lu et approuvé »", x + 8, top + 22);
    }
    doc.y = top + 130;
  }

  // ── Footer on every page ──
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .fillColor("#a8a29e")
      .fontSize(8)
      .text(
        `${HANDOVER_FOOTER} — ${site.organization.name} — page ${i + 1}/${range.count}`,
        50,
        doc.page.height - 35,
        {
          width,
          align: "center",
          lineBreak: false,
        },
      );
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return done;
}

/** Job: builds the PDF and stores it in the site documents, then notifies the requester. */
export async function generateHandover(input: {
  organizationId: string;
  siteId: string;
  userId: string;
  signatures: boolean;
}) {
  const site = await db.site.findFirst({ where: { id: input.siteId, organizationId: input.organizationId } });
  if (!site) return null;
  try {
    const pdf = await buildHandoverPdf(site.id, { signatures: input.signatures });
    const document = await storeDocument({
      organizationId: input.organizationId,
      file: { name: `Dossier de fin de chantier - ${site.title}.pdf`, bytes: new Uint8Array(pdf) },
      source: "GENERATED",
      uploadedById: input.userId,
      siteId: site.id,
      clientId: site.clientId,
      type: "OTHER",
      processed: true,
    });
    await db.document.update({
      where: { id: document.id },
      data: { ocrText: `dossier fin de chantier ${site.title} ${site.code}` },
    });
    await recordSiteEvent({
      organizationId: input.organizationId,
      siteId: site.id,
      actorId: input.userId,
      type: "document.added",
      payload: { name: document.name },
    });
    await notifyUsers([input.userId], {
      organizationId: input.organizationId,
      type: "document.ready",
      title: `Dossier de fin de chantier prêt : ${site.title}`,
      link: `/app/chantiers/${site.id}/documents`,
    });
    return document;
  } catch (error) {
    logger.error({ err: error, siteId: site.id }, "Génération du dossier de fin de chantier impossible");
    throw error;
  }
}

export async function requestHandover(ctx: ServiceContext, siteId: string) {
  await loadSiteFor(ctx, siteId, "document.create");
}
