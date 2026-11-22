import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/server/db";

export type AuditEntry = {
  organizationId: string | null;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
};

function json(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Records a sensitive action in the audit log. */
export async function audit(entry: AuditEntry, tx: Tx = db) {
  await tx.auditLog.create({
    data: {
      organizationId: entry.organizationId,
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: json(entry.before),
      after: json(entry.after),
      ip: entry.ip ?? null,
    },
  });
}
