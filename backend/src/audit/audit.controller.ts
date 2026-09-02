import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { AuditService } from './audit.service';

class AuditQueryDto {
  @IsInt() @Min(1) page = 1;
  @IsInt() @Min(1) @Max(100) limit = 30;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsString() action?: string;
}

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit.read')
  list(@Query() query: AuditQueryDto) {
    return this.audit.list(query);
  }
}
