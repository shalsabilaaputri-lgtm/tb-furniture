import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AuditInput = {
  actorUserId?: string | null;
  branchId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: AuditInput) {
    return this.prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        branchId: input.branchId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        oldValue: this.toJson(input.oldValue),
        newValue: this.toJson(input.newValue),
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  }

  async list(params: { page: number; limit: number; branchId?: string; action?: string }) {
    const { page, limit, branchId, action } = params;
    const where: Prisma.AuditLogWhereInput = {
      ...(branchId ? { branchId } : {}),
      ...(action ? { action: { contains: action, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { actor: { select: { id: true, fullName: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
