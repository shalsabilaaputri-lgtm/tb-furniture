import { Body, Controller, Get, Ip, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { AuthUser } from '../common/types/auth-user';
import { CreateBranchDto, UpdateBranchDto } from './branches.dto';
import { BranchesService } from './branches.service';

class BranchIdParam {
  @IsUUID() id!: string;
}

@Controller('branches')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  list(@CurrentUser() actor: AuthUser) {
    return this.branches.list(actor);
  }

  @Post()
  @RequirePermissions('branch.manage')
  create(
    @Body() dto: CreateBranchDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ) {
    return this.branches.create(dto, actor, { ipAddress, userAgent: request.headers['user-agent'] });
  }

  @Patch(':id')
  @RequirePermissions('branch.manage')
  update(
    @Param() params: BranchIdParam,
    @Body() dto: UpdateBranchDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ) {
    return this.branches.update(params.id, dto, actor, {
      ipAddress,
      userAgent: request.headers['user-agent'],
    });
  }
}
