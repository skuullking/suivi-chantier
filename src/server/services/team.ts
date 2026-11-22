import type { Role } from "@/generated/prisma/enums";
import { mailProvider, renderEmail } from "@/server/adapters/mail";
import type { ServiceContext } from "@/server/auth/context";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { generateToken, hashToken } from "@/server/auth/tokens";
import { db } from "@/server/db";
import { appUrl } from "@/server/env";
import { AppError, NotFoundError } from "@/server/errors";
import { assertCan } from "@/server/permissions/can";
import { audit } from "./audit";
import { assertMemberLimit } from "./plan-limits";
import { ROLE_LABELS } from "@/lib/labels";

export const INVITATION_TTL_DAYS = 7;

export async function listTeam(ctx: ServiceContext) {
  assertCan(ctx.actor, "members.manage", { organizationId: ctx.organizationId });
  const [members, invitations] = await Promise.all([
    db.membership.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            lastLoginAt: true,
            whatsappContacts: {
              where: { organizationId: ctx.organizationId },
              select: { id: true, phoneE164: true },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.invitation.findMany({
      where: {
        organizationId: ctx.organizationId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { members, invitations };
}

export type InvitationResult = { invitationId: string; url: string };

/** Creates an invitation and e-mails the link. The raw token is only returned once (to show/copy the link). */
export async function createInvitation(
  ctx: ServiceContext,
  input: { email: string; name: string | null; role: Role },
): Promise<InvitationResult> {
  assertCan(ctx.actor, "members.manage", { organizationId: ctx.organizationId });
  const email = input.email.trim().toLowerCase();

  const alreadyMember = await db.membership.findFirst({
    where: { organizationId: ctx.organizationId, user: { email } },
    select: { id: true },
  });
  if (alreadyMember)
    throw new AppError("Cette personne fait déjà partie de l'équipe.", "ALREADY_MEMBER", 409);

  await assertMemberLimit(ctx.organizationId, 1);

  // Revoke previous pending invitations for the same e-mail.
  await db.invitation.updateMany({
    where: { organizationId: ctx.organizationId, email, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const token = generateToken();
  const invitation = await db.invitation.create({
    data: {
      organizationId: ctx.organizationId,
      email,
      name: input.name,
      role: input.role,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000),
      invitedById: ctx.userId,
    },
    include: { organization: { select: { name: true } }, invitedBy: { select: { name: true } } },
  });

  const url = appUrl(`/invitation/${token}`);
  const { html, text } = renderEmail({
    title: `Invitation à rejoindre ${invitation.organization.name}`,
    paragraphs: [
      `Bonjour${input.name ? ` ${input.name}` : ""},`,
      `${invitation.invitedBy?.name ?? "Votre entreprise"} vous invite à rejoindre ${invitation.organization.name} sur ChantierLink en tant que ${ROLE_LABELS[input.role].toLowerCase()}.`,
      `Ce lien est valable ${INVITATION_TTL_DAYS} jours.`,
    ],
    cta: { label: "Accepter l'invitation", url },
  });
  await mailProvider().send({
    to: email,
    subject: `Invitation à rejoindre ${invitation.organization.name} sur ChantierLink`,
    text,
    html,
    organizationId: ctx.organizationId,
  });

  await audit({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    action: "invitation.created",
    entityType: "Invitation",
    entityId: invitation.id,
    after: { email, role: input.role },
    ip: ctx.ip,
  });
  return { invitationId: invitation.id, url };
}

export async function revokeInvitation(ctx: ServiceContext, invitationId: string) {
  assertCan(ctx.actor, "members.manage", { organizationId: ctx.organizationId });
  const result = await db.invitation.updateMany({
    where: { id: invitationId, organizationId: ctx.organizationId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) throw new NotFoundError("Invitation introuvable.");
  await audit({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    action: "invitation.revoked",
    entityType: "Invitation",
    entityId: invitationId,
    ip: ctx.ip,
  });
}

async function ownerCount(organizationId: string) {
  return db.membership.count({ where: { organizationId, role: "OWNER" } });
}

export async function changeMemberRole(ctx: ServiceContext, membershipId: string, role: Role) {
  assertCan(ctx.actor, "members.manage", { organizationId: ctx.organizationId });
  const membership = await db.membership.findFirst({
    where: { id: membershipId, organizationId: ctx.organizationId },
  });
  if (!membership) throw new NotFoundError("Membre introuvable.");
  if (membership.role === "OWNER" && role !== "OWNER" && (await ownerCount(ctx.organizationId)) <= 1) {
    throw new AppError("L'entreprise doit garder au moins un patron.", "LAST_OWNER");
  }
  await db.membership.update({ where: { id: membership.id }, data: { role } });
  await audit({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    action: "member.role_changed",
    entityType: "Membership",
    entityId: membership.id,
    before: { role: membership.role },
    after: { role },
    ip: ctx.ip,
  });
}

export async function removeMember(ctx: ServiceContext, membershipId: string) {
  assertCan(ctx.actor, "members.manage", { organizationId: ctx.organizationId });
  const membership = await db.membership.findFirst({
    where: { id: membershipId, organizationId: ctx.organizationId },
  });
  if (!membership) throw new NotFoundError("Membre introuvable.");
  if (membership.userId === ctx.userId) throw new AppError("Vous ne pouvez pas vous retirer vous-même.");
  if (membership.role === "OWNER" && (await ownerCount(ctx.organizationId)) <= 1) {
    throw new AppError("L'entreprise doit garder au moins un patron.", "LAST_OWNER");
  }
  await db.$transaction([
    db.membership.delete({ where: { id: membership.id } }),
    db.session.deleteMany({ where: { userId: membership.userId, organizationId: ctx.organizationId } }),
    db.whatsAppContact.deleteMany({
      where: { userId: membership.userId, organizationId: ctx.organizationId },
    }),
  ]);
  await audit({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    action: "member.removed",
    entityType: "Membership",
    entityId: membership.id,
    before: { userId: membership.userId, role: membership.role },
    ip: ctx.ip,
  });
}

/** Public: looks up a pending invitation by its raw token. */
export async function findPendingInvitation(token: string) {
  const invitation = await db.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { organization: { select: { id: true, name: true } } },
  });
  if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date())
    return null;
  const existingUser = await db.user.findUnique({ where: { email: invitation.email }, select: { id: true } });
  return { invitation, existingUser: Boolean(existingUser) };
}

/**
 * Accepts an invitation. New users choose their password; existing users (already registered in another
 * organization) confirm with their current password.
 */
export async function acceptInvitation(input: {
  token: string;
  name: string;
  phone: string | null;
  password: string;
  ip?: string | null;
}) {
  const found = await findPendingInvitation(input.token);
  if (!found) throw new AppError("Cette invitation n'est plus valable.", "INVITATION_INVALID", 410);
  const { invitation } = found;

  let user = await db.user.findUnique({ where: { email: invitation.email } });
  if (user) {
    if (!(await verifyPassword(user.passwordHash, input.password))) {
      throw new AppError("Mot de passe incorrect pour ce compte existant.", "BAD_PASSWORD", 401);
    }
  }
  await assertMemberLimit(invitation.organizationId, 1);

  const passwordHash = user ? null : await hashPassword(input.password);
  const result = await db.$transaction(async (tx) => {
    if (!user) {
      user = await tx.user.create({
        data: { email: invitation.email, name: input.name, phone: input.phone, passwordHash: passwordHash! },
      });
    }
    await tx.membership.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId: invitation.organizationId } },
      create: { userId: user.id, organizationId: invitation.organizationId, role: invitation.role },
      update: { role: invitation.role },
    });
    await tx.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
    await audit(
      {
        organizationId: invitation.organizationId,
        actorId: user.id,
        action: "invitation.accepted",
        entityType: "Invitation",
        entityId: invitation.id,
        ip: input.ip,
      },
      tx,
    );
    return { user, organizationId: invitation.organizationId, role: invitation.role };
  });
  return result;
}

/** Links (or unlinks with null) the WhatsApp number of a member. Numbers are unique across the platform. */
export async function setMemberWhatsApp(ctx: ServiceContext, membershipId: string, phone: string | null) {
  assertCan(ctx.actor, "members.manage", { organizationId: ctx.organizationId });
  const membership = await db.membership.findFirst({
    where: { id: membershipId, organizationId: ctx.organizationId },
    include: { user: { select: { name: true } } },
  });
  if (!membership) throw new NotFoundError("Membre introuvable.");
  const { toE164 } = await import("@/server/domain/whatsapp-commands");
  const e164 = phone?.trim() ? toE164(phone) : null;
  if (e164 && !/^\+\d{8,15}$/.test(e164))
    throw new AppError("Numéro invalide. Exemple : 06 12 34 56 78 ou +33612345678.");
  await db.$transaction(async (tx) => {
    await tx.whatsAppContact.deleteMany({
      where: { organizationId: ctx.organizationId, userId: membership.userId },
    });
    if (!e164) return;
    const taken = await tx.whatsAppContact.findUnique({ where: { phoneE164: e164 } });
    if (taken) throw new AppError("Ce numéro WhatsApp est déjà associé à un autre compte.");
    await tx.whatsAppContact.create({
      data: {
        organizationId: ctx.organizationId,
        userId: membership.userId,
        phoneE164: e164,
        label: membership.user.name,
      },
    });
  });
  await audit({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    action: "member.whatsapp",
    entityType: "membership",
    entityId: membershipId,
    after: { phone: e164 },
    ip: ctx.ip,
  });
  return e164;
}
