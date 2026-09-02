import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateUserDto, UpdateUserDto } from './users.dto';

type RequestMeta = { ipAddress?: string; userAgent?: string };
const safeUserSelect = {
  id: true,
  email: true,
  fullName: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { code: true, name: true } },
  branch: { select: { id: true, code: true, name: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(actor: AuthUser) {
    return this.prisma.user.findMany({
      where: actor.permissions.includes('branch.read_all') ? {} : { branchId: actor.branchId ?? undefined },
      select: safeUserSelect,
      orderBy: { fullName: 'asc' },
    });
  }

  async create(dto: CreateUserDto, actor: AuthUser, meta: RequestMeta) {
    this.assertRoleAssignment(actor, dto.roleCode);
    this.assertBranchScope(actor, dto.branchId);
    const email = dto.email.trim().toLowerCase();
    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          passwordHash: await argon2.hash(dto.password, { type: argon2.argon2id }),
          fullName: dto.fullName.trim(),
          role: { connect: { code: dto.roleCode } },
          ...(dto.branchId ? { branch: { connect: { id: dto.branchId } } } : {}),
        },
        select: safeUserSelect,
      });
      await this.audit.record({
        actorUserId: actor.sub,
        branchId: user.branch?.id ?? actor.branchId,
        action: 'USER_CREATED',
        entityType: 'user',
        entityId: user.id,
        newValue: { email: user.email, fullName: user.fullName, role: user.role.code, branchId: user.branch?.id },
        ...meta,
      });
      return user;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Email sudah digunakan.');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Role atau cabang tidak ditemukan.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser, meta: RequestMeta) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true, branch: true },
    });
    if (!existing) throw new NotFoundException('User tidak ditemukan.');
    this.assertBranchScope(actor, existing.branchId);
    if (dto.roleCode) this.assertRoleAssignment(actor, dto.roleCode);
    if (dto.branchId !== undefined) this.assertBranchScope(actor, dto.branchId);
    if (id === actor.sub && dto.isActive === false) {
      throw new ForbiddenException('Anda tidak dapat menonaktifkan akun sendiri.');
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() } : {}),
        ...(dto.password ? { passwordHash: await argon2.hash(dto.password, { type: argon2.argon2id }) } : {}),
        ...(dto.roleCode ? { role: { connect: { code: dto.roleCode } } } : {}),
        ...(dto.branchId !== undefined
          ? dto.branchId
            ? { branch: { connect: { id: dto.branchId } } }
            : { branch: { disconnect: true } }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: safeUserSelect,
    });
    if (dto.password || dto.isActive === false || dto.roleCode) {
      await this.prisma.userSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit.record({
      actorUserId: actor.sub,
      branchId: user.branch?.id ?? actor.branchId,
      action: 'USER_UPDATED',
      entityType: 'user',
      entityId: user.id,
      oldValue: {
        fullName: existing.fullName,
        role: existing.role.code,
        branchId: existing.branchId,
        isActive: existing.isActive,
      },
      newValue: {
        fullName: user.fullName,
        role: user.role.code,
        branchId: user.branch?.id,
        isActive: user.isActive,
        passwordChanged: Boolean(dto.password),
      },
      ...meta,
    });
    return user;
  }

  private assertRoleAssignment(actor: AuthUser, roleCode: string) {
    if (actor.role !== 'OWNER' && ['OWNER', 'ADMIN'].includes(roleCode)) {
      throw new ForbiddenException('Hanya owner yang dapat menetapkan role Owner atau Administrator.');
    }
  }

  private assertBranchScope(actor: AuthUser, branchId?: string | null) {
    if (!actor.permissions.includes('branch.read_all') && branchId !== actor.branchId) {
      throw new ForbiddenException('User hanya dapat dikelola dalam cabang Anda.');
    }
    if (!branchId && actor.role !== 'OWNER') {
      throw new ForbiddenException('User non-owner wajib terhubung ke cabang.');
    }
  }
}
