import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { today, toDateKey } from "@/lib/dates";
import { simulatorMediaKey } from "@/server/adapters/messaging";
import { storage } from "@/server/adapters/storage";
import { simulatorTranscriptKey } from "@/server/adapters/transcription";
import { db } from "@/server/db";
import { samplePdf, sampleVoice } from "@/server/dev/fixtures";
import { listInbox, resolveInboxItem } from "@/server/services/inbox";
import { approveAndSend, dayFacts, generateDailySummary } from "@/server/services/summaries";
import { createSite } from "@/server/services/sites";
import { receiveWhatsAppPayload, type WaMessage } from "@/server/services/whatsapp";
import { createPortalLink, portalData, resolvePortalToken } from "@/server/services/portal";
import { validateMedia } from "@/server/services/media";
import { addMember, createOrganization } from "./helpers";

const PHONE = "+33611112222";

async function setup(options: { plannedToday?: boolean; secondSite?: boolean } = {}) {
  const a = await createOrganization("Charpentes A");
  const worker = await addMember(a.organization.id, "WORKER", "Jean");
  await db.whatsAppContact.create({
    data: { organizationId: a.organization.id, userId: worker.user.id, phoneE164: PHONE },
  });
  const template = await db.stepTemplate.findFirstOrThrow({
    where: { organizationId: a.organization.id, trade: "CARPENTER" },
  });
  const client = await db.client.create({
    data: {
      organizationId: a.organization.id,
      name: "M. et Mme Dupont",
      emails: ["dupont@exemple.fr"],
      consentCommunications: true,
    },
  });
  const site = await createSite(a.ownerCtx, {
    clientId: client.id,
    info: { title: "Charpente maison Dupont", address: "8 chemin des Vignes", city: "Castanet" },
    templateId: template.id,
    memberIds: [worker.user.id],
  });
  let second = null;
  if (options.secondSite) {
    second = await createSite(a.ownerCtx, {
      newClient: { name: "Isabelle Garcia" },
      info: { title: "Extension Garcia", address: "27 rue des Lilas", city: "Balma" },
      templateId: template.id,
      memberIds: [worker.user.id],
    });
  }
  if (options.plannedToday !== false) {
    await db.assignment.create({
      data: {
        organizationId: a.organization.id,
        siteId: site.id,
        userId: worker.user.id,
        date: today("Europe/Paris"),
      },
    });
  }
  return { a, worker, site, second, client };
}

function payload(message: Partial<WaMessage> & { type: string }) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              contacts: [{ wa_id: PHONE.slice(1), profile: { name: "Jean" } }],
              messages: [
                {
                  from: PHONE.slice(1),
                  id: `wamid.${randomUUID()}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  ...message,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function fakeMedia(bytes: Buffer, mimeType: string, fileName: string) {
  const id = randomUUID().replace(/-/g, "");
  await storage().put(simulatorMediaKey(id), bytes, mimeType);
  await storage().put(
    `${simulatorMediaKey(id)}.json`,
    Buffer.from(JSON.stringify({ mimeType, fileName })),
    "application/json",
  );
  return id;
}

const replies = () =>
  db.messageLog.findMany({
    where: { channel: "WHATSAPP", direction: "OUTBOUND", toAddress: PHONE },
    orderBy: { createdAt: "asc" },
  });

describe("WhatsApp reception", () => {
  it("files a photo on the single site of the day and confirms to the worker", async () => {
    const { site } = await setup();
    const jpeg = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#999" } })
      .jpeg()
      .toBuffer();
    const mediaId = await fakeMedia(jpeg, "image/jpeg", "photo.jpg");
    const result = await receiveWhatsAppPayload(
      payload({ type: "image", image: { id: mediaId, mime_type: "image/jpeg", caption: "Faîtage posé" } }),
    );
    expect(result).toEqual({ accepted: 1, duplicates: 0 });
    const media = await db.media.findFirstOrThrow({ where: { source: "WHATSAPP" } });
    expect(media.siteId).toBe(site.id);
    expect(media.stepId).not.toBeNull();
    expect(media.caption).toBe("Faîtage posé");
    expect(media.displayKey).toBeTruthy();
    const [reply] = await replies();
    expect(reply!.body).toMatch(/^Reçu ✅ Chantier « Charpente maison Dupont », étape « /);
  });

  it("is idempotent on the WhatsApp message id", async () => {
    await setup();
    const p = payload({ type: "text", text: { body: "Le client passe demain" } });
    expect(await receiveWhatsAppPayload(p)).toEqual({ accepted: 1, duplicates: 0 });
    expect(await receiveWhatsAppPayload(p)).toEqual({ accepted: 0, duplicates: 1 });
    expect(await db.note.count()).toBe(1);
  });

  it("answers politely to unknown numbers and ignores the message", async () => {
    await setup();
    await receiveWhatsAppPayload({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { from: "33799999999", id: "wamid.unknown", type: "text", text: { body: "Salut" } },
                ],
              },
            },
          ],
        },
      ],
    });
    const log = await db.messageLog.findFirstOrThrow({ where: { externalId: "wamid.unknown" } });
    expect(log.status).toBe("ignored");
    const reply = await db.messageLog.findFirstOrThrow({
      where: { direction: "OUTBOUND", toAddress: "+33799999999" },
    });
    expect(reply.body).toContain("n'est pas encore reconnu");
    expect(await db.note.count()).toBe(0);
  });

  it("runs the text commands on the right site", async () => {
    const { site, a } = await setup();
    await receiveWhatsAppPayload(payload({ type: "text", text: { body: "J'arrive" } }));
    const assignment = await db.assignment.findFirstOrThrow({ where: { siteId: site.id } });
    expect(assignment.arrivedAt).not.toBeNull();
    await receiveWhatsAppPayload(payload({ type: "text", text: { body: "Étape terminée" } }));
    expect(await db.siteStep.count({ where: { siteId: site.id, status: "DONE" } })).toBe(1);
    await receiveWhatsAppPayload(payload({ type: "text", text: { body: "Problème : panne fendue" } }));
    const problem = await db.note.findFirstOrThrow({ where: { kind: "PROBLEM" } });
    expect(problem).toMatchObject({ text: "panne fendue", internal: true, siteId: site.id });
    expect(await db.notification.count({ where: { userId: a.owner.id, type: "problem.reported" } })).toBe(1);
    const bodies = (await replies()).map((r) => r.body);
    expect(bodies[0]).toContain("Arrivée enregistrée");
    expect(bodies[1]).toMatch(/Étape « .+ » terminée ✅ Avancement du chantier : \d+ %/);
    expect(bodies[2]).toContain("Problème transmis");
  });

  it("sends low-confidence items to « À traiter » with the AI proposal, then files them in one click", async () => {
    const { a, site } = await setup({ plannedToday: false, secondSite: true });
    const jpeg = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#777" } })
      .jpeg()
      .toBuffer();
    const mediaId = await fakeMedia(jpeg, "image/jpeg", "photo.jpg");
    await receiveWhatsAppPayload(payload({ type: "image", image: { id: mediaId, mime_type: "image/jpeg" } }));
    const media = await db.media.findFirstOrThrow({ where: { source: "WHATSAPP" } });
    expect(media.siteId).toBeNull();
    const [item] = await listInbox(a.ownerCtx);
    expect(item).toMatchObject({ kind: "MEDIA", mediaId: media.id });
    expect(item!.confidence!).toBeLessThan(0.75);
    expect((await replies())[0]!.body).toContain("Le bureau va le rattacher");
    await resolveInboxItem(a.ownerCtx, item!.id, { siteId: site.id });
    expect((await db.media.findUniqueOrThrow({ where: { id: media.id } })).siteId).toBe(site.id);
    expect(await listInbox(a.ownerCtx)).toHaveLength(0);
  });

  it("transcribes voice notes into the journal", async () => {
    const { site } = await setup();
    const voice = sampleVoice();
    await storage().put(
      simulatorTranscriptKey(new Uint8Array(voice)),
      Buffer.from("On a fini les fermes côté nord."),
      "text/plain",
    );
    const mediaId = await fakeMedia(voice, "audio/wav", "vocal.wav");
    await receiveWhatsAppPayload(
      payload({ type: "audio", audio: { id: mediaId, mime_type: "audio/wav", voice: true } }),
    );
    const media = await db.media.findFirstOrThrow({ where: { kind: "VOICE" } });
    expect(media).toMatchObject({
      siteId: site.id,
      transcription: "On a fini les fermes côté nord.",
      transcriptionStatus: "DONE",
    });
    const note = await db.note.findFirstOrThrow({ where: { mediaId: media.id } });
    expect(note).toMatchObject({ kind: "VOICE", internal: true, text: "On a fini les fermes côté nord." });
  });

  it("stores documents and classifies them automatically", async () => {
    await setup();
    const pdf = await samplePdf("Facture F-881", [
      "Scierie du Comminges SARL",
      "Chantier Dupont",
      "Total TTC 5 130,00 €",
      "12/11/2026",
    ]);
    const mediaId = await fakeMedia(pdf, "application/pdf", "facture.pdf");
    await receiveWhatsAppPayload(
      payload({
        type: "document",
        document: { id: mediaId, mime_type: "application/pdf", filename: "facture.pdf" },
      }),
    );
    const doc = await db.document.findFirstOrThrow({ where: { source: "WHATSAPP" } });
    expect(doc).toMatchObject({ type: "INVOICE", amountCents: 513000, processingStatus: "DONE" });
    expect(doc.siteId).not.toBeNull();
    expect(doc.ocrText).toContain("Scierie");
  });
});

describe("daily summary", () => {
  it("never uses problems, then is published on the portal once approved", async () => {
    const { a, site } = await setup();
    const jpeg = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#aaa" } })
      .jpeg()
      .toBuffer();
    await receiveWhatsAppPayload(
      payload({
        type: "image",
        image: {
          id: await fakeMedia(jpeg, "image/jpeg", "p.jpg"),
          mime_type: "image/jpeg",
          caption: "Contreventement posé",
        },
      }),
    );
    await receiveWhatsAppPayload(
      payload({ type: "text", text: { body: "Problème : le voisin se plaint du bruit" } }),
    );
    const voice = sampleVoice();
    await storage().put(
      simulatorTranscriptKey(new Uint8Array(voice)),
      Buffer.from("Problème : il manque deux pannes"),
      "text/plain",
    );
    await receiveWhatsAppPayload(
      payload({
        type: "audio",
        audio: { id: await fakeMedia(voice, "audio/wav", "v.wav"), mime_type: "audio/wav" },
      }),
    );

    const dayKey = toDateKey(today("Europe/Paris"));
    const facts = await dayFacts(site.id, dayKey);
    expect(JSON.stringify(facts.input)).not.toMatch(/voisin|pannes/);

    const summary = await generateDailySummary(a.organization.id, site.id, dayKey);
    expect(summary?.status).toBe("DRAFT");
    expect(summary!.generatedText).not.toMatch(/voisin|pannes|problème/i);
    expect(await db.notification.count({ where: { type: "summary.ready" } })).toBeGreaterThan(0);

    const photo = await db.media.findFirstOrThrow({ where: { kind: "PHOTO" } });
    await validateMedia(a.ownerCtx, [photo.id], "APPROVED");
    const { token } = await createPortalLink(a.ownerCtx, site.id);
    const { emailedTo } = await approveAndSend(
      a.ownerCtx,
      summary!.id,
      "Belle journée : le contreventement est posé !",
    );
    expect(emailedTo).toBe("dupont@exemple.fr");
    const mail = await db.messageLog.findFirstOrThrow({
      where: { channel: "EMAIL", toAddress: "dupont@exemple.fr" },
    });
    expect(mail.body).toContain(`/s/${token}`);
    const resolved = await resolvePortalToken(token);
    if (resolved.status !== "ok") throw new Error("lien");
    const data = await portalData({
      kind: "client",
      organizationId: resolved.organizationId,
      siteId: resolved.siteId,
    });
    expect(data.summaries[0]!.text).toBe("Belle journée : le contreventement est posé !");
    // Generating again does not overwrite a sent summary.
    const again = await generateDailySummary(a.organization.id, site.id, dayKey, { force: true });
    expect(again?.status).toBe("SENT");
  });
});
