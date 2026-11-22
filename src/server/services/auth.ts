import { mailProvider, renderEmail } from "@/server/adapters/mail";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { invalidateUserSessions } from "@/server/auth/session";
import { generateToken, hashToken } from "@/server/auth/tokens";
import { db } from "@/server/db";
import { appUrl } from "@/server/env";
import { AppError } from "@/server/errors";
import { audit } from "./audit";

const RESET_TTL_MS = 60 * 60 * 1000;
// Used to keep a constant response time when the e-mail does not exist.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword("constant-time-dummy-password"));

/** Verifies credentials and returns the user with their memberships, or null. */
export async function authenticate(email: string, password: string) {
  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { memberships: { orderBy: { createdAt: "asc" } } },
  });
  if (!user) {
    await verifyPassword(await getDummyHash(), password);
    return null;
  }
  if (!(await verifyPassword(user.passwordHash, password))) return null;
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return user;
}

/** Always resolves (no user enumeration). Sends a reset link when the account exists. */
export async function requestPasswordReset(email: string, ip?: string | null) {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) return;
  const token = generateToken();
  await db.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });
  const url = appUrl(`/reinitialiser/${token}`);
  const { html, text } = renderEmail({
    title: "Réinitialisation de votre mot de passe",
    paragraphs: [
      `Bonjour ${user.name},`,
      "Vous avez demandé à réinitialiser votre mot de passe ChantierLink. Ce lien est valable 1 heure.",
      "Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet e-mail.",
    ],
    cta: { label: "Choisir un nouveau mot de passe", url },
  });
  await mailProvider().send({
    to: user.email,
    subject: "Réinitialisation de votre mot de passe",
    text,
    html,
  });
  await audit({
    organizationId: null,
    actorId: user.id,
    action: "password.reset_requested",
    entityType: "User",
    entityId: user.id,
    ip,
  });
}

export async function isResetTokenValid(token: string) {
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  return Boolean(record && !record.usedAt && record.expiresAt > new Date());
}

export async function resetPassword(token: string, password: string, ip?: string | null) {
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    throw new AppError("Ce lien n'est plus valable. Refaites une demande.", "RESET_INVALID", 410);
  }
  const passwordHash = await hashPassword(password);
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
  await invalidateUserSessions(record.userId);
  await audit({
    organizationId: null,
    actorId: record.userId,
    action: "password.reset",
    entityType: "User",
    entityId: record.userId,
    ip,
  });
}
