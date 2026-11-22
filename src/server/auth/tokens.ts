import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/** Cryptographically random URL-safe token (default 32 bytes → 43 chars). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Tokens are high-entropy, so a fast hash is enough; only the hash is stored in the database. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function hmac(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function cipherKey(secret: string): Buffer {
  return createHash("sha256").update(`chantierlink-token-encryption:${secret}`).digest();
}

/** AES-256-GCM encryption of a short secret (iv.tag.ciphertext, base64url). */
export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cipherKey(secret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

/** Returns null when the value cannot be decrypted (other secret, tampering). */
export function decryptSecret(value: string, secret: string): string | null {
  try {
    const [iv, tag, data] = value.split(".").map((p) => Buffer.from(p, "base64url"));
    if (!iv || !tag || !data) return null;
    const decipher = createDecipheriv("aes-256-gcm", cipherKey(secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
