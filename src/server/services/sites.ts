import type { Prisma } from "@/generated/prisma/client";
import type { SiteStatus } from "@/generated/prisma/enums";
import { parseDateOnlyOrNull, today } from "@/lib/dates";
import { SITE_STATUS_LABELS } from "@/lib/labels";
import { normalizeText } from "@/lib/slug";
import { newSiteSchema, type NewSiteInput, type SiteInfoInput } from "@/lib/validation/business";
import type { ServiceContext } from "@/server/auth/context";
import { db, type Tx } from "@/server/db";
import { computeProgress, siteLateness } from "@/server/domain/progress";
import { AppError, NotFoundError, ValidationError } from "@/server/errors";
import { assertCan } from "@/server/permissions/can";
import { storage } from "@/server/adapters/storage";
import { assertMembers, loadClientFor, loadSiteFor } from "./access";
import { audit } from "./audit";
import { assertSubscriptionUsable } from "./billing";
import { createClient } from "./clients";
import { recordSiteEvent } from "./events";
import { ftsIds, sortByIds } from "./fts";
import { notifyManagers, notifyUsers } from "./notifications";

/** "Dupont" → "DUP". Letters only, 3 chars, padded with X. */
export function codePrefix(name: string): string {
  const words = normalizeText(name)
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(
      (w) => w.length > 1 && !["M", "MME", "MR", "SARL", "SAS", "SCI", "EURL", "LES", "DES"].includes(w),
    );
  const source = words.at(-1) ?? "CHA";
  return source.slice(0, 3).padEnd(3, "X");
}

async function nextSiteCode(tx: Tx, organizationId: string, clientName: string) {
  const org = await tx.organization.update({
    where: { id: organizationId },
    data: { siteCounter: { increment: 1 } },
    select: { siteCounter: true },
  });
  return `${codePrefix(clientName)}-${org.siteCounter}`;
}

/** Recomputes the weighted progress of a site from its steps. */
export async function recomputeProgress(siteId: string, tx: Tx = db): Promise<number> {
  const steps = await tx.siteStep.findMany({ where: { siteId } });
  const progress = computeProgress(steps);
  await tx.site.update({ where: { id: siteId }, data: { progress } });
  return progress;
}

export type SiteFilters = {
  q?: string;
  status?: SiteStatus | "ACTIVE" | "ALL";
  clientId?: string;
  memberId?: string;
  from?: string;
  to?: string;
};

export async function listSites(ctx: ServiceContext, filters: SiteFilters = {}) {
  assertCan(ctx.actor, "site.list", { organizationId: ctx.organizationId });
  const where: Prisma.SiteWhereInput = { organizationId: ctx.organizationId };
  if (ctx.actor.role === "WORKER") where.members = { some: { userId: ctx.userId } };
  if (!filters.status || filters.status === "ACTIVE") {
    where.status = { in: ["DRAFT", "PLANNED", "IN_PROGRESS", "PAUSED"] };
  } else if (filters.status !== "ALL") {
    where.status = filters.status;
  }
  if (filters.clientId) where.clientId = filters.clientId;
  if (filters.memberId) {
    where.AND = [{ members: { some: { userId: filters.memberId } } }];
  }
  const from = parseDateOnlyOrNull(filters.from);
  const to = parseDateOnlyOrNull(filters.to);
  // Sites whose planned period overlaps [from, to].
  if (from) where.OR = [{ plannedEnd: { gte: from } }, { plannedEnd: null }];
  if (to) where.plannedStart = { lte: to };

  const include = {
    client: { select: { id: true, name: true } },
    members: { select: { user: { select: { id: true, name: true } } } },
    steps: { select: { id: true, title: true, order: true, status: true, weight: true, plannedEnd: true } },
  } satisfies Prisma.SiteInclude;

  let rows;
  if (filters.q?.trim()) {
    const ids = await ftsIds("site", ctx.organizationId, filters.q, 200);
    rows = sortByIds(await db.site.findMany({ where: { ...where, id: { in: ids } }, include }), ids);
  } else {
    rows = await db.site.findMany({
      where,
      include,
      orderBy: [{ plannedStart: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    });
  }
  const day = today(ctx.organizationTimeZone ?? "Europe/Paris");
  return rows.map((site) => ({ ...site, lateness: siteLateness(site, site.steps, day) }));
}

/** Everything the site detail header + summary tab need. */
export async function getSite(ctx: ServiceContext, siteId: string) {
  await loadSiteFor(ctx, siteId, "site.view");
  const site = await db.site.findUniqueOrThrow({
    where: { id: siteId },
    include: {
      client: true,
      steps: { orderBy: { order: "asc" } },
      members: { include: { user: { select: { id: true, name: true, phone: true } } } },
    },
  });
  const day = today(ctx.organizationTimeZone ?? "Europe/Paris");
  return { ...site, lateness: siteLateness(site, site.steps, day) };
}

export async function siteOptions(ctx: ServiceContext, includeClosed = false) {
  assertCan(ctx.actor, "site.list", { organizationId: ctx.organizationId });
  return db.site.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(includeClosed ? {} : { status: { notIn: ["ARCHIVED"] } }),
      ...(ctx.actor.role === "WORKER" ? { members: { some: { userId: ctx.userId } } } : {}),
    },
    select: { id: true, code: true, title: true, clientId: true, status: true },
    orderBy: { title: "asc" },
  });
}

function siteInfoData(info: SiteInfoInput) {
  return {
    title: info.title,
    address: info.address,
    postalCode: info.postalCode ?? null,
    city: info.city ?? null,
    plannedStart: parseDateOnlyOrNull(info.plannedStart),
    plannedEnd: parseDateOnlyOrNull(info.plannedEnd),
    description: info.description ?? null,
    instructions: info.instructions ?? null,
  };
}

/** Wizard: client (existing or new) → info → step template + team. */
export async function createSite(ctx: ServiceContext, rawInput: NewSiteInput) {
  assertCan(ctx.actor, "site.create", { organizationId: ctx.organizationId });
  await assertSubscriptionUsable(ctx.organizationId);
  const parsed = newSiteSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (fieldErrors[issue.path.join(".")] ??= []).push(issue.message);
    throw new ValidationError(parsed.error.issues[0]?.message, fieldErrors);
  }
  const input = parsed.data;
  if (!input.clientId && !input.newClient) throw new AppError("Choisissez ou créez un client.");

  const template = input.templateId
    ? await db.stepTemplate.findFirst({
        where: { id: input.templateId, organizationId: ctx.organizationId },
        include: { items: { orderBy: { order: "asc" } } },
      })
    : null;
  if (input.templateId && !template) throw new NotFoundError("Modèle d'étapes introuvable.");
  if (input.clientId) await loadClientFor(ctx, input.clientId, "client.view");
  await assertMembers(ctx.organizationId, input.memberIds);

  return db.$transaction(async (tx) => {
    const client = input.clientId
      ? await tx.client.findUniqueOrThrow({ where: { id: input.clientId } })
      : await createClient(ctx, input.newClient!, tx);
    const code = await nextSiteCode(tx, ctx.organizationId, client.name);
    const info = siteInfoData(input.info);
    const site = await tx.site.create({
      data: {
        organizationId: ctx.organizationId,
        clientId: client.id,
        code,
        ...info,
        status: info.plannedStart ? "PLANNED" : "DRAFT",
        steps: template
          ? {
              create: template.items.map((item, i) => ({
                organizationId: ctx.organizationId,
                title: item.title,
                order: i + 1,
                weight: item.weight,
                visibleToClient: item.visibleToClient,
              })),
            }
          : undefined,
        members: {
          create: Array.from(new Set(input.memberIds)).map((userId) => ({
            organizationId: ctx.organizationId,
            userId,
          })),
        },
      },
    });
    await recordSiteEvent(
      {
        organizationId: ctx.organizationId,
        siteId: site.id,
        actorId: ctx.userId,
        type: "site.created",
        payload: { template: template?.name },
      },
      tx,
    );
    await audit(
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "site.create",
        entityType: "site",
        entityId: site.id,
        after: { title: site.title, code },
        ip: ctx.ip,
      },
      tx,
    );
    const workers = input.memberIds.filter((id) => id !== ctx.userId);
    await notifyUsers(
      workers,
      {
        organizationId: ctx.organizationId,
        type: "assignment.created",
        title: `Nouveau chantier : ${site.title}`,
        body: `Vous faites partie de l'équipe du chantier ${code}.`,
        link: `/w/chantier/${site.id}`,
      },
      tx,
    );
    return site;
  });
}

export async function updateSite(ctx: ServiceContext, siteId: string, info: SiteInfoInput) {
  await loadSiteFor(ctx, siteId, "site.update");
  return db.$transaction(async (tx) => {
    const site = await tx.site.update({ where: { id: siteId }, data: siteInfoData(info) });
    await recordSiteEvent(
      { organizationId: ctx.organizationId, siteId, actorId: ctx.userId, type: "site.updated" },
      tx,
    );
    return site;
  });
}

export async function setSiteStatus(ctx: ServiceContext, siteId: string, status: SiteStatus) {
  const { site } = await loadSiteFor(ctx, siteId, "site.update");
  if (site.status === status) return site;
  const day = today(ctx.organizationTimeZone ?? "Europe/Paris");
  return db.$transaction(async (tx) => {
    const updated = await tx.site.update({
      where: { id: siteId },
      data: {
        status,
        ...(status === "IN_PROGRESS" && !site.actualStart ? { actualStart: day } : {}),
        ...(status === "COMPLETED" ? { actualEnd: day } : {}),
      },
    });
    await recordSiteEvent(
      {
        organizationId: ctx.organizationId,
        siteId,
        actorId: ctx.userId,
        type: "site.status",
        payload: { status, label: SITE_STATUS_LABELS[status] },
      },
      tx,
    );
    await audit(
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "site.status",
        entityType: "site",
        entityId: siteId,
        before: { status: site.status },
        after: { status },
        ip: ctx.ip,
      },
      tx,
    );
    if (status === "IN_PROGRESS" || status === "COMPLETED") {
      await notifyManagers(
        {
          organizationId: ctx.organizationId,
          type: status === "IN_PROGRESS" ? "site.started" : "site.completed",
          title: `${status === "IN_PROGRESS" ? "Chantier démarré" : "Chantier terminé"} : ${site.title}`,
          link: `/app/chantiers/${siteId}`,
          excludeUserId: ctx.userId,
        },
        tx,
      );
    }
    return updated;
  });
}

export async function setSiteMembers(ctx: ServiceContext, siteId: string, userIds: string[]) {
  await loadSiteFor(ctx, siteId, "site.update");
  await assertMembers(ctx.organizationId, userIds);
  const unique = Array.from(new Set(userIds));
  await db.$transaction(async (tx) => {
    const existing = await tx.siteMember.findMany({ where: { siteId }, select: { userId: true } });
    const existingIds = new Set(existing.map((m) => m.userId));
    await tx.siteMember.deleteMany({ where: { siteId, userId: { notIn: unique } } });
    const added = unique.filter((id) => !existingIds.has(id));
    if (added.length) {
      await tx.siteMember.createMany({
        data: added.map((userId) => ({ organizationId: ctx.organizationId, siteId, userId })),
      });
    }
  });
}

/** Adds a member to the site team if needed (used when planning someone on a site). */
export async function ensureSiteMember(organizationId: string, siteId: string, userId: string, tx: Tx = db) {
  await tx.siteMember.upsert({
    where: { siteId_userId: { siteId, userId } },
    create: { organizationId, siteId, userId },
    update: {},
  });
}

/** Permanent deletion of a site and its files (strong confirmation in the UI). */
export async function deleteSite(ctx: ServiceContext, siteId: string) {
  const { site } = await loadSiteFor(ctx, siteId, "site.delete");
  const [media, documents] = await Promise.all([
    db.media.findMany({ where: { siteId }, select: { storageKey: true } }),
    db.document.findMany({ where: { siteId }, select: { id: true, storageKey: true } }),
  ]);
  await db.$transaction(async (tx) => {
    await tx.media.deleteMany({ where: { siteId } });
    await tx.document.deleteMany({ where: { siteId } });
    await tx.site.delete({ where: { id: siteId } });
    await audit(
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "site.delete",
        entityType: "site",
        entityId: siteId,
        before: { title: site.title, code: site.code },
        ip: ctx.ip,
      },
      tx,
    );
  });
  // Each media has its own folder (original, display version, thumbnail, edited copy): remove it whole.
  const mediaFolders = media.map((m) => m.storageKey.slice(0, m.storageKey.lastIndexOf("/") + 1));
  await Promise.all([
    ...mediaFolders.map((prefix) =>
      storage()
        .deletePrefix(prefix)
        .catch(() => {}),
    ),
    ...documents.map((d) =>
      storage()
        .delete(d.storageKey)
        .catch(() => {}),
    ),
  ]);
}
