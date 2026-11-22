import type { Plan } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";

export type PlanDefinition = {
  id: Plan;
  name: string;
  priceEurosPerMonth: number;
  maxMembers: number | null;
  maxStorageBytes: number;
  description: string;
};

const GB = 1024 * 1024 * 1024;

export const PLANS: Record<Plan, PlanDefinition> = {
  SOLO: {
    id: "SOLO",
    name: "Solo",
    priceEurosPerMonth: 29,
    maxMembers: 2,
    maxStorageBytes: 10 * GB,
    description: "Pour l'artisan seul (jusqu'à 2 comptes).",
  },
  TEAM: {
    id: "TEAM",
    name: "Équipe",
    priceEurosPerMonth: 59,
    maxMembers: 6,
    maxStorageBytes: 50 * GB,
    description: "Jusqu'à 5 employés en plus du patron.",
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    priceEurosPerMonth: 99,
    maxMembers: null,
    maxStorageBytes: 200 * GB,
    description: "Au-delà de 5 employés, membres illimités.",
  },
};

export function billingEnabled() {
  const v = process.env.BILLING_ENABLED;
  return v === "true" || v === "1";
}

/** Throws when adding `extra` members would exceed the plan (only when billing is enabled). */
export async function assertMemberLimit(organizationId: string, extra: number) {
  if (!billingEnabled()) return;
  const org = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { plan: true },
  });
  const max = PLANS[org.plan].maxMembers;
  if (max === null) return;
  const [members, pending] = await Promise.all([
    db.membership.count({ where: { organizationId } }),
    db.invitation.count({
      where: { organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    }),
  ]);
  if (members + pending + extra > max) {
    throw new AppError(
      `Votre formule ${PLANS[org.plan].name} est limitée à ${max} membres. Passez à une formule supérieure pour inviter plus de monde.`,
      "PLAN_LIMIT",
      402,
    );
  }
}

export async function storageUsedBytes(organizationId: string): Promise<number> {
  const [media, documents] = await Promise.all([
    db.media.aggregate({ where: { organizationId }, _sum: { sizeBytes: true } }),
    db.document.aggregate({ where: { organizationId }, _sum: { sizeBytes: true } }),
  ]);
  return (media._sum.sizeBytes ?? 0) + (documents._sum.sizeBytes ?? 0);
}

export async function assertStorageLimit(organizationId: string, incomingBytes: number) {
  if (!billingEnabled()) return;
  const org = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { plan: true },
  });
  const used = await storageUsedBytes(organizationId);
  if (used + incomingBytes > PLANS[org.plan].maxStorageBytes) {
    throw new AppError(
      "Espace de stockage de votre formule atteint. Passez à une formule supérieure pour continuer.",
      "STORAGE_LIMIT",
      402,
    );
  }
}
