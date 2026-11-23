import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@/generated/prisma/enums";
import type { MemberActor } from "@/server/permissions/can";
import { clientIpFromHeaders } from "@/server/security/request";
import { resolveSession, SESSION_COOKIE } from "./session";

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
  const [cookieStore, h] = await Promise.all([cookies(), headers()]);
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await resolveSession(token);
  if (!s) return null;
  const role = s.role as Role;
  return {
    sessionId: s.sessionId,
    userId: s.userId,
    organizationId: s.orgId,
    role,
    ip: clientIpFromHeaders(h),
    organizationTimeZone: s.orgTimezone,
    actor: {
      kind: "member",
      userId: s.userId,
      organizationId: s.orgId,
      role,
      officeCanValidatePhotos: s.orgOfficeCanValidatePhotos,
    },
    user: { id: s.userId, email: s.userEmail, name: s.userName, phone: s.userPhone },
    organization: {
      id: s.orgId,
      name: s.orgName,
      slug: s.orgSlug,
      trade: s.orgTrade,
      timezone: s.orgTimezone,
      plan: s.orgPlan,
      subscriptionStatus: s.orgSubscriptionStatus,
      trialEndsAt: s.orgTrialEndsAt,
      onboardingDismissed: s.orgOnboardingDismissed,
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
