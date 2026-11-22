/**
 * Client portal ("magic link"): long random token (32 bytes), SHA-256 stored for lookup, encrypted copy so managers
 * can copy the link again. Revocable, optionally expiring, rate-limited. The portal only exposes what is marked
 * visible: client-visible steps, approved photos (display version), approved / sent summaries, shared documents.
 */
import { addDays, today } from "@/lib/dates";
import type { ServiceContext } from "@/server/auth/context";
import { decryptSecret, encryptSecret, generateToken, hashToken } from "@/server/auth/tokens";
import { db } from "@/server/db";
import { appUrl, env } from "@/server/env";
import { AppError, NotFoundError } from "@/server/errors";
import { signFileUrl } from "@/server/files";
import { mailProvider, renderEmail } from "@/server/adapters/mail";
import { assertCan, can, type ClientActor } from "@/server/permissions/can";
import { loadSiteFor } from "./access";
import { audit } from "./audit";
import { recordSiteEvent } from "./events";
import { mediaUrls } from "./media";

export function portalUrl(token: string) {
  return appUrl(`/s/${token}`);
}

export async function listPortalLinks(ctx: ServiceContext, siteId: string) {
  await loadSiteFor(ctx, siteId, "portal.manage");
  const links = await db.clientPortalLink.findMany({
    where: { organizationId: ctx.organizationId, siteId },
    orderBy: { createdAt: "desc" },
  });
  const secret = env().APP_SECRET;
  return links.map((l) => {
    const token = l.tokenCiphertext ? decryptSecret(l.tokenCiphertext, secret) : null;
    const active = !l.revokedAt && (!l.expiresAt || l.expiresAt > new Date());
    return { ...l, active, url: token && active ? portalUrl(token) : null };
  });
}

/** Creates a new link. With `replace`, every active link of the site is revoked first. */
export async function createPortalLink(
  ctx: ServiceContext,
  siteId: string,
  options: { expiresInDays?: number | null; replace?: boolean } = {},
) {
  const { site } = await loadSiteFor(ctx, siteId, "portal.manage");
  const token = generateToken(32);
  const expiresAt = options.expiresInDays ? addDays(new Date(), options.expiresInDays) : null;
  const link = await db.$transaction(async (tx) => {
    if (options.replace) {
      await tx.clientPortalLink.updateMany({
        where: { siteId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    const created = await tx.clientPortalLink.create({
      data: {
        organizationId: ctx.organizationId,
        siteId,
        tokenHash: hashToken(token),
        tokenCiphertext: encryptSecret(token, env().APP_SECRET),
        expiresAt,
        createdById: ctx.userId,
      },
    });
    await recordSiteEvent(
      {
        organizationId: ctx.organizationId,
        siteId,
        actorId: ctx.userId,
        type: "portal.link",
        payload: { action: "created" },
      },
      tx,
    );
    await audit(
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "portal.create",
        entityType: "site",
        entityId: site.id,
        after: { linkId: created.id, expiresAt },
        ip: ctx.ip,
      },
      tx,
    );
    return created;
  });
  return { link, token, url: portalUrl(token) };
}

export async function revokePortalLink(ctx: ServiceContext, linkId: string) {
  const link = await db.clientPortalLink.findFirst({
    where: { id: linkId, organizationId: ctx.organizationId },
  });
  if (!link) throw new NotFoundError("Lien introuvable.");
  await loadSiteFor(ctx, link.siteId, "portal.manage");
  await db.$transaction(async (tx) => {
    await tx.clientPortalLink.update({ where: { id: linkId }, data: { revokedAt: new Date() } });
    await recordSiteEvent(
      {
        organizationId: ctx.organizationId,
        siteId: link.siteId,
        actorId: ctx.userId,
        type: "portal.link",
        payload: { action: "revoked" },
      },
      tx,
    );
    await audit(
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "portal.revoke",
        entityType: "site",
        entityId: link.siteId,
        after: { linkId },
        ip: ctx.ip,
      },
      tx,
    );
  });
}

/** Sends the link to the client by e-mail (requires an address; consent is checked for marketing-like sends). */
export async function emailPortalLink(ctx: ServiceContext, linkId: string, to?: string) {
  const links = await db.clientPortalLink.findFirst({
    where: { id: linkId, organizationId: ctx.organizationId },
  });
  if (!links) throw new NotFoundError("Lien introuvable.");
  const { site } = await loadSiteFor(ctx, links.siteId, "portal.manage");
  const token = links.tokenCiphertext ? decryptSecret(links.tokenCiphertext, env().APP_SECRET) : null;
  if (!token || links.revokedAt) throw new AppError("Ce lien n'est plus actif. Créez-en un nouveau.");
  const client = await db.client.findUniqueOrThrow({ where: { id: site.clientId } });
  const org = await db.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
  const address = to ?? client.emails[0];
  if (!address) throw new AppError("Ce client n'a pas d'adresse e-mail. Ajoutez-la sur sa fiche.");
  const email = renderEmail({
    title: `Suivez votre chantier « ${site.title} »`,
    paragraphs: [
      `Bonjour ${client.name},`,
      `${org.name} vous donne accès au suivi de votre chantier : avancement, photos et documents, en temps réel.`,
      "Ce lien est personnel : ne le partagez qu'avec les personnes concernées par le chantier.",
    ],
    cta: { label: "Voir mon chantier", url: portalUrl(token) },
    footer: `${org.name}${org.phone ? ` · ${org.phone}` : ""}`,
  });
  await mailProvider().send({
    to: address,
    subject: `Suivi de votre chantier — ${org.name}`,
    html: email.html,
    text: email.text,
    organizationId: ctx.organizationId,
  });
  return { to: address };
}

export type PortalResolution =
  | { status: "ok"; linkId: string; siteId: string; organizationId: string }
  | { status: "expired"; organizationId: string | null };

/** Resolves a token (constant-time via hash lookup). */
export async function resolvePortalToken(token: string): Promise<PortalResolution> {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return { status: "expired", organizationId: null };
  const link = await db.clientPortalLink.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!link) return { status: "expired", organizationId: null };
  if (link.revokedAt || (link.expiresAt && link.expiresAt <= new Date())) {
    return { status: "expired", organizationId: link.organizationId };
  }
  await db.clientPortalLink.update({
    where: { id: link.id },
    data: { lastAccessAt: new Date(), accessCount: { increment: 1 } },
  });
  return { status: "ok", linkId: link.id, siteId: link.siteId, organizationId: link.organizationId };
}

/** Everything the client may see. Only reachable with a valid link (ClientActor). */
export async function portalData(actor: ClientActor) {
  const resource = { organizationId: actor.organizationId, siteId: actor.siteId };
  assertCan(actor, "portal.view", resource);
  const site = await db.site.findFirstOrThrow({
    where: { id: actor.siteId, organizationId: actor.organizationId },
    include: {
      organization: { select: { name: true, phone: true, email: true, timezone: true, logoKey: true } },
      client: { select: { name: true } },
      steps: { where: { visibleToClient: true }, orderBy: { order: "asc" } },
    },
  });
  const day = today(site.organization.timezone);
  const [photos, summaries, documents, upcoming] = await Promise.all([
    can(actor, "media.view", resource)
      ? db.media.findMany({
          where: {
            siteId: site.id,
            organizationId: actor.organizationId,
            kind: "PHOTO",
            validationStatus: "APPROVED",
            processingStatus: "DONE",
            OR: [{ displayKey: { not: null } }, { editedKey: { not: null } }],
          },
          include: { step: { select: { title: true, visibleToClient: true } } },
          orderBy: [{ capturedAt: { sort: "desc", nulls: "last" } }, { receivedAt: "desc" }],
          take: 200,
        })
      : [],
    can(actor, "summary.view", resource)
      ? db.dailySummary.findMany({
          where: {
            siteId: site.id,
            organizationId: actor.organizationId,
            status: { in: ["APPROVED", "SENT"] },
          },
          orderBy: { date: "desc" },
          take: 60,
        })
      : [],
    db.document.findMany({
      where: { siteId: site.id, organizationId: actor.organizationId, visibleToClient: true },
      orderBy: { createdAt: "desc" },
    }),
    can(actor, "planning.view", resource)
      ? db.assignment.findMany({
          where: { siteId: site.id, organizationId: actor.organizationId, date: { gte: day } },
          include: { user: { select: { name: true } } },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
          take: 30,
        })
      : [],
  ]);

  // Upcoming interventions grouped by day (first names only).
  const byDay = new Map<
    string,
    { date: Date; slots: Set<string>; people: Set<string>; startTime: string | null }
  >();
  for (const a of upcoming) {
    const key = a.date.toISOString().slice(0, 10);
    const entry = byDay.get(key) ?? {
      date: a.date,
      slots: new Set(),
      people: new Set(),
      startTime: a.startTime,
    };
    entry.slots.add(a.slot);
    entry.people.add(a.user.name.split(" ")[0]!);
    if (a.startTime && (!entry.startTime || a.startTime < entry.startTime)) entry.startTime = a.startTime;
    byDay.set(key, entry);
  }

  const ttl = 2 * 3600;
  return {
    site: {
      title: site.title,
      address: [site.address, [site.postalCode, site.city].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", "),
      progress: site.progress,
      status: site.status,
      plannedStart: site.plannedStart,
      plannedEnd: site.plannedEnd,
      clientName: site.client.name,
    },
    organization: site.organization,
    steps: site.steps.map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      completedAt: s.completedAt,
    })),
    photos: photos.map((p) => {
      const urls = mediaUrls(p, { forClient: true, ttlSeconds: ttl });
      return {
        id: p.id,
        caption: p.caption,
        takenAt: p.capturedAt ?? p.receivedAt,
        step: p.step?.visibleToClient ? p.step.title : null,
        thumbnail: urls.thumbnail ?? urls.display,
        display: urls.display,
      };
    }),
    summaries: summaries.map((s) => ({ id: s.id, date: s.date, text: s.editedText ?? s.generatedText })),
    documents: documents.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      url: signFileUrl(d.storageKey, {
        ttlSeconds: ttl,
        disposition: "attachment",
        filename: d.originalName,
        contentType: d.mimeType,
      }),
    })),
    upcoming: [...byDay.values()].map((d) => ({
      date: d.date,
      fullDay: d.slots.has("FULL_DAY") || (d.slots.has("MORNING") && d.slots.has("AFTERNOON")),
      slot: d.slots.has("FULL_DAY") ? "FULL_DAY" : [...d.slots][0]!,
      startTime: d.startTime,
      people: [...d.people],
    })),
  };
}
