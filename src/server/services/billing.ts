/** Subscription: plans, trial, checkout / portal, webhook events, limits (behind BILLING_ENABLED). */
import type { Plan } from "@/generated/prisma/enums";
import { billing, type BillingEvent } from "@/server/adapters/billing";
import type { ServiceContext } from "@/server/auth/context";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { logger } from "@/server/logger";
import { assertCan } from "@/server/permissions/can";
import { audit } from "./audit";
import { billingEnabled, PLANS, storageUsedBytes } from "./plan-limits";

export async function subscriptionOverview(ctx: ServiceContext) {
  assertCan(ctx.actor, "billing.manage", { organizationId: ctx.organizationId });
  const org = await db.organization.findUniqueOrThrow({
    where: { id: ctx.organizationId },
    include: { subscription: true },
  });
  const [members, pendingInvitations, storage] = await Promise.all([
    db.membership.count({ where: { organizationId: org.id } }),
    db.invitation.count({
      where: { organizationId: org.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    }),
    storageUsedBytes(org.id),
  ]);
  const trialDaysLeft =
    org.subscriptionStatus === "TRIALING" && org.trialEndsAt
      ? Math.max(0, Math.ceil((org.trialEndsAt.getTime() - Date.now()) / 86_400_000))
      : null;
  return {
    enabled: billingEnabled(),
    provider: billing().name,
    plan: PLANS[org.plan],
    status: org.subscriptionStatus,
    trialDaysLeft,
    currentPeriodEnd: org.subscription?.currentPeriodEnd ?? null,
    usage: { members, pendingInvitations, storage },
    plans: Object.values(PLANS),
  };
}

/** Blocks new sites when billing is on and the trial is over without a subscription. */
export async function assertSubscriptionUsable(organizationId: string) {
  if (!billingEnabled()) return;
  const org = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { subscriptionStatus: true, trialEndsAt: true },
  });
  const trialOver = org.subscriptionStatus === "TRIALING" && org.trialEndsAt && org.trialEndsAt < new Date();
  if (trialOver || org.subscriptionStatus === "CANCELED") {
    throw new AppError(
      "Votre période d'essai est terminée : choisissez une formule dans Paramètres › Abonnement pour continuer à créer des chantiers.",
      "SUBSCRIPTION_REQUIRED",
      402,
    );
  }
}

export async function startCheckout(ctx: ServiceContext, plan: Plan) {
  assertCan(ctx.actor, "billing.manage", { organizationId: ctx.organizationId });
  const [org, user] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, include: { subscription: true } }),
    db.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { email: true } }),
  ]);
  return billing().checkoutUrl({
    organizationId: org.id,
    plan,
    email: org.email ?? user.email,
    customerId: org.subscription?.externalCustomerId ?? null,
  });
}

export async function openBillingPortal(ctx: ServiceContext) {
  assertCan(ctx.actor, "billing.manage", { organizationId: ctx.organizationId });
  const sub = await db.subscription.findUnique({ where: { organizationId: ctx.organizationId } });
  return billing().portalUrl({
    organizationId: ctx.organizationId,
    customerId: sub?.externalCustomerId ?? null,
  });
}

async function setPlan(
  organizationId: string,
  data: {
    plan?: Plan | null;
    status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";
    provider: string;
    customerId?: string | null;
    subscriptionId?: string | null;
    currentPeriodEnd?: Date | null;
  },
) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const plan = data.plan ?? org.plan;
  await db.$transaction([
    db.organization.update({
      where: { id: organizationId },
      data: { plan, subscriptionStatus: data.status },
    }),
    db.subscription.upsert({
      where: { organizationId },
      create: {
        organizationId,
        plan,
        status: data.status,
        provider: data.provider,
        externalCustomerId: data.customerId ?? null,
        externalSubscriptionId: data.subscriptionId ?? null,
        currentPeriodEnd: data.currentPeriodEnd ?? null,
      },
      update: {
        plan,
        status: data.status,
        provider: data.provider,
        ...(data.customerId ? { externalCustomerId: data.customerId } : {}),
        ...(data.subscriptionId ? { externalSubscriptionId: data.subscriptionId } : {}),
        ...(data.currentPeriodEnd !== undefined ? { currentPeriodEnd: data.currentPeriodEnd } : {}),
      },
    }),
  ]);
  await audit({
    organizationId,
    actorId: null,
    action: "billing.change",
    entityType: "organization",
    entityId: organizationId,
    after: { plan, status: data.status },
  });
}

/** Simulated payment (BILLING_PROVIDER=mock). */
export async function mockSubscribe(ctx: ServiceContext, plan: Plan) {
  assertCan(ctx.actor, "billing.manage", { organizationId: ctx.organizationId });
  if (billing().name !== "mock") throw new AppError("Paiement simulé indisponible.");
  await setPlan(ctx.organizationId, {
    plan,
    status: "ACTIVE",
    provider: "mock",
    currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
  });
}

export async function mockCancel(ctx: ServiceContext) {
  assertCan(ctx.actor, "billing.manage", { organizationId: ctx.organizationId });
  if (billing().name !== "mock") throw new AppError("Résiliation simulée indisponible.");
  await setPlan(ctx.organizationId, { status: "CANCELED", provider: "mock" });
}

export async function applyBillingEvent(event: BillingEvent) {
  if (event.type === "subscription.canceled") {
    const sub = await db.subscription.findFirst({ where: { externalSubscriptionId: event.subscriptionId } });
    if (sub) await setPlan(sub.organizationId, { status: "CANCELED", provider: "stripe" });
    return;
  }
  let organizationId = event.organizationId;
  if (!organizationId) {
    const sub = await db.subscription.findFirst({ where: { externalCustomerId: event.customerId } });
    organizationId = sub?.organizationId ?? null;
  }
  if (!organizationId) {
    logger.warn({ customer: event.customerId }, "Événement Stripe sans organisation");
    return;
  }
  await setPlan(organizationId, {
    plan: event.plan,
    status: event.status,
    provider: "stripe",
    customerId: event.customerId,
    subscriptionId: event.subscriptionId,
    currentPeriodEnd: event.currentPeriodEnd,
  });
}
