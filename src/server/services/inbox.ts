/** "À traiter": items received (WhatsApp, e-mail, upload) that could not be filed automatically. */
import type { DocumentType } from "@/generated/prisma/enums";
import type { ServiceContext } from "@/server/auth/context";
import { db } from "@/server/db";
import { parseWhatsAppText } from "@/server/domain/whatsapp-commands";
import { NotFoundError } from "@/server/errors";
import { assertCan } from "@/server/permissions/can";
import { assertStepOfSite, loadClientFor, loadSiteFor } from "./access";
import { recordSiteEvent } from "./events";
import { notifyPendingPhotos } from "./media";
import { executeCommand, addVoiceNote } from "./whatsapp";

export async function listInbox(ctx: ServiceContext) {
  assertCan(ctx.actor, "inbox.process", { organizationId: ctx.organizationId });
  const items = await db.inboxItem.findMany({
    where: { organizationId: ctx.organizationId, status: "OPEN" },
    include: {
      media: true,
      document: true,
      proposedSite: { select: { id: true, title: true, code: true } },
      proposedStep: { select: { id: true, title: true } },
      proposedClient: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const authorIds = Array.from(new Set(items.map((i) => i.authorId).filter((x): x is string => !!x)));
  const authors = await db.user.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, name: true },
  });
  const names = new Map(authors.map((a) => [a.id, a.name]));
  return items.map((i) => ({ ...i, authorName: i.authorId ? (names.get(i.authorId) ?? null) : null }));
}

async function loadItem(ctx: ServiceContext, itemId: string) {
  assertCan(ctx.actor, "inbox.process", { organizationId: ctx.organizationId });
  const item = await db.inboxItem.findFirst({
    where: { id: itemId, organizationId: ctx.organizationId, status: "OPEN" },
    include: { media: true, document: true },
  });
  if (!item) throw new NotFoundError("Élément déjà traité ou introuvable.");
  return item;
}

/** Context of the original author (commands are executed as if he had sent them on the right site). */
async function authorContext(ctx: ServiceContext, authorId: string | null): Promise<ServiceContext> {
  if (!authorId || authorId === ctx.userId) return ctx;
  const membership = await db.membership.findUnique({
    where: { userId_organizationId: { userId: authorId, organizationId: ctx.organizationId } },
  });
  if (!membership) return ctx;
  // The manager vouches for the attachment: the command runs with manager rights but keeps the author.
  return { ...ctx, userId: authorId, actor: { ...ctx.actor, userId: authorId } };
}

export type InboxDecision = {
  siteId?: string | null;
  stepId?: string | null;
  clientId?: string | null;
  documentType?: DocumentType | null;
};

/** "OK" (accept the proposal) or "Changer" (decision given). */
export async function resolveInboxItem(ctx: ServiceContext, itemId: string, decision: InboxDecision = {}) {
  const item = await loadItem(ctx, itemId);
  const siteId = decision.siteId !== undefined ? decision.siteId : item.proposedSiteId;
  const stepId =
    decision.stepId !== undefined
      ? decision.stepId
      : siteId === item.proposedSiteId
        ? item.proposedStepId
        : null;
  let site: { id: string; title: string; clientId: string } | null = null;
  if (siteId) {
    site = (await loadSiteFor(ctx, siteId, "site.view")).site;
    await assertStepOfSite(siteId, stepId);
  }

  if (item.kind === "MEDIA" && item.media) {
    if (!site) throw new NotFoundError("Choisissez un chantier.");
    await db.media.update({
      where: { id: item.media.id },
      data: { siteId: site.id, stepId: stepId ?? null },
    });
    await recordSiteEvent({
      organizationId: ctx.organizationId,
      siteId: site.id,
      actorId: item.authorId,
      type: "media.added",
      payload: { kind: item.media.kind },
    });
    if (item.media.kind === "VOICE") await addVoiceNote(item.media.id);
    if (item.media.kind === "PHOTO" && item.media.validationStatus === "PENDING")
      await notifyPendingPhotos(ctx.organizationId, site.title, ctx.userId);
  } else if (item.kind === "MESSAGE" && item.messageText) {
    if (!site) throw new NotFoundError("Choisissez un chantier.");
    const { command } = parseWhatsAppText(item.messageText);
    await executeCommand(await authorContext(ctx, item.authorId), site.id, command, site.title);
  } else if (item.kind === "DOCUMENT" && item.document) {
    const clientId =
      decision.clientId !== undefined ? decision.clientId : (site?.clientId ?? item.proposedClientId);
    if (clientId) await loadClientFor(ctx, clientId, "client.view");
    await db.document.update({
      where: { id: item.document.id },
      data: {
        siteId: site?.id ?? null,
        clientId: clientId ?? site?.clientId ?? null,
        type: decision.documentType ?? item.proposedDocumentType ?? item.document.type,
      },
    });
    if (site) {
      await recordSiteEvent({
        organizationId: ctx.organizationId,
        siteId: site.id,
        actorId: ctx.userId,
        type: "document.added",
        payload: { name: item.document.name },
      });
    }
  }
  await db.inboxItem.update({
    where: { id: item.id },
    data: {
      status: "RESOLVED",
      resolvedById: ctx.userId,
      resolvedAt: new Date(),
      proposedSiteId: site?.id ?? item.proposedSiteId,
    },
  });
}

export async function dismissInboxItem(ctx: ServiceContext, itemId: string) {
  const item = await loadItem(ctx, itemId);
  await db.inboxItem.update({
    where: { id: item.id },
    data: { status: "DISMISSED", resolvedById: ctx.userId, resolvedAt: new Date() },
  });
}
