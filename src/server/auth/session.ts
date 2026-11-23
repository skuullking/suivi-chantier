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

export type ResolvedSession = {
  sessionId: string;
  expiresAt: Date;
  userId: string;
  userEmail: string;
  userName: string;
  userPhone: string | null;
  role: "OWNER" | "OFFICE" | "WORKER";
  orgId: string;
  orgName: string;
  orgSlug: string;
  orgTrade: string;
  orgTimezone: string;
  orgPlan: string;
  orgSubscriptionStatus: string;
  orgTrialEndsAt: Date | null;
  orgOnboardingDismissed: boolean;
  orgOfficeCanValidatePhotos: boolean;
};

/**
 * Session + user + membership + organization in ONE round trip (runs on every authenticated request).
 * Same rules as `validateSessionToken`: expired sessions are deleted, sliding renewal near expiry.
 */
export async function resolveSession(token: string): Promise<ResolvedSession | null> {
  const id = hashToken(token);
  const rows = await db.$queryRaw<ResolvedSession[]>`
    SELECT s."id" AS "sessionId", s."expiresAt",
           u."id" AS "userId", u."email" AS "userEmail", u."name" AS "userName", u."phone" AS "userPhone",
           m."role"::text AS "role",
           o."id" AS "orgId", o."name" AS "orgName", o."slug" AS "orgSlug", o."trade"::text AS "orgTrade",
           o."timezone" AS "orgTimezone", o."plan"::text AS "orgPlan",
           o."subscriptionStatus"::text AS "orgSubscriptionStatus", o."trialEndsAt" AS "orgTrialEndsAt",
           o."onboardingDismissed" AS "orgOnboardingDismissed",
           o."officeCanValidatePhotos" AS "orgOfficeCanValidatePhotos"
    FROM "Session" s
    JOIN "User" u ON u."id" = s."userId"
    JOIN "Membership" m ON m."userId" = s."userId" AND m."organizationId" = s."organizationId"
    JOIN "Organization" o ON o."id" = s."organizationId"
    WHERE s."id" = ${id}
    LIMIT 1`;
  const row = rows[0];
  if (!row) return null;
  const now = Date.now();
  if (row.expiresAt.getTime() <= now) {
    await db.session.delete({ where: { id } }).catch(() => {});
    return null;
  }
  if (row.expiresAt.getTime() - now < RENEW_THRESHOLD_MS) {
    row.expiresAt = new Date(now + SESSION_TTL_MS);
    // Not awaited: renewal must not slow down the page.
    void db.session.update({ where: { id }, data: { expiresAt: row.expiresAt } }).catch(() => {});
  }
  return row;
}
