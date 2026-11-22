import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import type { MemberActor } from "@/server/permissions/can";
import { clientIpFromHeaders } from "@/server/security/request";
import { SESSION_COOKIE, validateSessionToken } from "./session";

/** Context passed to every service: who acts, in which organization. */
export type ServiceContext = {
  actor: MemberActor;
  userId: string;
  organizationId: string;
  ip?: string | null;
  /** IANA time zone of the organization ("today" computations). */
  organizationTimeZone?: string;
};

export type AuthContext = ServiceContext & {
  sessionId: string;
  role: Role;
  user: { id: string; email: string; name: string; phone: string | null };
  organization: {
    id: string;
    name: string;
    slug: string;
    trade: string;
    timezone: string;
    plan: string;
    subscriptionStatus: string;
    trialEndsAt: Date | null;
    onboardingDismissed: boolean;
  };
};

/** Resolves the current session (memoized per request). Returns null when not signed in. */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await validateSessionToken(token);
  if (!session) return null;

  const membership = await db.membership.findUnique({
    where: { userId_organizationId: { userId: session.userId, organizationId: session.organizationId } },
    include: { organization: true },
  });
  if (!membership) return null;

  const h = await headers();
  const org = membership.organization;
  return {
    sessionId: session.id,
    userId: session.userId,
    organizationId: org.id,
    role: membership.role,
    ip: clientIpFromHeaders(h),
    organizationTimeZone: org.timezone,
    actor: {
      kind: "member",
      userId: session.userId,
      organizationId: org.id,
      role: membership.role,
      officeCanValidatePhotos: org.officeCanValidatePhotos,
    },
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      phone: session.user.phone,
    },
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      trade: org.trade,
      timezone: org.timezone,
      plan: org.plan,
      subscriptionStatus: org.subscriptionStatus,
      trialEndsAt: org.trialEndsAt,
      onboardingDismissed: org.onboardingDismissed,
    },
  };
});

export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) {
    const h = await headers();
    const path = h.get("x-pathname");
    redirect(path ? `/connexion?suite=${encodeURIComponent(path)}` : "/connexion");
  }
  return ctx;
}

/** OWNER or OFFICE (back-office). Workers are sent to their mobile space. */
export async function requireManager(): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (ctx.role === "WORKER") redirect("/w");
  return ctx;
}

export async function requireOwner(): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (ctx.role !== "OWNER") redirect(ctx.role === "WORKER" ? "/w" : "/app");
  return ctx;
}

export function homePathForRole(role: Role) {
  return role === "WORKER" ? "/w" : "/app";
}
