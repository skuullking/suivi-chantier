/**
 * Signed, short-lived file URLs. Files are never public: `/api/files` checks the HMAC signature and expiry,
 * then streams the object from storage. Signed URLs can be embedded in the client portal (no session).
 */
import { hmac, safeEqual } from "@/server/auth/tokens";
import { env } from "@/server/env";

export type SignedFileOptions = {
  /** Seconds before expiry (default 1 hour). */
  ttlSeconds?: number;
  /** `inline` (preview) or `attachment` (download). */
  disposition?: "inline" | "attachment";
  /** File name proposed to the browser. */
  filename?: string;
  contentType?: string;
};

type Payload = { k: string; e: number; d: "inline" | "attachment"; n?: string; t?: string };

function encode(payload: Payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function signFileUrl(key: string, options: SignedFileOptions = {}): string {
  const ttl = options.ttlSeconds ?? 3600;
  // Round expiry to the minute so that URLs are stable (browser cache friendly) within a short window.
  const exp = Math.ceil((Date.now() / 1000 + ttl) / 60) * 60;
  const payload = encode({
    k: key,
    e: exp,
    d: options.disposition ?? "inline",
    n: options.filename,
    t: options.contentType,
  });
  const sig = hmac(env().APP_SECRET, `file:${payload}`);
  return `/api/files/${payload}.${sig}`;
}

export type VerifiedFile = {
  key: string;
  disposition: "inline" | "attachment";
  filename?: string;
  contentType?: string;
};

export function verifyFileToken(token: string, now = Date.now()): VerifiedFile | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, hmac(env().APP_SECRET, `file:${payload}`))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Payload;
    if (typeof data.k !== "string" || typeof data.e !== "number") return null;
    if (data.e * 1000 < now) return null;
    return {
      key: data.k,
      disposition: data.d === "attachment" ? "attachment" : "inline",
      filename: data.n,
      contentType: data.t,
    };
  } catch {
    return null;
  }
}
