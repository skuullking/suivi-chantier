import { NextResponse } from "next/server";
import { safeEqual } from "@/server/auth/tokens";
import { env } from "@/server/env";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { clientIpFromHeaders } from "@/server/security/request";
import { receiveInboundMail } from "@/server/services/inbound-mail";

export const dynamic = "force-dynamic";

/**
 * Raw MIME message posted by the inbound mail provider (Postmark / Mailgun / Brevo "raw" mode, an SMTP relay
 * script…). Authenticated with a shared secret (header `X-Inbound-Secret` or `?secret=`).
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const secret = request.headers.get("x-inbound-secret") ?? url.searchParams.get("secret") ?? "";
  if (!safeEqual(secret, env().INBOUND_MAIL_SECRET)) return new Response("Forbidden", { status: 403 });
  const limit = await consumeRateLimit(`webhook:mail:${clientIpFromHeaders(request.headers)}`, 300, 60);
  if (!limit.allowed) return new Response("Too many requests", { status: 429 });
  const raw = Buffer.from(await request.arrayBuffer());
  if (raw.byteLength === 0) return new Response("Empty", { status: 400 });
  if (raw.byteLength > (env().MAX_UPLOAD_MB + 10) * 1024 * 1024)
    return new Response("Too large", { status: 413 });
  const result = await receiveInboundMail(raw);
  // Unknown recipients are accepted (200) so the provider does not retry forever.
  return NextResponse.json(result);
}
