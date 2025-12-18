import { prisma } from "./prisma";

export interface AuditLogEntry {
  tenantId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  beforeData?: unknown;
  afterData?: unknown;
  metadata?: unknown;
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(entry: AuditLogEntry) {
  return prisma.auditLog.create({
    data: {
      tenantId: entry.tenantId,
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      beforeData: entry.beforeData ?? null,
      afterData: entry.afterData ?? null,
      metadata: entry.metadata ?? null,
    },
  });
}

/**
 * Get audit logs for a tenant with filtering
 */
export async function getAuditLogs(
  tenantId: string,
  options: {
    entityType?: string;
    entityId?: string;
    actorId?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    cursor?: string;
  } = {}
) {
  const { limit = 50, cursor, ...filters } = options;

  const where: Record<string, unknown> = { tenantId };

  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.actorId) where.actorId = filters.actorId;
  if (filters.action) where.action = filters.action;

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) {
      (where.createdAt as Record<string, Date>).gte = filters.startDate;
    }
    if (filters.endDate) {
      (where.createdAt as Record<string, Date>).lte = filters.endDate;
    }
  }

  const logs = await prisma.auditLog.findMany({
    where,
    include: {
      actor: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
  });

  let nextCursor: string | null = null;
  if (logs.length > limit) {
    logs.pop();
    nextCursor = logs[logs.length - 1]?.id || null;
  }

  return {
    logs,
    nextCursor,
    hasMore: logs.length === limit,
  };
}

/**
 * Get audit log for a specific entity
 */
export async function getEntityAuditHistory(
  tenantId: string,
  entityType: string,
  entityId: string
) {
  return prisma.auditLog.findMany({
    where: {
      tenantId,
      entityType,
      entityId,
    },
    include: {
      actor: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}
