import { type Readable } from "node:stream";
import nodemailer from "nodemailer";
import { extractText } from "unpdf";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { samplePdf } from "@/server/dev/fixtures";
import { importClients } from "@/server/services/client-import";
import { clientsCsv, documentsCsv, siteZip } from "@/server/services/exports";
import { buildHandoverPdf, generateHandover, HANDOVER_FOOTER } from "@/server/services/handover";
import { inboundAddress, receiveInboundMail } from "@/server/services/inbound-mail";
import { listDocuments, uploadDocuments } from "@/server/services/documents";
import { createSite } from "@/server/services/sites";
import { createOrganization } from "./helpers";

async function mime(options: {
  to: string;
  subject: string;
  messageId?: string;
  pdf?: Buffer;
  text?: string;
}) {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  const info = await transport.sendMail({
    from: '"Scierie du Comminges" <factures@scierie.fr>',
    to: options.to,
    subject: options.subject,
    text: options.text ?? "Bonjour, ci-joint notre facture.",
    messageId: options.messageId,
    attachments: options.pdf
      ? [{ filename: "facture.pdf", content: options.pdf, contentType: "application/pdf" }]
      : [],
  });
  return info.message as Buffer;
}

async function setup() {
  const a = await createOrganization("Charpentes A");
  const b = await createOrganization("Menuiserie B");
  const template = await db.stepTemplate.findFirstOrThrow({ where: { organizationId: a.organization.id } });
  const site = await createSite(a.ownerCtx, {
    newClient: { name: "M. et Mme Dupont", emails: "dupont@exemple.fr" },
    info: { title: "Charpente maison Dupont", address: "8 chemin des Vignes", city: "Castanet" },
    templateId: template.id,
  });
  return { a, b, site };
}

async function streamToBuffer(stream: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
}

describe("inbound e-mail", () => {
  it("files an e-mailed invoice in the right organization and site", async () => {
    const { a, b, site } = await setup();
    const pdf = await samplePdf("Facture F-881", [
      "SCIERIE DU COMMINGES SARL",
      "Livraison chantier Dupont",
      "Total TTC : 1 284,00 €",
      "18/11/2026",
    ]);
    const raw = await mime({
      to: inboundAddress(a.organization.slug),
      subject: "Facture F-881",
      pdf,
      messageId: "<abc@scierie.fr>",
    });
    const result = await receiveInboundMail(raw);
    expect(result).toEqual({ status: "processed", organizationId: a.organization.id, documents: 1 });
    const doc = await db.document.findFirstOrThrow({ where: { source: "EMAIL" } });
    expect(doc).toMatchObject({
      organizationId: a.organization.id,
      siteId: site.id,
      type: "INVOICE",
      amountCents: 128_400,
      processingStatus: "DONE",
    });
    expect(doc.supplier).toContain("SCIERIE");
    expect(await receiveInboundMail(raw)).toEqual({ status: "duplicate" });
    expect(await db.document.count()).toBe(1);
    expect(await listDocuments(b.ownerCtx)).toHaveLength(0);
    expect((await listDocuments(a.ownerCtx, { q: "comminges" })).map((d) => d.id)).toEqual([doc.id]);
  });

  it("keeps a mail without attachment as a text document and ignores unknown addresses", async () => {
    const { a } = await setup();
    const raw = await mime({
      to: inboundAddress(a.organization.slug),
      subject: "Devis à prévoir",
      text: "Le client Garcia veut un devis pour un carport.",
    });
    expect((await receiveInboundMail(raw)).status).toBe("processed");
    const doc = await db.document.findFirstOrThrow({ where: { source: "EMAIL" } });
    expect(doc.mimeType).toBe("text/plain");
    expect(
      await receiveInboundMail(await mime({ to: "docs-inconnue@docs.chantierlink.local", subject: "x" })),
    ).toEqual({
      status: "unknown_recipient",
    });
  });

  it("sends unclear documents to « À traiter »", async () => {
    const { a } = await setup();
    const pdf = await samplePdf("Document", ["Quelque chose d'illisible sans indice"]);
    await receiveInboundMail(await mime({ to: inboundAddress(a.organization.slug), subject: "Scan", pdf }));
    const item = await db.inboxItem.findFirstOrThrow({ where: { kind: "DOCUMENT" } });
    expect(item.confidence!).toBeLessThan(0.75);
  });
});

describe("end-of-site report", () => {
  it("builds a PDF with steps, documents, signatures and the footer, and stores it", async () => {
    const { a, site } = await setup();
    await uploadDocuments(
      a.ownerCtx,
      [{ name: "Devis.pdf", bytes: new Uint8Array(await samplePdf("Devis", ["Devis charpente"])) }],
      {
        siteId: site.id,
        type: "QUOTE",
      },
    );
    const pdf = await buildHandoverPdf(site.id, { signatures: true });
    const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });
    expect(text).toContain("Dossier de fin de chantier");
    expect(text).toContain("Charpente maison Dupont");
    expect(text).toContain("Prise de côtes");
    expect(text).toContain("Pour l'entreprise");
    expect(text).toContain(HANDOVER_FOOTER);
    const doc = await generateHandover({
      organizationId: a.organization.id,
      siteId: site.id,
      userId: a.owner.id,
      signatures: false,
    });
    expect(doc).toMatchObject({ siteId: site.id, source: "GENERATED", mimeType: "application/pdf" });
    expect(await db.notification.count({ where: { type: "document.ready", userId: a.owner.id } })).toBe(1);
  });
});

describe("imports and exports", () => {
  it("imports clients with duplicates and errors reported", async () => {
    const { a } = await setup();
    const result = await importClients(
      a.ownerCtx,
      [
        { Nom: "Claire Bernard", Email: "claire@exemple.fr", Tel: "0711223344" },
        { Nom: "Claire Bernard", Email: "claire@exemple.fr", Tel: "0711223344" },
        { Nom: "M. et Mme Dupont", Email: "dupont@exemple.fr", Tel: "" },
        { Nom: "Mauvais", Email: "pas-un-email", Tel: "" },
        { Nom: "", Email: "", Tel: "" },
      ],
      { name: "Nom", email: "Email", phone: "Tel" },
    );
    expect(result).toMatchObject({ created: 1, skipped: 3, errorCount: 1 });
    expect(result.errors[0]).toMatchObject({ line: 5 });
    expect(await db.client.count({ where: { organizationId: a.organization.id } })).toBe(2);
  });

  it("exports CSV of the organization only and a ZIP of a site", async () => {
    const { a, b, site } = await setup();
    await createSite(b.ownerCtx, {
      newClient: { name: "Client secret de B" },
      info: { title: "Secret", address: "1 rue" },
    });
    const csv = await clientsCsv(a.ownerCtx);
    expect(csv).toContain("M. et Mme Dupont");
    expect(csv).not.toContain("Client secret de B");
    expect(await documentsCsv(a.ownerCtx, {})).toContain("Nom;Type;Date");
    await uploadDocuments(
      a.ownerCtx,
      [{ name: "Plan.pdf", bytes: new Uint8Array(await samplePdf("Plan", ["Plan"])) }],
      {
        siteId: site.id,
        type: "PLAN",
      },
    );
    const { fileName, stream } = await siteZip(a.ownerCtx, site.id);
    expect(fileName).toMatch(/^DUP-1-.+\.zip$/);
    const zip = await streamToBuffer(stream);
    expect(zip.subarray(0, 2).toString()).toBe("PK");
    expect(zip.toString("latin1")).toContain("documents/Plan/Plan.pdf");
    expect(zip.toString("latin1")).toContain("journal.txt");
    await expect(siteZip(b.ownerCtx, site.id)).rejects.toThrow();
  });
});
