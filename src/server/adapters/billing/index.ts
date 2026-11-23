/**
 * Billing. `mock`: a simulated checkout page activates the plan (try everything without Stripe).
 * `stripe`: Stripe Checkout (subscription) + customer portal + signed webhook.
 */
import Stripe from "stripe";
import type { Plan } from "@/generated/prisma/enums";
import { appUrl, env } from "@/server/env";

export type BillingEvent =
  | {
      type: "subscription.activated" | "subscription.updated";
      organizationId: string | null;
      customerId: string;
      subscriptionId: string;
      plan: Plan | null;
      status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";
      currentPeriodEnd: Date | null;
    }
  | { type: "subscription.canceled"; customerId: string; subscriptionId: string };

export interface BillingProvider {
  readonly name: "mock" | "stripe";
  checkoutUrl(input: {
    organizationId: string;
    plan: Plan;
    email: string;
    customerId: string | null;
  }): Promise<string>;
  portalUrl(input: { organizationId: string; customerId: string | null }): Promise<string>;
  parseWebhook(rawBody: string, signature: string | null): BillingEvent | null;
}

class MockBillingProvider implements BillingProvider {
  readonly name = "mock" as const;
  async checkoutUrl(input: { plan: Plan }) {
    return `/app/parametres/abonnement/paiement-simule?formule=${input.plan}`;
  }
  async portalUrl() {
    return "/app/parametres/abonnement?portail=simule";
  }
  parseWebhook() {
    return null;
  }
}

const PRICE_PLAN = () => {
  const e = env();
  return new Map<string, Plan>(
    (
      [
        [e.STRIPE_PRICE_SOLO, "SOLO"],
        [e.STRIPE_PRICE_TEAM, "TEAM"],
        [e.STRIPE_PRICE_PRO, "PRO"],
      ] as [string | undefined, Plan][]
    ).filter((x): x is [string, Plan] => Boolean(x[0])),
  );
};

function mapStatus(status: string): "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" {
  if (status === "trialing") return "TRIALING";
  if (status === "active") return "ACTIVE";
  if (status === "past_due" || status === "unpaid" || status === "incomplete") return "PAST_DUE";
  return "CANCELED";
}

export class StripeBillingProvider implements BillingProvider {
  readonly name = "stripe" as const;
  private readonly stripe: Stripe;
  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey);
  }

  private priceFor(plan: Plan) {
    const e = env();
    const price = { SOLO: e.STRIPE_PRICE_SOLO, TEAM: e.STRIPE_PRICE_TEAM, PRO: e.STRIPE_PRICE_PRO }[plan];
    if (!price) throw new Error(`Prix Stripe manquant pour la formule ${plan} (STRIPE_PRICE_${plan}).`);
    return price;
  }

  async checkoutUrl(input: { organizationId: string; plan: Plan; email: string; customerId: string | null }) {
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: this.priceFor(input.plan), quantity: 1 }],
      ...(input.customerId ? { customer: input.customerId } : { customer_email: input.email }),
      client_reference_id: input.organizationId,
      metadata: { organizationId: input.organizationId, plan: input.plan },
      subscription_data: { metadata: { organizationId: input.organizationId, plan: input.plan } },
      locale: "fr",
      allow_promotion_codes: true,
      success_url: appUrl("/app/parametres/abonnement?paiement=ok"),
      cancel_url: appUrl("/app/parametres/abonnement?paiement=annule"),
    });
    if (!session.url) throw new Error("Stripe n'a pas renvoyé d'URL de paiement.");
    return session.url;
  }

  async portalUrl(input: { customerId: string | null }) {
    if (!input.customerId) return "/app/parametres/abonnement";
    const session = await this.stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: appUrl("/app/parametres/abonnement"),
      locale: "fr",
    });
    return session.url;
  }

  parseWebhook(rawBody: string, signature: string | null): BillingEvent | null {
    const secret = env().STRIPE_WEBHOOK_SECRET;
    if (!secret || !signature) throw new Error("Signature Stripe manquante.");
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      return {
        type: "subscription.activated",
        organizationId: s.metadata?.organizationId ?? s.client_reference_id ?? null,
        customerId: String(s.customer ?? ""),
        subscriptionId: String(s.subscription ?? ""),
        plan: (s.metadata?.plan as Plan | undefined) ?? null,
        status: "ACTIVE",
        currentPeriodEnd: null,
      };
    }
    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
      const sub = event.data.object as Stripe.Subscription;
      const priceId = sub.items.data[0]?.price.id;
      const periodEnd = sub.items.data[0]?.current_period_end;
      return {
        type: "subscription.updated",
        organizationId: sub.metadata?.organizationId ?? null,
        customerId: String(sub.customer),
        subscriptionId: sub.id,
        plan:
          (priceId ? PRICE_PLAN().get(priceId) : undefined) ??
          (sub.metadata?.plan as Plan | undefined) ??
          null,
        status: mapStatus(sub.status),
        currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      };
    }
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      return { type: "subscription.canceled", customerId: String(sub.customer), subscriptionId: sub.id };
    }
    return null;
  }
}

let provider: BillingProvider | null = null;

export function billing(): BillingProvider {
  if (provider) return provider;
  const e = env();
  provider =
    e.BILLING_PROVIDER === "stripe" && e.STRIPE_SECRET_KEY
      ? new StripeBillingProvider(e.STRIPE_SECRET_KEY)
      : new MockBillingProvider();
  return provider;
}
