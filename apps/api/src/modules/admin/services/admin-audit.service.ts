// ==============================================================================
// LocalSaathi — Admin Audit Log Service (Phase 15)
// Immutable Read-Only Security Trail Ingress & Action Filtering
// ==============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/database.module';
import {
  AdminAuditLogItem,
  AdminAuditLogQuery,
} from '@localsaathi/types';
import { Prisma } from '@prisma/client';
import { ADMIN_PAGINATION_LIMITS } from '../admin.constants';

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Queries the immutable audit trail with actor, action, and date-range filters.
   * Strictly read-only; no modification or deletion mechanisms exist.
   */
  async listAuditLogs(
    query: AdminAuditLogQuery,
  ): Promise<{ data: AdminAuditLogItem[]; total: number; page: number; limit: number }> {
    const page = Math.max(query.page || ADMIN_PAGINATION_LIMITS.DEFAULT_PAGE, 1);
    const limit = Math.min(
      Math.max(query.limit || ADMIN_PAGINATION_LIMITS.DEFAULT_LIMIT, 1),
      ADMIN_PAGINATION_LIMITS.MAX_LIMIT,
    );
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};

    if (query.actorId) where.actorId = query.actorId;
    if (query.action) where.action = { contains: query.action, mode: 'insensitive' };
    if (query.entityType) where.entityType = query.entityType;

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: {
            select: {
              phone: true,
              role: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const data: AdminAuditLogItem[] = logs.map((l) => ({
      id: l.id,
      actorId: l.actorId || null,
      actorPhone: l.actor?.phone || null,
      actorRole: l.actor?.role ? String(l.actor.role) : null,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      ipAddress: l.ipAddress || null,
      userAgent: l.userAgent || null,
      metadata: (l.metadata as Record<string, unknown>) || null,
      createdAt: l.createdAt.toISOString(),
    }));

    return { data, total, page, limit };
  }
}
