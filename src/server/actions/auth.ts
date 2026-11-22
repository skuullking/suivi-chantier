"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { formValues, type ActionState, zodFieldErrors } from "@/lib/action-state";
import {
  acceptInvitationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  safeRedirectPath,
  signInSchema,
  signUpSchema,
} from "@/lib/validation/auth";
import { homePathForRole } from "@/server/auth/context";
import {
  createSession,
  invalidateSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/server/auth/session";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { clientIpFromHeaders } from "@/server/security/request";
import { authenticate, requestPasswordReset, resetPassword } from "@/server/services/auth";
import { signUp } from "@/server/services/organizations";
import { acceptInvitation } from "@/server/services/team";
import { toActionError } from "./helpers";

async function requestMeta() {
  const h = await headers();
  return { ip: clientIpFromHeaders(h), userAgent: h.get("user-agent") };
}

async function startSession(userId: string, organizationId: string) {
  const meta = await requestMeta();
  const { token, expiresAt } = await createSession(userId, organizationId, meta);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
}

export async function signUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error), values };

  const { ip } = await requestMeta();
  const limit = await consumeRateLimit(`signup:${ip}`, 10, 3600);
  if (!limit.allowed)
    return { ok: false, error: "Trop d'inscriptions depuis cette connexion. Réessayez plus tard.", values };

  try {
    const { user, organization } = await signUp(parsed.data, ip);
    await startSession(user.id, organization.id);
  } catch (error) {
    return toActionError(error, values);
  }
  redirect("/app/bienvenue");
}

export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error), values };

  const { ip } = await requestMeta();
  const [byAccount, byIp] = await Promise.all([
    consumeRateLimit(`login:${ip}:${parsed.data.email}`, 10, 900),
    consumeRateLimit(`login-ip:${ip}`, 60, 900),
  ]);
  if (!byAccount.allowed || !byIp.allowed) {
    return { ok: false, error: "Trop de tentatives de connexion. Réessayez dans 15 minutes.", values };
  }

  let destination: string;
  try {
    const user = await authenticate(parsed.data.email, parsed.data.password);
    if (!user) return { ok: false, error: "E-mail ou mot de passe incorrect.", values };
    const membership = user.memberships[0];
    if (!membership) return { ok: false, error: "Ce compte n'est rattaché à aucune entreprise.", values };
    await startSession(user.id, membership.organizationId);
    const fallback = homePathForRole(membership.role);
    const requested = safeRedirectPath(formData.get("suite"), fallback);
    // Workers must not land in the back-office.
    destination = membership.role === "WORKER" && requested.startsWith("/app") ? fallback : requested;
  } catch (error) {
    return toActionError(error, values);
  }
  redirect(destination);
}

export async function signOutAction() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await invalidateSessionToken(token);
  cookieStore.delete(SESSION_COOKIE);
  redirect("/connexion");
}

export async function forgotPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error), values };
  const { ip } = await requestMeta();
  const limit = await consumeRateLimit(`reset:${ip}`, 10, 3600);
  if (!limit.allowed) return { ok: false, error: "Trop de demandes. Réessayez plus tard.", values };
  try {
    await requestPasswordReset(parsed.data.email, ip);
  } catch (error) {
    return toActionError(error, values);
  }
  return {
    ok: true,
    message:
      "Si un compte existe pour cette adresse, un e-mail avec un lien de réinitialisation vient d'être envoyé.",
  };
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const { ip } = await requestMeta();
  try {
    await resetPassword(parsed.data.token, parsed.data.password, ip);
  } catch (error) {
    return toActionError(error);
  }
  redirect("/connexion?reinitialise=1");
}

export async function acceptInvitationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const parsed = acceptInvitationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error), values };
  const { ip } = await requestMeta();
  const limit = await consumeRateLimit(`invite:${ip}`, 20, 900);
  if (!limit.allowed) return { ok: false, error: "Trop de tentatives. Réessayez plus tard.", values };

  let destination: string;
  try {
    const result = await acceptInvitation({ ...parsed.data, ip });
    await startSession(result.user.id, result.organizationId);
    destination = homePathForRole(result.role);
  } catch (error) {
    return toActionError(error, values);
  }
  redirect(destination);
}
