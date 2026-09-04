import type { Prisma, PrismaClient } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type AuditInput = {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
};

/** Appends one audit record. Pass a transaction client so the audit write commits atomically with its mutation. */
export async function recordAudit(db: DbClient, input: AuditInput): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      reason: input.reason,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
