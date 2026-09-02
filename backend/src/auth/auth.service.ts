import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import type { LoginDto } from './auth.dto';

type RequestMeta = { ipAddress?: string; userAgent?: string };

const userInclude = {
  role: {
    include: { permissions: { include: { permission: true } } },
  },
  branch: { select: { id: true, code: true, name: true } },
} as const;
type UserWithAuth = Prisma.UserGetPayload<{ include: typeof userInclude }>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto, meta: RequestMeta) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email }, include: userInclude });
    if (!user || !user.isActive || !(await argon2.verify(user.passwordHash, dto.password))) {
      await this.audit.record({
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'user',
        entityId: email,
        newValue: { email },
        ...meta,
      });
      throw new UnauthorizedException('Email atau password salah.');
    }

    const result = await this.issueSession(user, meta);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.record({
      actorUserId: user.id,
      branchId: user.branchId,
      action: 'AUTH_LOGIN_SUCCESS',
      entityType: 'user_session',
      entityId: result.sessionId,
      ...meta,
    });
    return result;
  }

  async refresh(rawToken: string | undefined, meta: RequestMeta) {
    if (!rawToken) throw new UnauthorizedException('Sesi login tidak ditemukan.');
    const session = await this.prisma.userSession.findUnique({
      where: { refreshTokenHash: this.hashToken(rawToken) },
      include: { user: { include: userInclude } },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.isActive) {
      throw new UnauthorizedException('Sesi login tidak valid atau kedaluwarsa.');
    }

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });
    return this.issueSession(session.user, meta);
  }

  async logout(rawToken: string | undefined, actor: AuthUser, meta: RequestMeta) {
    if (rawToken) {
      await this.prisma.userSession.updateMany({
        where: { refreshTokenHash: this.hashToken(rawToken), userId: actor.sub, revokedAt: null },
        data: { revokedAt: new Date(), lastUsedAt: new Date() },
      });
    }
    await this.audit.record({
      actorUserId: actor.sub,
      branchId: actor.branchId,
      action: 'AUTH_LOGOUT',
      entityType: 'user',
      entityId: actor.sub,
      ...meta,
    });
    return { success: true };
  }

  async me(actor: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.sub },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        lastLoginAt: true,
        role: { select: { code: true, name: true } },
        branch: { select: { id: true, code: true, name: true } },
      },
    });
    if (!user?.isActive) throw new UnauthorizedException('Akun tidak aktif.');
    return { ...user, permissions: actor.permissions };
  }

  private async issueSession(user: UserWithAuth, meta: RequestMeta) {
    const payload: AuthUser = {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role.code,
      branchId: user.branchId,
      permissions: user.role.permissions.map(({ permission }) => permission.code),
    };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.config.getOrThrow<number>('REFRESH_TOKEN_DAYS'));
    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: this.hashToken(refreshToken),
        expiresAt,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });
    return {
      accessToken,
      refreshToken,
      expiresAt,
      sessionId: session.id,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role.code,
        branch: user.branch,
        permissions: payload.permissions,
      },
    };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
