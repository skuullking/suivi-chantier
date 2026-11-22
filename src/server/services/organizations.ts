import type { Trade } from "@/generated/prisma/enums";
import { slugify } from "@/lib/slug";
import { hashPassword } from "@/server/auth/password";
import { db, type Tx } from "@/server/db";
import { DEFAULT_STEP_TEMPLATES } from "@/server/domain/step-templates";
import { AppError } from "@/server/errors";
import { audit } from "./audit";

export const TRIAL_DAYS = 14;

async function uniqueSlug(tx: Tx, name: string): Promise<string> {
  const base = slugify(name) || "entreprise";
  let slug = base;
  for (let i = 2; await tx.organization.findUnique({ where: { slug }, select: { id: true } }); i++) {
    slug = `${base}-${i}`;
  }
  return slug;
}

/** Copies the default step templates into an organization. */
export async function seedStepTemplates(tx: Tx, organizationId: string) {
  for (const template of DEFAULT_STEP_TEMPLATES) {
    await tx.stepTemplate.create({
      data: {
        organizationId,
        name: template.name,
        trade: template.trade,
        items: {
          create: template.steps.map((title, index) => ({
            title,
            order: index,
            weight: 1,
            visibleToClient: true,
          })),
        },
      },
    });
  }
}

export type SignUpInput = {
  organizationName: string;
  trade: Trade;
  name: string;
  email: string;
  phone?: string | null;
  password: string;
};

/** Creates an organization with its OWNER, default step templates and a 14-day trial. */
export async function signUp(input: SignUpInput, ip?: string | null) {
  const email = input.email.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new AppError("Un compte existe déjà avec cette adresse e-mail.", "EMAIL_TAKEN", 409);

  const passwordHash = await hashPassword(input.password);
  return db.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: input.organizationName.trim(),
        slug: await uniqueSlug(tx, input.organizationName),
        trade: input.trade,
        plan: "TEAM",
        subscriptionStatus: "TRIALING",
        trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
        email,
        phone: input.phone ?? null,
      },
    });
    const user = await tx.user.create({
      data: { email, name: input.name.trim(), phone: input.phone ?? null, passwordHash },
    });
    await tx.membership.create({ data: { userId: user.id, organizationId: organization.id, role: "OWNER" } });
    await tx.subscription.create({
      data: { organizationId: organization.id, plan: "TEAM", status: "TRIALING", provider: "none" },
    });
    await seedStepTemplates(tx, organization.id);
    await audit(
      {
        organizationId: organization.id,
        actorId: user.id,
        action: "organization.created",
        entityType: "Organization",
        entityId: organization.id,
        ip,
      },
      tx,
    );
    return { organization, user };
  });
}
