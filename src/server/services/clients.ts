import type { Prisma } from "@/generated/prisma/client";
import type { ClientInput } from "@/lib/validation/business";
import type { ServiceContext } from "@/server/auth/context";
import { db, type Tx } from "@/server/db";
import { AppError } from "@/server/errors";
import { assertCan } from "@/server/permissions/can";
import { loadClientFor } from "./access";
import { audit } from "./audit";
import { ftsIds, sortByIds } from "./fts";

export type ClientFilters = { q?: string; tag?: string; archived?: boolean };

export async function listClients(ctx: ServiceContext, filters: ClientFilters = {}) {
  assertCan(ctx.actor, "client.view", { organizationId: ctx.organizationId });
  const where: Prisma.ClientWhereInput = {
    organizationId: ctx.organizationId,
    anonymizedAt: null,
    archivedAt: filters.archived ? { not: null } : null,
    ...(filters.tag ? { tags: { has: filters.tag } } : {}),
  };
  if (filters.q?.trim()) {
    const ids = await ftsIds("client", ctx.organizationId, filters.q, 200);
    where.id = { in: ids };
    const rows = await db.client.findMany({ where, include: clientListInclude });
    return sortByIds(rows, ids);
  }
  return db.client.findMany({ where, include: clientListInclude, orderBy: { name: "asc" } });
}

const clientListInclude = {
  _count: { select: { sites: true, documents: true } },
  sites: {
    where: { status: { in: ["PLANNED", "IN_PROGRESS", "PAUSED"] } },
    select: { id: true, title: true, status: true },
    take: 3,
  },
} satisfies Prisma.ClientInclude;

export async function listClientTags(ctx: ServiceContext): Promise<string[]> {
  const rows = await db.$queryRaw<{ tag: string }[]>`
    SELECT DISTINCT unnest("tags") AS tag FROM "Client"
    WHERE "organizationId" = ${ctx.organizationId} AND "archivedAt" IS NULL ORDER BY tag`;
  return rows.map((r) => r.tag);
}

/** Lightweight list for selects (wizard, documents…). */
export async function clientOptions(ctx: ServiceContext) {
  assertCan(ctx.actor, "client.view", { organizationId: ctx.organizationId });
  return db.client.findMany({
    where: { organizationId: ctx.organizationId, archivedAt: null, anonymizedAt: null },
    select: { id: true, name: true, companyName: true, addresses: true },
    orderBy: { name: "asc" },
  });
}

export async function getClient(ctx: ServiceContext, clientId: string) {
  await loadClientFor(ctx, clientId, "client.view");
  return db.client.findUniqueOrThrow({
    where: { id: clientId },
    include: {
      sites: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          progress: true,
          plannedStart: true,
          plannedEnd: true,
          city: true,
        },
      },
      documents: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, name: true, type: true, createdAt: true, siteId: true, amountCents: true },
      },
    },
  });
}

export async function clientHistory(ctx: ServiceContext, clientId: string) {
  await loadClientFor(ctx, clientId, "client.view");
  return db.auditLog.findMany({
    where: { organizationId: ctx.organizationId, entityType: "client", entityId: clientId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
}

function clientData(input: ClientInput) {
  return {
    type: input.type,
    name: input.name,
    companyName: input.companyName ?? null,
    emails: input.emails.map((e) => e.toLowerCase()),
    phones: input.phones,
    addresses: input.addresses,
    tags: input.tags,
    notes: input.notes ?? null,
    consentCommunications: input.consentCommunications,
  };
}

export async function createClient(ctx: ServiceContext, input: ClientInput, tx?: Tx) {
  assertCan(ctx.actor, "client.create", { organizationId: ctx.organizationId });
  const run = async (t: Tx) => {
    const client = await t.client.create({
      data: { organizationId: ctx.organizationId, ...clientData(input) },
    });
    await audit(
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "client.create",
        entityType: "client",
        entityId: client.id,
        after: { name: client.name },
        ip: ctx.ip,
      },
      t,
    );
    return client;
  };
  return tx ? run(tx) : db.$transaction(run);
}

export async function updateClient(ctx: ServiceContext, clientId: string, input: ClientInput) {
  const before = await loadClientFor(ctx, clientId, "client.update");
  if (before.anonymizedAt) throw new AppError("Ce client a été anonymisé et ne peut plus être modifié.");
  return db.$transaction(async (tx) => {
    const client = await tx.client.update({ where: { id: clientId }, data: clientData(input) });
    const changed = Object.keys(clientData(input)).filter(
      (k) =>
        JSON.stringify((before as Record<string, unknown>)[k]) !==
        JSON.stringify((client as Record<string, unknown>)[k]),
    );
    await audit(
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "client.update",
        entityType: "client",
        entityId: clientId,
        after: { fields: changed },
        ip: ctx.ip,
      },
      tx,
    );
    return client;
  });
}

export async function setClientArchived(ctx: ServiceContext, clientId: string, archived: boolean) {
  await loadClientFor(ctx, clientId, "client.update");
  await db.$transaction(async (tx) => {
    await tx.client.update({ where: { id: clientId }, data: { archivedAt: archived ? new Date() : null } });
    await audit(
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: archived ? "client.archive" : "client.unarchive",
        entityType: "client",
        entityId: clientId,
        ip: ctx.ip,
      },
      tx,
    );
  });
}
