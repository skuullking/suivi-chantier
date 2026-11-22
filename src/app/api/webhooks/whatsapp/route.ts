import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { logger } from "@/server/logger";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { clientIpFromHeaders } from "@/server/security/request";
import { verifyWhatsAppSignature } from "@/server/security/webhook-signature";
import { receiveWhatsAppPayload, type WaPayload } from "@/server/services/whatsapp";

export const dynamic = "force-dynamic";

/** Meta subscription check: echoes `hub.challenge` when the verify token matches. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === env().WHATSAPP_VERIFY_TOKEN
  ) {
    return new Response(params.get("hub.challenge") ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Incoming messages: signature (X-Hub-Signature-256), rate limit, idempotent storage, async processing. */
export async function POST(request: Request) {
  const limit = await consumeRateLimit(`webhook:whatsapp:${clientIpFromHeaders(request.headers)}`, 600, 60);
  if (!limit.allowed) return new Response("Too many requests", { status: 429 });
  const raw = await request.text();
  if (raw.length > 1_000_000) return new Response("Payload too large", { status: 413 });
  if (!verifyWhatsAppSignature(raw, request.headers.get("x-hub-signature-256"), env().WHATSAPP_APP_SECRET)) {
    logger.warn("Webhook WhatsApp : signature invalide");
    return new Response("Invalid signature", { status: 401 });
  }
  let payload: WaPayload;
  try {
    payload = JSON.parse(raw) as WaPayload;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const result = await receiveWhatsAppPayload(payload);
  // Always 200 quickly so Meta does not retry (duplicates are ignored anyway).
  return NextResponse.json({ ok: true, ...result });
}
