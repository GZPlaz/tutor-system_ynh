/**
 * Append-only audit trail for security-relevant actions (approvals, role
 * changes, cancellations by staff...). Failures are logged but never block
 * the business action that triggered them.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';

export async function audit(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata?: unknown,
  ip?: string,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId,
        action,
        entityType,
        entityId,
        metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        ip,
      },
    });
  } catch (err) {
    logger.error({ err, action, entityType, entityId }, 'Failed to write audit log');
  }
}

export async function listAuditLogs(params: { entityType?: string; entityId?: string; limit: number; before?: Date }) {
  return prisma.auditLog.findMany({
    where: {
      entityType: params.entityType,
      entityId: params.entityId,
      createdAt: params.before ? { lt: params.before } : undefined,
    },
    include: { actor: { select: { id: true, email: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' },
    take: params.limit,
  });
}
