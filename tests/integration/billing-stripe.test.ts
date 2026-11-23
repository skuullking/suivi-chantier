import type Stripe from "stripe";
import { afterAll, describe, expect, it, vi } from "vitest";
import { StripeBillingProvider } from "@/server/adapters/billing";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { mockCancel, mockSubscribe, openBillingPortal, startCheckout } from "@/server/services/billing";
import { addMember, createOrganization } from "./helpers";

// Stripe is tested offline: webhooks are signed locally and API calls are intercepted.
const SECRET = vi.hoisted(() => {
  const secret = "whsec_test_secret";
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  process.env.STRIPE_PRICE_SOLO = "price_solo";
  process.env.STRIPE_PRICE_TEAM = "price_team";
  process.env.STRIPE_PRICE_PRO = "price_pro";
  return secret;
});

afterAll(() => {
  for (const key of ["STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_SOLO", "STRIPE_PRICE_TEAM", "STRIPE_PRICE_PRO"])
    delete process.env[key];
});

function stripeProvider() {
  const provider = new StripeBillingProvider("sk_test_fake");
  const stripe = (provider as unknown as { stripe: Stripe }).stripe;
  return { provider, stripe };
}

function signed(event: Record<string, unknown>, secret = SECRET) {
  const payload = JSON.stringify({ id: "evt_1", object: "event", ...event });
  const signature = stripeProvider().stripe.webhooks.generateTestHeaderString({ payload, secret });
  return { payload, signature };
}

describe("Stripe : webhooks signés", () => {
  it("paiement terminé → abonnement activé pour la bonne organisation", () => {
    const { provider } = stripeProvider();
    const { payload, signature } = signed({
      type: "checkout.session.completed",
      data: {
        object: {
          object: "checkout.session",
          customer: "cus_1",
          subscription: "sub_1",
          client_reference_id: "org_1",
          metadata: { organizationId: "org_1", plan: "TEAM" },
        },
      },
    });
    expect(provider.parseWebhook(payload, signature)).toEqual({
      type: "subscription.activated",
      organizationId: "org_1",
      customerId: "cus_1",
      subscriptionId: "sub_1",
      plan: "TEAM",
      status: "ACTIVE",
      currentPeriodEnd: null,
    });
  });

  it("abonnement modifié → formule déduite du prix, statut et fin de période", () => {
    const { provider } = stripeProvider();
    const periodEnd = 1_800_000_000;
    const { payload, signature } = signed({
      type: "customer.subscription.updated",
      data: {
        object: {
          object: "subscription",
          id: "sub_1",
          customer: "cus_1",
          status: "past_due",
          metadata: { organizationId: "org_1", plan: "SOLO" },
          items: { data: [{ price: { id: "price_pro" }, current_period_end: periodEnd }] },
        },
      },
    });
    expect(provider.parseWebhook(payload, signature)).toMatchObject({
      type: "subscription.updated",
      plan: "PRO",
      status: "PAST_DUE",
      currentPeriodEnd: new Date(periodEnd * 1000),
    });
  });

  it("abonnement supprimé → résiliation", () => {
    const { provider } = stripeProvider();
    const { payload, signature } = signed({
      type: "customer.subscription.deleted",
      data: { object: { object: "subscription", id: "sub_1", customer: "cus_1" } },
    });
    expect(provider.parseWebhook(payload, signature)).toEqual({
      type: "subscription.canceled",
      customerId: "cus_1",
      subscriptionId: "sub_1",
    });
  });

  it("ignore les autres événements", () => {
    const { provider } = stripeProvider();
    const { payload, signature } = signed({ type: "invoice.paid", data: { object: { object: "invoice" } } });
    expect(provider.parseWebhook(payload, signature)).toBeNull();
  });

  it("refuse une signature absente, fausse ou un contenu modifié", () => {
    const { provider } = stripeProvider();
    const { payload, signature } = signed({ type: "invoice.paid", data: { object: {} } });
    expect(() => provider.parseWebhook(payload, null)).toThrow();
    expect(() => provider.parseWebhook(payload, signed({ type: "x" }, "whsec_autre").signature)).toThrow();
    expect(() =>
      provider.parseWebhook(payload.replace("invoice.paid", "checkout.session.completed"), signature),
    ).toThrow();
  });
});

describe("Stripe : paiement et portail client", () => {
  it("crée la page de paiement avec le bon prix et l'organisation en métadonnées", async () => {
    const { provider, stripe } = stripeProvider();
    const create = vi
      .spyOn(stripe.checkout.sessions, "create")
      .mockResolvedValue({ url: "https://checkout.stripe.test/s" } as never);

    await expect(
      provider.checkoutUrl({
        organizationId: "org_1",
        plan: "TEAM",
        email: "patron@test.fr",
        customerId: null,
      }),
    ).resolves.toBe("https://checkout.stripe.test/s");
    expect(create.mock.calls[0]![0]).toMatchObject({
      mode: "subscription",
      line_items: [{ price: "price_team", quantity: 1 }],
      customer_email: "patron@test.fr",
      client_reference_id: "org_1",
      metadata: { organizationId: "org_1", plan: "TEAM" },
      subscription_data: { metadata: { organizationId: "org_1", plan: "TEAM" } },
    });

    await provider.checkoutUrl({
      organizationId: "org_1",
      plan: "SOLO",
      email: "x@test.fr",
      customerId: "cus_1",
    });
    const second = create.mock.calls[1]![0]!;
    expect(second).toMatchObject({ customer: "cus_1" });
    expect(second).not.toHaveProperty("customer_email");
  });

  it("échoue clairement si Stripe ne renvoie pas d'adresse de paiement", async () => {
    const { provider, stripe } = stripeProvider();
    vi.spyOn(stripe.checkout.sessions, "create").mockResolvedValue({ url: null } as never);
    await expect(
      provider.checkoutUrl({ organizationId: "org_1", plan: "PRO", email: "x@test.fr", customerId: null }),
    ).rejects.toThrow("URL de paiement");
  });

  it("ouvre le portail seulement pour un client Stripe existant", async () => {
    const { provider, stripe } = stripeProvider();
    const create = vi
      .spyOn(stripe.billingPortal.sessions, "create")
      .mockResolvedValue({ url: "https://billing.stripe.test/p" } as never);
    await expect(provider.portalUrl({ customerId: null })).resolves.toBe("/app/parametres/abonnement");
    expect(create).not.toHaveBeenCalled();
    await expect(provider.portalUrl({ customerId: "cus_1" })).resolves.toBe("https://billing.stripe.test/p");
    expect(create.mock.calls[0]![0]).toMatchObject({ customer: "cus_1", locale: "fr" });
  });
});

describe("abonnement : actions du patron (fournisseur simulé)", () => {
  it("le patron obtient la page de paiement et le portail, le bureau non", async () => {
    const { organization, ownerCtx } = await createOrganization();
    const office = await addMember(organization.id, "OFFICE", "Bureau");
    await expect(startCheckout(ownerCtx, "TEAM")).resolves.toContain("formule=TEAM");
    await expect(openBillingPortal(ownerCtx)).resolves.toContain("/app/parametres/abonnement");
    await expect(startCheckout(office.ctx, "TEAM")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(openBillingPortal(office.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(mockCancel(office.ctx)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("la résiliation simulée passe l'abonnement en « résilié »", async () => {
    const { organization, ownerCtx } = await createOrganization();
    await mockSubscribe(ownerCtx, "SOLO");
    await mockCancel(ownerCtx);
    expect(
      (await db.organization.findUniqueOrThrow({ where: { id: organization.id } })).subscriptionStatus,
    ).toBe("CANCELED");
  });
});
