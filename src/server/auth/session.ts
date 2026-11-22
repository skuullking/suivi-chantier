import { db } from "@/server/db";
import { generateToken, hashToken } from "./tokens";

export const SESSION_COOKIE = "cl_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

export type SessionMeta = { ip?: string | null; userAgent?: string | null };

export async function createSession(userId: string, organizationId: string, meta: SessionMeta = {}) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({
    data: {
      id: hashToken(token),
      userId,
      organizationId,
      expiresAt,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    },
  });
  return { token, expiresAt };
}

/** Returns the session if the token is valid; extends it (sliding expiration) when close to expiry. */
export async function validateSessionToken(token: string) {
  const id = hashToken(token);
  const session = await db.session.findUnique({ where: { id }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await db.session.delete({ where: { id } }).catch(() => {});
    return null;
  }
  if (session.expiresAt.getTime() - Date.now() < RENEW_THRESHOLD_MS) {
    session.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.session.update({ where: { id }, data: { expiresAt: session.expiresAt } });
  }
  return session;
}

export async function invalidateSessionToken(token: string) {
  await db.session.deleteMany({ where: { id: hashToken(token) } });
}

export async function invalidateUserSessions(userId: string) {
  await db.session.deleteMany({ where: { userId } });
}

export function sessionCookieOptions(expiresAt: Date) {
  const secure = (process.env.APP_URL ?? "").startsWith("https://");
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    expires: expiresAt,
  };
}
