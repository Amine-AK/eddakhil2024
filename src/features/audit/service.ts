import { prisma } from "@/lib/db/client";
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

export type AuditLogView = {
  id: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: string;
  reason: string | null;
  createdAt: string;
};

/** Audit logs are append-only from the application's perspective: this is the only read path, there is no update/delete. */
export async function getRecentAuditLogs(limit = 100): Promise<AuditLogView[]> {
  const rows = await prisma.auditLog.findMany({
    include: { actor: true },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 500),
  });
  return rows.map((r) => ({
    id: r.id,
    actorName: r.actor.name,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
  }));
}
