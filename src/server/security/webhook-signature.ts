import { createHmac, timingSafeEqual } from "node:crypto";

/** Meta webhook signature: header `X-Hub-Signature-256: sha256=<hex HMAC of the raw body>`. */
export function signWhatsAppBody(rawBody: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
}

export function verifyWhatsAppSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(signWhatsAppBody(rawBody, secret));
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
