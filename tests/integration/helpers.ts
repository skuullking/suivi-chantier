import type { Role } from "@/generated/prisma/enums";
import type { ServiceContext } from "@/server/auth/context";
import { hashPassword } from "@/server/auth/password";
import { db } from "@/server/db";
import { signUp } from "@/server/services/organizations";

let counter = 0;

export async function createOrganization(name = "Charpentes Test") {
  counter++;
  const { organization, user } = await signUp({
    organizationName: `${name} ${counter}`,
    trade: "CARPENTER",
    name: "Patron Test",
    email: `patron${counter}-${Date.now()}@test.fr`,
    password: "motdepasse-solide",
  });
  return { organization, owner: user, ownerCtx: contextFor(user.id, organization.id, "OWNER") };
}

export async function addMember(organizationId: string, role: Role, name = "Membre") {
  counter++;
  const user = await db.user.create({
    data: {
      email: `membre${counter}-${Date.now()}@test.fr`,
      name: `${name} ${counter}`,
      passwordHash: await hashPassword("motdepasse-solide"),
    },
  });
  await db.membership.create({ data: { userId: user.id, organizationId, role } });
  return { user, ctx: contextFor(user.id, organizationId, role) };
}

export function contextFor(
  userId: string,
  organizationId: string,
  role: Role,
  officeCanValidatePhotos = true,
): ServiceContext {
  return {
    userId,
    organizationId,
    ip: "127.0.0.1",
    actor: { kind: "member", userId, organizationId, role, officeCanValidatePhotos },
  };
}

/** Extracts the first link of the last dev e-mail sent to an address. */
export async function lastMailLink(to: string): Promise<string | null> {
  const mail = await db.messageLog.findFirst({
    where: { channel: "EMAIL", toAddress: to.toLowerCase() },
    orderBy: { createdAt: "desc" },
  });
  const match = mail?.body?.match(/https?:\/\/\S+/);
  return match ? match[0] : null;
}
