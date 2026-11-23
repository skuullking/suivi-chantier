import { describe, expect, it } from "vitest";
import { createSession, resolveSession, validateSessionToken } from "@/server/auth/session";
import { hashToken } from "@/server/auth/tokens";
import { db } from "@/server/db";
import { AppError, ForbiddenError } from "@/server/errors";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { authenticate, isResetTokenValid, requestPasswordReset, resetPassword } from "@/server/services/auth";
import { signUp } from "@/server/services/organizations";
import {
  acceptInvitation,
  changeMemberRole,
  createInvitation,
  findPendingInvitation,
  listTeam,
  removeMember,
  revokeInvitation,
} from "@/server/services/team";
import { addMember, createOrganization, lastMailLink } from "./helpers";

describe("sign-up", () => {
  it("creates the organization, its owner, a trial and the 5 default step templates", async () => {
    const { organization, user } = await signUp({
      organizationName: "Charpentes Martin",
      trade: "CARPENTER",
      name: "Paul Martin",
      email: "Paul@Martin.fr",
      password: "motdepasse-solide",
    });
    expect(organization.slug).toBe("charpentes-martin");
    expect(organization.subscriptionStatus).toBe("TRIALING");
    expect(organization.trialEndsAt!.getTime()).toBeGreaterThan(Date.now() + 13 * 24 * 3600 * 1000);
    expect(user.email).toBe("paul@martin.fr");
    expect(user.passwordHash).not.toContain("motdepasse");

    const membership = await db.membership.findFirstOrThrow({ where: { userId: user.id } });
    expect(membership.role).toBe("OWNER");
    const templates = await db.stepTemplate.findMany({
      where: { organizationId: organization.id },
      include: { items: true },
    });
    expect(templates).toHaveLength(5);
    const carpentry = templates.find((t) => t.trade === "CARPENTER")!;
    expect(carpentry.items).toHaveLength(8);
  });

  it("refuses a duplicate e-mail and generates unique slugs", async () => {
    const base = { trade: "POOL" as const, name: "A", password: "motdepasse-solide" };
    await signUp({ ...base, organizationName: "Piscines Bleues", email: "a@a.fr" });
    await expect(signUp({ ...base, organizationName: "Autre", email: "A@a.fr" })).rejects.toBeInstanceOf(
      AppError,
    );
    const { organization } = await signUp({ ...base, organizationName: "Piscines Bleues", email: "b@b.fr" });
    expect(organization.slug).toBe("piscines-bleues-2");
  });
});

describe("authentication & sessions", () => {
  it("authenticates with the right password only", async () => {
    const { owner } = await createOrganization();
    expect(await authenticate(owner.email, "motdepasse-solide")).not.toBeNull();
    expect(await authenticate(owner.email, "mauvais-mot-de-passe")).toBeNull();
    expect(await authenticate("inconnu@test.fr", "motdepasse-solide")).toBeNull();
  });

  it("stores only the hash of the session token", async () => {
    const { owner, organization } = await createOrganization();
    const { token } = await createSession(owner.id, organization.id);
    const stored = await db.session.findFirstOrThrow({ where: { userId: owner.id } });
    expect(stored.id).toBe(hashToken(token));
    expect(stored.id).not.toBe(token);
    expect((await validateSessionToken(token))?.userId).toBe(owner.id);
    expect(await validateSessionToken("faux-jeton")).toBeNull();
  });

  it("rejects expired sessions", async () => {
    const { owner, organization } = await createOrganization();
    const { token } = await createSession(owner.id, organization.id);
    await db.session.updateMany({
      where: { userId: owner.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await validateSessionToken(token)).toBeNull();
  });

  it("resolves session, user, role and organization in one query", async () => {
    const { owner, organization } = await createOrganization();
    const { token } = await createSession(owner.id, organization.id);
    const resolved = await resolveSession(token);
    expect(resolved).toMatchObject({
      userId: owner.id,
      userEmail: owner.email,
      role: "OWNER",
      orgId: organization.id,
      orgName: organization.name,
      orgTimezone: organization.timezone,
    });
    expect(typeof resolved?.orgOnboardingDismissed).toBe("boolean");
    expect(resolved?.expiresAt).toBeInstanceOf(Date);
    expect(await resolveSession("faux-jeton")).toBeNull();

    // No membership anymore → no session context.
    await db.membership.deleteMany({ where: { userId: owner.id, organizationId: organization.id } });
    expect(await resolveSession(token)).toBeNull();
  });

  it("resolveSession drops expired sessions and renews those close to expiry", async () => {
    const { owner, organization } = await createOrganization();
    const { token } = await createSession(owner.id, organization.id);
    await db.session.updateMany({
      where: { userId: owner.id },
      data: { expiresAt: new Date(Date.now() + 60_000) },
    });
    const renewed = await resolveSession(token);
    expect(renewed!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 20 * 24 * 3600 * 1000);

    // Separate session (the renewal above is not awaited and must not race with this update).
    const other = await createOrganization();
    const expired = await createSession(other.owner.id, other.organization.id);
    await db.session.updateMany({
      where: { userId: other.owner.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await resolveSession(expired.token)).toBeNull();
    expect(await db.session.count({ where: { userId: other.owner.id } })).toBe(0);
  });

  it("resets a password with a single-use token and closes sessions", async () => {
    const { owner, organization } = await createOrganization();
    await createSession(owner.id, organization.id);
    await requestPasswordReset(owner.email);
    const link = await lastMailLink(owner.email);
    expect(link).toContain("/reinitialiser/");
    const token = link!.split("/reinitialiser/")[1]!;
    expect(await isResetTokenValid(token)).toBe(true);
    await resetPassword(token, "nouveau-mot-de-passe");
    expect(await authenticate(owner.email, "nouveau-mot-de-passe")).not.toBeNull();
    expect(await db.session.count({ where: { userId: owner.id } })).toBe(0);
    await expect(resetPassword(token, "encore-un-autre")).rejects.toBeInstanceOf(AppError);
  });

  it("does not reveal whether an e-mail exists", async () => {
    await expect(requestPasswordReset("personne@nulle-part.fr")).resolves.toBeUndefined();
  });
});

describe("invitations", () => {
  it("invites a worker who sets a password and joins with the right role", async () => {
    const { organization, ownerCtx } = await createOrganization();
    const { url } = await createInvitation(ownerCtx, {
      email: "Ouvrier@Test.fr",
      name: "Jean",
      role: "WORKER",
    });
    expect(await lastMailLink("ouvrier@test.fr")).toBe(url);

    const token = url.split("/invitation/")[1]!;
    const stored = await db.invitation.findFirstOrThrow({ where: { organizationId: organization.id } });
    expect(stored.tokenHash).toBe(hashToken(token));

    const pending = await findPendingInvitation(token);
    expect(pending?.invitation.email).toBe("ouvrier@test.fr");
    expect(pending?.existingUser).toBe(false);

    const result = await acceptInvitation({
      token,
      name: "Jean Dupuis",
      phone: null,
      password: "motdepasse-ouvrier",
    });
    expect(result.role).toBe("WORKER");
    expect(await authenticate("ouvrier@test.fr", "motdepasse-ouvrier")).not.toBeNull();
    expect(await findPendingInvitation(token)).toBeNull();
  });

  it("revoked invitations can no longer be used", async () => {
    const { ownerCtx } = await createOrganization();
    const { url, invitationId } = await createInvitation(ownerCtx, {
      email: "x@test.fr",
      name: null,
      role: "OFFICE",
    });
    await revokeInvitation(ownerCtx, invitationId);
    const token = url.split("/invitation/")[1]!;
    await expect(
      acceptInvitation({ token, name: "X", phone: null, password: "motdepasse-solide" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("only owners manage the team", async () => {
    const { organization } = await createOrganization();
    const { ctx: officeCtx } = await addMember(organization.id, "OFFICE");
    const { ctx: workerCtx } = await addMember(organization.id, "WORKER");
    for (const ctx of [officeCtx, workerCtx]) {
      await expect(
        createInvitation(ctx, { email: "y@test.fr", name: null, role: "WORKER" }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listTeam(ctx)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("keeps at least one owner", async () => {
    const { organization, ownerCtx } = await createOrganization();
    const ownerMembership = await db.membership.findFirstOrThrow({
      where: { organizationId: organization.id, role: "OWNER" },
    });
    await expect(changeMemberRole(ownerCtx, ownerMembership.id, "WORKER")).rejects.toBeInstanceOf(AppError);
    const { user } = await addMember(organization.id, "WORKER");
    const workerMembership = await db.membership.findFirstOrThrow({ where: { userId: user.id } });
    await removeMember(ownerCtx, workerMembership.id);
    expect(await db.membership.count({ where: { organizationId: organization.id } })).toBe(1);
  });

  it("cannot manage members of another organization", async () => {
    const a = await createOrganization("A");
    const b = await createOrganization("B");
    const { user } = await addMember(b.organization.id, "WORKER");
    const membership = await db.membership.findFirstOrThrow({ where: { userId: user.id } });
    await expect(removeMember(a.ownerCtx, membership.id)).rejects.toThrow();
    expect(await db.membership.count({ where: { id: membership.id } })).toBe(1);
  });
});

describe("rate limiting", () => {
  it("blocks after the limit within the window", async () => {
    for (let i = 0; i < 3; i++) expect((await consumeRateLimit("test:key", 3, 60)).allowed).toBe(true);
    expect((await consumeRateLimit("test:key", 3, 60)).allowed).toBe(false);
    expect((await consumeRateLimit("test:other", 3, 60)).allowed).toBe(true);
  });
});
