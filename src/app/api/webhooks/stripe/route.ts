import { NextResponse } from "next/server";
import { billing } from "@/server/adapters/billing";
import { logger } from "@/server/logger";
import { applyBillingEvent } from "@/server/services/billing";

export const dynamic = "force-dynamic";

/** Stripe webhook (signature checked with STRIPE_WEBHOOK_SECRET). */
export async function POST(request: Request) {
  if (billing().name !== "stripe") return new Response("Billing provider is not Stripe", { status: 404 });
  const raw = await request.text();
  let event;
  try {
    event = billing().parseWebhook(raw, request.headers.get("stripe-signature"));
  } catch (error) {
    logger.warn({ err: error }, "Webhook Stripe refusé");
    return new Response("Invalid signature", { status: 400 });
  }
  if (event) await applyBillingEvent(event);
  return NextResponse.json({ received: true });
}
