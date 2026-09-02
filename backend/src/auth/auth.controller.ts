import { Body, Controller, Get, Ip, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthUser } from '../common/types/auth-user';
import { LoginDto } from './auth.dto';
import { AuthService } from './auth.service';

const REFRESH_COOKIE = 'tbp_refresh';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Ip() ipAddress: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(dto, { ipAddress, userAgent: request.headers['user-agent'] });
    this.setRefreshCookie(response, result.refreshToken, result.expiresAt);
    const { refreshToken: _hidden, ...body } = result;
    return body;
  }

  @Post('refresh')
  async refresh(
    @Ip() ipAddress: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.refresh(request.cookies?.[REFRESH_COOKIE] as string | undefined, {
      ipAddress,
      userAgent: request.headers['user-agent'],
    });
    this.setRefreshCookie(response, result.refreshToken, result.expiresAt);
    const { refreshToken: _hidden, ...body } = result;
    return body;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() actor: AuthUser,
    @Ip() ipAddress: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.logout(request.cookies?.[REFRESH_COOKIE] as string | undefined, actor, {
      ipAddress,
      userAgent: request.headers['user-agent'],
    });
    response.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    return result;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() actor: AuthUser) {
    return this.auth.me(actor);
  }

  private setRefreshCookie(response: Response, token: string, expires: Date) {
    response.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth',
      expires,
    });
  }
}
