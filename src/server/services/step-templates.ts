import type { TemplateInput } from "@/lib/validation/business";
import type { ServiceContext } from "@/server/auth/context";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { assertCan } from "@/server/permissions/can";
import { audit } from "./audit";

export async function listTemplates(ctx: ServiceContext) {
  return db.stepTemplate.findMany({
    where: { organizationId: ctx.organizationId },
    include: { items: { orderBy: { order: "asc" } } },
    orderBy: { name: "asc" },
  });
}

export async function getTemplate(ctx: ServiceContext, templateId: string) {
  const template = await db.stepTemplate.findFirst({
    where: { id: templateId, organizationId: ctx.organizationId },
    include: { items: { orderBy: { order: "asc" } } },
  });
  if (!template) throw new NotFoundError("Modèle introuvable.");
  return template;
}

export async function createTemplate(ctx: ServiceContext, input: TemplateInput) {
  assertCan(ctx.actor, "organization.manage", { organizationId: ctx.organizationId });
  const template = await db.stepTemplate.create({
    data: {
      organizationId: ctx.organizationId,
      name: input.name,
      trade: input.trade,
      items: { create: input.items.map((item, i) => ({ ...item, order: i + 1 })) },
    },
  });
  await audit({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    action: "template.create",
    entityType: "stepTemplate",
    entityId: template.id,
    after: { name: template.name },
    ip: ctx.ip,
  });
  return template;
}

export async function updateTemplate(ctx: ServiceContext, templateId: string, input: TemplateInput) {
  assertCan(ctx.actor, "organization.manage", { organizationId: ctx.organizationId });
  await getTemplate(ctx, templateId);
  // Editing a template never changes existing sites: steps were copied at creation.
  return db.$transaction(async (tx) => {
    await tx.stepTemplateItem.deleteMany({ where: { templateId } });
    return tx.stepTemplate.update({
      where: { id: templateId },
      data: {
        name: input.name,
        trade: input.trade,
        items: { create: input.items.map((item, i) => ({ ...item, order: i + 1 })) },
      },
    });
  });
}

export async function deleteTemplate(ctx: ServiceContext, templateId: string) {
  assertCan(ctx.actor, "organization.manage", { organizationId: ctx.organizationId });
  const template = await getTemplate(ctx, templateId);
  await db.stepTemplate.delete({ where: { id: templateId } });
  await audit({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    action: "template.delete",
    entityType: "stepTemplate",
    entityId: templateId,
    before: { name: template.name },
    ip: ctx.ip,
  });
}
