import { Body, Controller, Get, Ip, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { AuthUser } from '../common/types/auth-user';
import { CreateUserDto, UpdateUserDto } from './users.dto';
import { UsersService } from './users.service';

class UserIdParam {
  @IsUUID() id!: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('user.manage')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@CurrentUser() actor: AuthUser) {
    return this.users.list(actor);
  }

  @Post()
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ) {
    return this.users.create(dto, actor, { ipAddress, userAgent: request.headers['user-agent'] });
  }

  @Patch(':id')
  update(
    @Param() params: UserIdParam,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ) {
    return this.users.update(params.id, dto, actor, {
      ipAddress,
      userAgent: request.headers['user-agent'],
    });
  }
}
