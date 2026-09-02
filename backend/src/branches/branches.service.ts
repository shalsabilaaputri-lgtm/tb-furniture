import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateBranchDto, UpdateBranchDto } from './branches.dto';

type RequestMeta = { ipAddress?: string; userAgent?: string };

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(actor: AuthUser) {
    return this.prisma.branch.findMany({
      where: actor.permissions.includes('branch.read_all') ? {} : { id: actor.branchId ?? undefined },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateBranchDto, actor: AuthUser, meta: RequestMeta) {
    try {
      const branch = await this.prisma.branch.create({
        data: {
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          address: dto.address?.trim(),
        },
      });
      await this.audit.record({
        actorUserId: actor.sub,
        branchId: branch.id,
        action: 'BRANCH_CREATED',
        entityType: 'branch',
        entityId: branch.id,
        newValue: branch,
        ...meta,
      });
      return branch;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Kode cabang sudah digunakan.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateBranchDto, actor: AuthUser, meta: RequestMeta) {
    const existing = await this.prisma.branch.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Cabang tidak ditemukan.');
    const branch = await this.prisma.branch.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.address !== undefined ? { address: dto.address.trim() } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.record({
      actorUserId: actor.sub,
      branchId: branch.id,
      action: 'BRANCH_UPDATED',
      entityType: 'branch',
      entityId: branch.id,
      oldValue: existing,
      newValue: branch,
      ...meta,
    });
    return branch;
  }
}
