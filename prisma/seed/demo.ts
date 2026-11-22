import { storage } from "@/server/adapters/storage";
import { hashPassword } from "@/server/auth/password";
import { db } from "@/server/db";
import { seedStepTemplates } from "@/server/services/organizations";

export const DEMO_PASSWORD = "chantier-demo";
export const DEMO_SLUG = "charpentes-martin";

export const DEMO_USERS = {
  owner: { email: "patron@demo.chantierlink.fr", name: "Paul Martin", phone: "+33611223344", role: "OWNER" },
  office: {
    email: "bureau@demo.chantierlink.fr",
    name: "Sophie Martin",
    phone: "+33622334455",
    role: "OFFICE",
  },
  worker1: {
    email: "jean@demo.chantierlink.fr",
    name: "Jean Lefèvre",
    phone: "+33633445566",
    role: "WORKER",
  },
  worker2: {
    email: "lucas@demo.chantierlink.fr",
    name: "Lucas Moreau",
    phone: "+33644556677",
    role: "WORKER",
  },
} as const;

/** Removes the demo organization (and its files) if it exists. */
export async function deleteDemo() {
  const existing = await db.organization.findUnique({ where: { slug: DEMO_SLUG } });
  if (existing) {
    await storage()
      .deletePrefix(`org/${existing.id}/`)
      .catch(() => {});
    await db.organization.delete({ where: { id: existing.id } });
  }
  await db.user.deleteMany({ where: { email: { in: Object.values(DEMO_USERS).map((u) => u.email) } } });
}

export async function seedDemo() {
  await deleteDemo();
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const organization = await db.organization.create({
    data: {
      name: "Charpentes Martin",
      slug: DEMO_SLUG,
      trade: "CARPENTER",
      email: "contact@charpentes-martin.fr",
      phone: "+33561000000",
      address: "12 route de l'Atelier, 31000 Toulouse",
      plan: "TEAM",
      subscriptionStatus: "TRIALING",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
      onboardingDismissed: true,
      subscription: { create: { plan: "TEAM", status: "TRIALING", provider: "none" } },
    },
  });
  await seedStepTemplates(db, organization.id);

  const users: Record<keyof typeof DEMO_USERS, { id: string }> = {} as never;
  for (const [key, u] of Object.entries(DEMO_USERS) as [
    keyof typeof DEMO_USERS,
    (typeof DEMO_USERS)[keyof typeof DEMO_USERS],
  ][]) {
    const user = await db.user.create({
      data: { email: u.email, name: u.name, phone: u.phone, passwordHash },
    });
    await db.membership.create({ data: { userId: user.id, organizationId: organization.id, role: u.role } });
    users[key] = user;
  }

  return {
    organization: organization.name,
    comptes: Object.values(DEMO_USERS).map((u) => `${u.email} (${u.role})`),
    motDePasse: DEMO_PASSWORD,
  };
}
