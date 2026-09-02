import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../types/auth-user';

type AuthenticatedRequest = Request & { user?: AuthUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [type, token] = request.headers.authorization?.split(' ') ?? [];

    if (type === 'Bearer' && token) {
      try {
        request.user = await this.jwt.verifyAsync<AuthUser>(token);
        return true;
      } catch {
        throw new UnauthorizedException('Token akses tidak valid atau kedaluwarsa.');
      }
    }

    const proxyUser = await this.authenticateSiteProxy(request);
    if (proxyUser) {
      request.user = proxyUser;
      return true;
    }

    throw new UnauthorizedException('Token akses diperlukan.');
  }

  private async authenticateSiteProxy(request: Request): Promise<AuthUser | null> {
    const expectedSecret = this.config.get<string>('SITE_PROXY_SECRET');
    const providedSecret = this.header(request, 'x-site-secret');
    const email = this.header(request, 'x-site-user-email')?.trim().toLowerCase();
    if (!expectedSecret || !providedSecret || !email || !this.secureEqual(expectedSecret, providedSecret)) return null;

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user?.isActive) throw new UnauthorizedException('Akun website belum aktif di backend.');

    return {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role.code,
      branchId: user.branchId,
      permissions: user.role.permissions.map(({ permission }) => permission.code),
    };
  }

  private header(request: Request, name: string): string | undefined {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  }

  private secureEqual(expected: string, provided: string): boolean {
    const left = Buffer.from(expected);
    const right = Buffer.from(provided);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
