/** Onboarding in 10 minutes: trade → templates → invite a worker → first site → client demo link. */
import type { Trade } from "@/generated/prisma/enums";
import { addDays, today } from "@/lib/dates";
import type { ServiceContext } from "@/server/auth/context";
import { db } from "@/server/db";
import { DEFAULT_STEP_TEMPLATES } from "@/server/domain/step-templates";
import { assertCan } from "@/server/permissions/can";
import { audit } from "./audit";
import { createPortalLink } from "./portal";
import { createSite } from "./sites";
import { setStepStatus } from "./steps";

export async function onboardingState(ctx: ServiceContext) {
  const [org, workers, invitations, clients, sites, links] = await Promise.all([
    db.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: { trade: true, onboardingDismissed: true },
    }),
    db.membership.count({ where: { organizationId: ctx.organizationId, role: "WORKER" } }),
    db.invitation.count({ where: { organizationId: ctx.organizationId, role: "WORKER" } }),
    db.client.count({ where: { organizationId: ctx.organizationId } }),
    db.site.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true, title: true },
      take: 1,
      orderBy: { createdAt: "asc" },
    }),
    db.clientPortalLink.count({ where: { organizationId: ctx.organizationId } }),
  ]);
  return {
    trade: org.trade,
    dismissed: org.onboardingDismissed,
    steps: {
      trade: true,
      worker: workers + invitations > 0,
      client: clients > 0,
      site: sites.length > 0,
      portal: links > 0,
    },
    firstSite: sites[0] ?? null,
  };
}

/** Changing the trade makes sure the matching step template exists. */
export async function chooseTrade(ctx: ServiceContext, trade: Trade) {
  assertCan(ctx.actor, "organization.manage", { organizationId: ctx.organizationId });
  await db.organization.update({ where: { id: ctx.organizationId }, data: { trade } });
  const template = DEFAULT_STEP_TEMPLATES.find((t) => t.trade === trade);
  if (template) {
    const exists = await db.stepTemplate.findFirst({ where: { organizationId: ctx.organizationId, trade } });
    if (!exists) {
      await db.stepTemplate.create({
        data: {
          organizationId: ctx.organizationId,
          name: template.name,
          trade,
          items: {
            create: template.steps.map((title, i) => ({ title, order: i, weight: 1, visibleToClient: true })),
          },
        },
      });
    }
  }
}

/**
 * Creates an example site with a fictitious client (first step done) and its client link, so the owner sees at once
 * what his clients will see.
 */
export async function createDemoSite(ctx: ServiceContext) {
  const org = await db.organization.findUniqueOrThrow({
    where: { id: ctx.organizationId },
    select: { trade: true },
  });
  const template =
    (await db.stepTemplate.findFirst({ where: { organizationId: ctx.organizationId, trade: org.trade } })) ??
    (await db.stepTemplate.findFirst({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "asc" },
    }));
  const start = today(ctx.organizationTimeZone);
  const site = await createSite(ctx, {
    newClient: {
      name: "Client exemple (fictif)",
      tags: "exemple",
      notes: "Client fictif créé pendant la prise en main. Vous pouvez le supprimer.",
    },
    info: {
      title: "Chantier d'exemple",
      address: "1 place de la Mairie",
      city: "Exempleville",
      plannedStart: start.toISOString().slice(0, 10),
      plannedEnd: addDays(start, 30).toISOString().slice(0, 10),
      description: "Chantier fictif pour découvrir ChantierLink.",
      instructions: "Exemple de consigne : code du portail 1234.",
    },
    templateId: template?.id,
    memberIds: [],
  });
  const first = await db.siteStep.findFirst({ where: { siteId: site.id }, orderBy: { order: "asc" } });
  if (first) await setStepStatus(ctx, first.id, "DONE");
  const { url } = await createPortalLink(ctx, site.id);
  await audit({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    action: "onboarding.demo",
    entityType: "site",
    entityId: site.id,
    ip: ctx.ip,
  });
  return { siteId: site.id, portalUrl: url };
}

export async function dismissOnboarding(ctx: ServiceContext) {
  assertCan(ctx.actor, "organization.manage", { organizationId: ctx.organizationId });
  await db.organization.update({ where: { id: ctx.organizationId }, data: { onboardingDismissed: true } });
}
