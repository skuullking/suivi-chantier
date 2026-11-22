/**
 * Inbound WhatsApp messages: idempotent reception (message id), sender identification, automatic attachment to a
 * site with a confidence score, simple commands, transcription, confirmation reply.
 */
import { Prisma } from "@/generated/prisma/client";
import { today } from "@/lib/dates";
import { messaging } from "@/server/adapters/messaging";
import { llm } from "@/server/adapters/llm";
import { transcription } from "@/server/adapters/transcription";
import { storage } from "@/server/adapters/storage";
import type { ServiceContext } from "@/server/auth/context";
import { db } from "@/server/db";
import { parseWhatsAppText, toE164, type WhatsAppCommand } from "@/server/domain/whatsapp-commands";
import { resolveDeterministic, type Resolution } from "@/server/domain/site-resolver";
import { env } from "@/server/env";
import { enqueue } from "@/server/jobs/queue";
import { logger } from "@/server/logger";
import { storeDocument } from "./documents";
import { recordSiteEvent } from "./events";
import { notifyPendingPhotos, processMedia, storeMedia } from "./media";
import { createNote } from "./notes";
import { notifyManagers } from "./notifications";
import { siteCandidates } from "./site-candidates";
import { setStepStatus } from "./steps";
import { arriveOnSite } from "./worker";

// ───────────── Meta webhook payload (subset) ─────────────

export type WaMedia = {
  id: string;
  mime_type?: string;
  caption?: string;
  filename?: string;
  voice?: boolean;
};
export type WaMessage = {
  from: string;
  id: string;
  timestamp?: string;
  type: string;
  text?: { body: string };
  image?: WaMedia;
  audio?: WaMedia;
  video?: WaMedia;
  document?: WaMedia;
  location?: { latitude: number; longitude: number };
};
export type WaPayload = {
  object?: string;
  entry?: {
    id?: string;
    changes?: {
      field?: string;
      value?: { contacts?: { wa_id: string; profile?: { name?: string } }[]; messages?: WaMessage[] };
    }[];
  }[];
};

export function extractMessages(payload: WaPayload): (WaMessage & { profileName?: string })[] {
  const out: (WaMessage & { profileName?: string })[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      for (const message of value?.messages ?? []) {
        const contact = value?.contacts?.find((c) => c.wa_id === message.from);
        out.push({ ...message, profileName: contact?.profile?.name });
      }
    }
  }
  return out;
}

/** Stores each message once (unique provider + message id) and schedules its processing. */
export async function receiveWhatsAppPayload(payload: WaPayload) {
  let accepted = 0;
  let duplicates = 0;
  for (const message of extractMessages(payload)) {
    if (!message.id || !message.from) continue;
    try {
      const log = await db.messageLog.create({
        data: {
          channel: "WHATSAPP",
          direction: "INBOUND",
          provider: "whatsapp",
          externalId: message.id,
          fromAddress: toE164(message.from),
          toAddress: env().WHATSAPP_BUSINESS_NUMBER,
          body:
            message.text?.body ??
            message.image?.caption ??
            message.document?.caption ??
            message.video?.caption ??
            null,
          payload: message as unknown as Prisma.InputJsonValue,
          status: "received",
        },
      });
      accepted++;
      await enqueue("whatsapp.process", { messageLogId: log.id });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        duplicates++;
        continue;
      }
      throw error;
    }
  }
  return { accepted, duplicates };
}

// ───────────── Processing ─────────────

const UNKNOWN_REPLY =
  "Bonjour ! Ce numéro n'est pas encore reconnu par ChantierLink. Demandez à votre responsable d'ajouter votre numéro dans l'équipe, puis renvoyez votre message.";

async function reply(to: string, text: string, organizationId: string | null) {
  try {
    await messaging().sendText(to, text, organizationId);
  } catch (error) {
    logger.error({ err: error }, "Réponse WhatsApp impossible");
  }
}

async function senderContext(phone: string): Promise<(ServiceContext & { userName: string }) | null> {
  const contact = await db.whatsAppContact.findUnique({
    where: { phoneE164: phone },
    include: { user: true },
  });
  if (!contact?.userId || !contact.user) return null;
  const membership = await db.membership.findUnique({
    where: { userId_organizationId: { userId: contact.userId, organizationId: contact.organizationId } },
    include: { organization: true },
  });
  if (!membership) return null;
  return {
    userId: contact.userId,
    organizationId: contact.organizationId,
    organizationTimeZone: membership.organization.timezone,
    ip: null,
    userName: contact.user.name,
    actor: {
      kind: "member",
      userId: contact.userId,
      organizationId: contact.organizationId,
      role: membership.role,
      officeCanValidatePhotos: membership.organization.officeCanValidatePhotos,
    },
  };
}

async function resolve(
  ctx: ServiceContext & { userName: string },
  input: {
    text: string | null;
    siteCode?: string | null;
    gps?: { lat: number; lng: number } | null;
    kind: "PHOTO" | "VOICE" | "TEXT" | "DOCUMENT";
  },
): Promise<Resolution & { siteTitle: string | null; stepTitle: string | null }> {
  const candidates = await siteCandidates(ctx);
  let result: Resolution | null = resolveDeterministic({
    text: input.text,
    siteCode: input.siteCode,
    candidates,
  });
  if (!result) {
    result = candidates.length
      ? await llm().resolveSite({
          senderName: ctx.userName,
          text: input.text,
          mediaKind: input.kind,
          gps: input.gps ?? null,
          candidates,
        })
      : { siteId: null, stepId: null, confidence: 0, reason: "Aucun chantier en cours pour cette personne" };
  }
  const site = candidates.find((c) => c.id === result.siteId);
  return {
    ...result,
    siteTitle: site?.title ?? null,
    stepTitle: site?.steps.find((s) => s.id === result.stepId)?.title ?? null,
  };
}

const confident = (r: Resolution) => r.siteId !== null && r.confidence >= env().AUTO_CLASSIFY_THRESHOLD;

function filedReply(r: { siteTitle: string | null; stepTitle: string | null }) {
  return `Reçu ✅ Chantier « ${r.siteTitle} »${r.stepTitle ? `, étape « ${r.stepTitle} »` : ""}`;
}
const INBOX_REPLY = "Reçu ✅ Le bureau va le rattacher au bon chantier.";

/** Executes a text command on a site. Returns the confirmation sent to the worker. */
export async function executeCommand(
  ctx: ServiceContext,
  siteId: string,
  command: WhatsAppCommand,
  siteTitle: string,
) {
  switch (command.type) {
    case "arrive":
      await arriveOnSite(ctx, siteId);
      return `C'est noté ✅ Arrivée enregistrée sur « ${siteTitle} ».`;
    case "finished": {
      const day = today(ctx.organizationTimeZone);
      await db.assignment.updateMany({
        where: { organizationId: ctx.organizationId, siteId, userId: ctx.userId, date: day },
        data: { finishedAt: new Date() },
      });
      await recordSiteEvent({
        organizationId: ctx.organizationId,
        siteId,
        actorId: ctx.userId,
        type: "note.added",
      });
      return `Bonne fin de journée ✅ Départ enregistré sur « ${siteTitle} ».`;
    }
    case "step_done": {
      const steps = await db.siteStep.findMany({ where: { siteId }, orderBy: { order: "asc" } });
      const step = steps.find((s) => s.status === "IN_PROGRESS") ?? steps.find((s) => s.status === "TODO");
      if (!step) return `Toutes les étapes de « ${siteTitle} » sont déjà terminées 👍`;
      const { progress } = await setStepStatus(ctx, step.id, "DONE");
      return `Étape « ${step.title} » terminée ✅ Avancement du chantier : ${progress} %.`;
    }
    case "problem":
      await createNote(ctx, siteId, { text: command.text, kind: "PROBLEM" });
      return `Problème transmis au bureau ✅ (chantier « ${siteTitle} »).`;
    case "note":
      await createNote(ctx, siteId, { text: command.text, kind: "NOTE", internal: true });
      return `Reçu ✅ Note ajoutée au chantier « ${siteTitle} ».`;
  }
}

export async function processInboundWhatsApp(messageLogId: string) {
  const log = await db.messageLog.findUnique({ where: { id: messageLogId } });
  if (!log || log.status === "processed" || log.status === "ignored") return;
  const message = log.payload as unknown as WaMessage;
  const from = log.fromAddress!;
  const ctx = await senderContext(from);
  if (!ctx) {
    // Polite answer, at most once a day per unknown number.
    const recent = await db.messageLog.findFirst({
      where: {
        channel: "WHATSAPP",
        direction: "OUTBOUND",
        toAddress: from,
        body: UNKNOWN_REPLY,
        createdAt: { gt: new Date(Date.now() - 86_400_000) },
      },
    });
    if (!recent) await reply(from, UNKNOWN_REPLY, null);
    await db.messageLog.update({ where: { id: log.id }, data: { status: "ignored" } });
    return;
  }
  await db.messageLog.update({ where: { id: log.id }, data: { organizationId: ctx.organizationId } });
  const orgId = ctx.organizationId;
  let answer = INBOX_REPLY;

  try {
    if (message.type === "text" && message.text?.body) {
      const parsed = parseWhatsAppText(message.text.body);
      const r = await resolve(ctx, { text: message.text.body, siteCode: parsed.siteCode, kind: "TEXT" });
      if (confident(r)) {
        answer = await executeCommand(ctx, r.siteId!, parsed.command, r.siteTitle!);
      } else {
        await db.inboxItem.create({
          data: {
            organizationId: orgId,
            kind: "MESSAGE",
            messageText: message.text.body,
            fromPhone: from,
            authorId: ctx.userId,
            proposedSiteId: r.siteId,
            proposedStepId: r.stepId,
            confidence: r.confidence,
            reason: r.reason,
          },
        });
        if (parsed.command.type === "problem") {
          await notifyManagers({
            organizationId: orgId,
            type: "problem.reported",
            title: `Problème signalé par ${ctx.userName}`,
            body: parsed.command.text.slice(0, 200),
            link: "/app/a-traiter",
          });
          answer = "Problème transmis au bureau ✅ Il sera rattaché au bon chantier.";
        } else {
          await notifyManagers({
            organizationId: orgId,
            type: "inbox.item",
            title: `Message à classer de ${ctx.userName}`,
            link: "/app/a-traiter",
          });
        }
      }
    } else if (["image", "video", "audio", "voice"].includes(message.type)) {
      const wa = message.image ?? message.video ?? message.audio!;
      const file = await messaging().downloadMedia(wa.id);
      const isVoice = message.type === "audio" || message.type === "voice";
      const { media } = await storeMedia({
        organizationId: orgId,
        authorId: ctx.userId,
        siteId: null,
        source: "WHATSAPP",
        file: { name: file.fileName ?? `${message.type}-${message.id}`, bytes: file.bytes },
        caption: wa.caption ?? null,
        clientUploadId: `wa_${message.id}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64),
        capturedAt: message.timestamp ? new Date(Number(message.timestamp) * 1000) : null,
        kindHint: isVoice ? "VOICE" : undefined,
      });
      const processed = media.kind === "PHOTO" ? await processMedia(media.id) : media;
      const gps =
        processed?.latitude != null && processed.longitude != null
          ? { lat: processed.latitude, lng: processed.longitude }
          : null;
      const parsed = wa.caption ? parseWhatsAppText(wa.caption) : null;
      const r = await resolve(ctx, {
        text: wa.caption ?? null,
        siteCode: parsed?.siteCode,
        gps,
        kind: media.kind === "VOICE" ? "VOICE" : "PHOTO",
      });
      if (confident(r)) {
        await db.media.update({ where: { id: media.id }, data: { siteId: r.siteId, stepId: r.stepId } });
        await recordSiteEvent({
          organizationId: orgId,
          siteId: r.siteId!,
          actorId: ctx.userId,
          type: "media.added",
          payload: { kind: media.kind },
        });
        if (media.kind === "PHOTO" && media.validationStatus === "PENDING")
          await notifyPendingPhotos(orgId, r.siteTitle!);
        answer = filedReply(r);
      } else {
        await db.inboxItem.create({
          data: {
            organizationId: orgId,
            kind: "MEDIA",
            mediaId: media.id,
            fromPhone: from,
            authorId: ctx.userId,
            messageText: wa.caption ?? null,
            proposedSiteId: r.siteId,
            proposedStepId: r.stepId,
            confidence: r.confidence,
            reason: r.reason,
          },
        });
        await notifyManagers({
          organizationId: orgId,
          type: "inbox.item",
          title: `${media.kind === "VOICE" ? "Vocal" : "Photo"} à classer de ${ctx.userName}`,
          link: "/app/a-traiter",
        });
      }
      if (media.kind === "VOICE") await enqueue("media.transcribe", { mediaId: media.id });
    } else if (message.type === "document" && message.document) {
      const file = await messaging().downloadMedia(message.document.id);
      const r = await resolve(ctx, {
        text: message.document.caption ?? message.document.filename ?? null,
        kind: "DOCUMENT",
      });
      const doc = await storeDocument({
        organizationId: orgId,
        file: { name: message.document.filename ?? file.fileName ?? "document.pdf", bytes: file.bytes },
        source: "WHATSAPP",
        uploadedById: ctx.userId,
        siteId: confident(r) ? r.siteId : null,
      });
      await enqueue("document.process", { documentId: doc.id });
      answer = confident(r)
        ? `Document reçu ✅ Chantier « ${r.siteTitle} ».`
        : "Document reçu ✅ Il sera classé automatiquement.";
    } else {
      answer = "Reçu 👍 Envoyez une photo, un vocal ou un texte (ex. « J'arrive », « Problème : … »).";
    }
    await db.messageLog.update({ where: { id: log.id }, data: { status: "processed" } });
  } catch (error) {
    logger.error({ err: error, messageLogId }, "Traitement d'un message WhatsApp impossible");
    await db.messageLog.update({ where: { id: log.id }, data: { status: "failed" } });
    answer = "Désolé, votre message n'a pas pu être traité. Réessayez dans un instant.";
  }
  await reply(from, answer, orgId);
}

/** Background transcription of a voice note → journal note (problems are detected and stay internal). */
export async function transcribeMedia(mediaId: string) {
  const media = await db.media.findUnique({ where: { id: mediaId } });
  if (!media || media.kind !== "VOICE" || media.transcriptionStatus === "DONE") return;
  await db.media.update({ where: { id: mediaId }, data: { transcriptionStatus: "PROCESSING" } });
  try {
    const bytes = await storage().get(media.storageKey);
    const { text } = await transcription().transcribe({
      bytes: new Uint8Array(bytes),
      mimeType: media.mimeType,
      fileName: media.originalName ?? "vocal.webm",
    });
    await db.media.update({
      where: { id: mediaId },
      data: { transcription: text, transcriptionStatus: "DONE" },
    });
    if (media.siteId) await addVoiceNote(media.id);
  } catch (error) {
    logger.error({ err: error, mediaId }, "Transcription impossible");
    await db.media.update({ where: { id: mediaId }, data: { transcriptionStatus: "FAILED" } });
  }
}

/** Journal entry for a transcribed voice note (once the note is attached to a site). */
export async function addVoiceNote(mediaId: string) {
  const media = await db.media.findUnique({ where: { id: mediaId } });
  if (!media?.siteId || !media.transcription) return;
  const existing = await db.note.findFirst({ where: { mediaId } });
  if (existing) return;
  const isProblem = parseWhatsAppText(media.transcription).command.type === "problem";
  await db.note.create({
    data: {
      organizationId: media.organizationId,
      siteId: media.siteId,
      authorId: media.authorId,
      kind: isProblem ? "PROBLEM" : "VOICE",
      text: media.transcription,
      internal: true,
      mediaId,
    },
  });
  await recordSiteEvent({
    organizationId: media.organizationId,
    siteId: media.siteId,
    actorId: media.authorId,
    type: isProblem ? "problem.reported" : "note.added",
  });
  if (isProblem) {
    const site = await db.site.findUniqueOrThrow({ where: { id: media.siteId }, select: { title: true } });
    await notifyManagers({
      organizationId: media.organizationId,
      type: "problem.reported",
      title: `Problème signalé (vocal) : ${site.title}`,
      body: media.transcription.slice(0, 200),
      link: `/app/chantiers/${media.siteId}/journal`,
    });
  }
}
