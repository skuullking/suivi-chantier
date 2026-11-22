/**
 * Daily summary for the client: drafted by the LLM at the end of the day (hour set by the organization) from the
 * day's photos, voice transcriptions, completed and next steps. Problems and internal notes are never used.
 * DRAFT → one-click approval (editable) → sent (e-mail) and published in the client portal.
 */
import { dayKeyInTimeZone, dayRangeInTimeZone, hourInTimeZone, parseDateOnly } from "@/lib/dates";
import { formatDayLong } from "@/lib/format";
import { llm } from "@/server/adapters/llm";
import { mailProvider, renderEmail } from "@/server/adapters/mail";
import type { ServiceContext } from "@/server/auth/context";
import { decryptSecret } from "@/server/auth/tokens";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { AppError, NotFoundError } from "@/server/errors";
import { logger } from "@/server/logger";
import { assertCan } from "@/server/permissions/can";
import { loadSiteFor } from "./access";
import { audit } from "./audit";
import { recordSiteEvent } from "./events";
import { notifyManagers } from "./notifications";
import { portalUrl } from "./portal";

/** Facts of the day for a site (client-safe: problems and internal notes excluded). */
export async function dayFacts(siteId: string, dayKey: string) {
  const site = await db.site.findUniqueOrThrow({
    where: { id: siteId },
    include: {
      client: true,
      organization: true,
      steps: { orderBy: { order: "asc" } },
    },
  });
  const { start, end } = dayRangeInTimeZone(dayKey, site.organization.timezone);
  const [media, notes] = await Promise.all([
    db.media.findMany({
      where: { siteId, receivedAt: { gte: start, lt: end }, validationStatus: { not: "REJECTED" } },
      include: { step: { select: { title: true, visibleToClient: true } } },
      orderBy: { receivedAt: "asc" },
    }),
    db.note.findMany({
      where: { siteId, createdAt: { gte: start, lt: end }, internal: false, kind: { not: "PROBLEM" } },
    }),
  ]);
  const photos = media.filter((m) => m.kind === "PHOTO");
  const voices = media.filter((m) => m.kind === "VOICE" && m.transcription);
  const visibleSteps = site.steps.filter((s) => s.visibleToClient);
  const completed = visibleSteps.filter(
    (s) => s.completedAt && s.completedAt >= start && s.completedAt < end,
  );
  const current = visibleSteps.find((s) => s.status === "IN_PROGRESS") ?? null;
  const next = visibleSteps.filter((s) => s.status === "TODO").slice(0, 2);
  // Voice notes are internal by default: only those that are not problems feed the summary.
  const { parseWhatsAppText } = await import("@/server/domain/whatsapp-commands");
  const voiceUpdates = voices
    .map((v) => v.transcription!)
    .filter((t) => parseWhatsAppText(t).command.type !== "problem");
  return {
    site,
    hasActivity: photos.length > 0 || voices.length > 0 || completed.length > 0 || notes.length > 0,
    approvedPhotoIds: photos.filter((p) => p.validationStatus === "APPROVED").map((p) => p.id),
    input: {
      organizationName: site.organization.name,
      siteTitle: site.title,
      clientName: site.client.name,
      dateLabel: formatDayLong(parseDateOnly(dayKey)),
      completedSteps: completed.map((s) => s.title),
      currentStep: current?.title ?? null,
      nextSteps: next.map((s) => s.title),
      photoCaptions: photos
        .map((p) => p.caption ?? (p.step?.visibleToClient ? p.step.title : ""))
        .filter(Boolean),
      photoCount: photos.length,
      updates: [...voiceUpdates, ...notes.map((n) => n.text)].slice(0, 10),
    },
  };
}

/** Creates (or refreshes while still a draft) the summary of a site for a day. */
export async function generateDailySummary(
  organizationId: string,
  siteId: string,
  dayKey: string,
  options: { force?: boolean } = {},
) {
  const facts = await dayFacts(siteId, dayKey);
  if (facts.site.organizationId !== organizationId) throw new NotFoundError();
  const date = parseDateOnly(dayKey);
  const existing = await db.dailySummary.findUnique({ where: { siteId_date: { siteId, date } } });
  if (existing && existing.status !== "DRAFT") return existing;
  if (!facts.hasActivity && !options.force) return null;
  const text = await llm().summarizeDay(facts.input);
  const summary = existing
    ? await db.dailySummary.update({
        where: { id: existing.id },
        data: { generatedText: text, editedText: null, mediaIds: facts.approvedPhotoIds },
      })
    : await db.dailySummary.create({
        data: { organizationId, siteId, date, generatedText: text, mediaIds: facts.approvedPhotoIds },
      });
  if (facts.site.organization.summaryAutoSend) {
    await approveAndSend(null, summary.id, null);
  } else if (!existing) {
    await notifyManagers({
      organizationId,
      type: "summary.ready",
      title: `Résumé du jour à approuver : ${facts.site.title}`,
      body: text.slice(0, 160),
      link: "/app/a-traiter",
    });
  }
  return summary;
}

/** Manual "generate now" from the site journal. */
export async function generateSummaryNow(ctx: ServiceContext, siteId: string) {
  await loadSiteFor(ctx, siteId, "summary.approve");
  const dayKey = dayKeyInTimeZone(new Date(), ctx.organizationTimeZone ?? "Europe/Paris");
  return generateDailySummary(ctx.organizationId, siteId, dayKey, { force: true });
}

export async function listDraftSummaries(ctx: ServiceContext) {
  assertCan(ctx.actor, "summary.approve", { organizationId: ctx.organizationId });
  return db.dailySummary.findMany({
    where: { organizationId: ctx.organizationId, status: "DRAFT" },
    include: {
      site: {
        select: {
          id: true,
          title: true,
          client: { select: { name: true, emails: true, consentCommunications: true } },
        },
      },
    },
    orderBy: { date: "desc" },
  });
}

/** Approves (optionally edited) and sends: e-mail to the client + publication on the portal. */
export async function approveAndSend(
  ctx: ServiceContext | null,
  summaryId: string,
  editedText: string | null,
) {
  const summary = await db.dailySummary.findUnique({
    where: { id: summaryId },
    include: { site: { include: { client: true, organization: true, portalLinks: true } } },
  });
  if (!summary || (ctx && summary.organizationId !== ctx.organizationId))
    throw new NotFoundError("Résumé introuvable.");
  if (ctx) assertCan(ctx.actor, "summary.approve", { organizationId: ctx.organizationId });
  if (summary.status === "SENT") return { summary, emailedTo: null };
  const text = editedText?.trim() ? editedText.trim().slice(0, 3000) : null;
  const finalText = text ?? summary.generatedText;
  await db.dailySummary.update({
    where: { id: summaryId },
    data: { editedText: text, status: "APPROVED", approvedById: ctx?.userId ?? null, approvedAt: new Date() },
  });

  const { site } = summary;
  const activeLink = site.portalLinks.find(
    (l) => !l.revokedAt && (!l.expiresAt || l.expiresAt > new Date()) && l.tokenCiphertext,
  );
  const token = activeLink?.tokenCiphertext
    ? decryptSecret(activeLink.tokenCiphertext, env().APP_SECRET)
    : null;
  let emailedTo: string | null = null;
  const to = site.client.emails[0];
  if (to && site.client.consentCommunications) {
    try {
      const email = renderEmail({
        title: `Votre chantier « ${site.title} » — ${formatDayLong(summary.date)}`,
        paragraphs: [`Bonjour ${site.client.name},`, finalText],
        cta: token ? { label: "Voir les photos et l'avancement", url: portalUrl(token) } : undefined,
        footer: `${site.organization.name}${site.organization.phone ? ` · ${site.organization.phone}` : ""}`,
      });
      await mailProvider().send({
        to,
        subject: `Nouvelles de votre chantier — ${site.organization.name}`,
        html: email.html,
        text: email.text,
        organizationId: site.organizationId,
      });
      emailedTo = to;
    } catch (error) {
      logger.error({ err: error }, "Envoi du résumé impossible");
      throw new AppError("Le résumé est approuvé mais l'e-mail n'a pas pu partir. Réessayez plus tard.");
    }
  }
  const sent = await db.dailySummary.update({
    where: { id: summaryId },
    data: { status: "SENT", sentAt: new Date() },
  });
  await recordSiteEvent({
    organizationId: summary.organizationId,
    siteId: summary.siteId,
    actorId: ctx?.userId ?? null,
    type: "summary.sent",
  });
  await audit({
    organizationId: summary.organizationId,
    actorId: ctx?.userId ?? null,
    action: "summary.approve",
    entityType: "dailySummary",
    entityId: summaryId,
    after: { emailedTo, edited: Boolean(text) },
    ip: ctx?.ip ?? null,
  });
  await db.notification.updateMany({
    where: {
      organizationId: summary.organizationId,
      type: "summary.ready",
      link: "/app/a-traiter",
      readAt: null,
      title: { contains: site.title },
    },
    data: { readAt: new Date() },
  });
  return { summary: sent, emailedTo };
}

/**
 * Scheduler tick (every 15 minutes): for each organization whose local hour reached its summary hour, generates
 * the summaries of the day for the sites with activity (once per site and day).
 */
export async function runDailySummaries(now = new Date()) {
  const orgs = await db.organization.findMany({ select: { id: true, timezone: true, summaryHour: true } });
  let created = 0;
  for (const org of orgs) {
    if (hourInTimeZone(now, org.timezone) < org.summaryHour) continue;
    const dayKey = dayKeyInTimeZone(now, org.timezone);
    const { start, end } = dayRangeInTimeZone(dayKey, org.timezone);
    const sites = await db.site.findMany({
      where: {
        organizationId: org.id,
        status: { in: ["IN_PROGRESS", "PLANNED", "PAUSED"] },
        dailySummaries: { none: { date: parseDateOnly(dayKey) } },
        OR: [
          { media: { some: { receivedAt: { gte: start, lt: end } } } },
          { steps: { some: { completedAt: { gte: start, lt: end } } } },
        ],
      },
      select: { id: true },
    });
    for (const site of sites) {
      try {
        if (await generateDailySummary(org.id, site.id, dayKey)) created++;
      } catch (error) {
        logger.error({ err: error, siteId: site.id }, "Résumé du jour impossible");
      }
    }
  }
  return { created };
}
