import { Body, Controller, Get, Ip, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { AuthUser } from '../common/types/auth-user';
import {
  AttendanceDto,
  BranchFilterDto,
  CreateCustomerDto,
  CreateEmployeeDto,
  CreateExpenseDto,
  CreateReturnDto,
  CreateSaleDto,
  CreateTransferDto,
  PayReceivableDto,
  StockAdjustmentDto,
} from './operations.dto';
import { OperationsService } from './operations.service';

class IdParamDto { @IsUUID() id!: string; }
const meta = (ipAddress: string, request: Request) => ({ ipAddress, userAgent: request.headers['user-agent'] });

@Controller('stock')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StockController {
  constructor(private readonly operations: OperationsService) {}

  @Get() @RequirePermissions('stock.read')
  list(@Query() query: BranchFilterDto, @CurrentUser() actor: AuthUser) {
    return this.operations.listStock(query, actor);
  }

  @Get('movements') @RequirePermissions('stock.read')
  movements(@Query() query: BranchFilterDto, @CurrentUser() actor: AuthUser) {
    return this.operations.listMovements(query, actor);
  }

  @Post('adjustments') @RequirePermissions('stock.adjust')
  adjust(@Body() dto: StockAdjustmentDto, @CurrentUser() actor: AuthUser, @Ip() ip: string, @Req() req: Request) {
    return this.operations.adjustStock(dto, actor, meta(ip, req));
  }
}

@Controller('sales')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalesController {
  constructor(private readonly operations: OperationsService) {}

  @Get() @RequirePermissions('sales.read')
  list(@Query() query: BranchFilterDto, @CurrentUser() actor: AuthUser) {
    return this.operations.listSales(query, actor);
  }

  @Get(':id') @RequirePermissions('sales.read')
  get(@Param() params: IdParamDto, @CurrentUser() actor: AuthUser) {
    return this.operations.getSale(params.id, actor);
  }

  @Post() @RequirePermissions('sales.create')
  create(@Body() dto: CreateSaleDto, @CurrentUser() actor: AuthUser, @Ip() ip: string, @Req() req: Request) {
    return this.operations.createSale(dto, actor, meta(ip, req));
  }
}

@Controller('customers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomersController {
  constructor(private readonly operations: OperationsService) {}

  @Get() @RequirePermissions('customer.read')
  list() { return this.operations.listCustomers(); }

  @Post() @RequirePermissions('customer.manage')
  create(@Body() dto: CreateCustomerDto, @CurrentUser() actor: AuthUser, @Ip() ip: string, @Req() req: Request) {
    return this.operations.createCustomer(dto, actor, meta(ip, req));
  }
}

@Controller('receivables')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReceivablesController {
  constructor(private readonly operations: OperationsService) {}

  @Get() @RequirePermissions('receivable.read')
  list(@Query() query: BranchFilterDto, @CurrentUser() actor: AuthUser) {
    return this.operations.listReceivables(query, actor);
  }

  @Post(':id/payments') @RequirePermissions('receivable.manage')
  pay(@Param() params: IdParamDto, @Body() dto: PayReceivableDto, @CurrentUser() actor: AuthUser, @Ip() ip: string, @Req() req: Request) {
    return this.operations.payReceivable(params.id, dto, actor, meta(ip, req));
  }
}

@Controller('returns')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReturnsController {
  constructor(private readonly operations: OperationsService) {}

  @Get() @RequirePermissions('return.read')
  list(@Query() query: BranchFilterDto, @CurrentUser() actor: AuthUser) {
    return this.operations.listReturns(query, actor);
  }

  @Post() @RequirePermissions('return.create')
  create(@Body() dto: CreateReturnDto, @CurrentUser() actor: AuthUser, @Ip() ip: string, @Req() req: Request) {
    return this.operations.createReturn(dto, actor, meta(ip, req));
  }
}

@Controller('stock-transfers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TransfersController {
  constructor(private readonly operations: OperationsService) {}

  @Get() @RequirePermissions('stock.read')
  list(@Query() query: BranchFilterDto, @CurrentUser() actor: AuthUser) {
    return this.operations.listTransfers(query, actor);
  }

  @Post() @RequirePermissions('stock.transfer.request')
  create(@Body() dto: CreateTransferDto, @CurrentUser() actor: AuthUser, @Ip() ip: string, @Req() req: Request) {
    return this.operations.createTransfer(dto, actor, meta(ip, req));
  }

  @Patch(':id/approve') @RequirePermissions('stock.transfer.approve')
  approve(@Param() params: IdParamDto, @CurrentUser() actor: AuthUser, @Ip() ip: string, @Req() req: Request) {
    return this.operations.approveTransfer(params.id, actor, meta(ip, req));
  }

  @Patch(':id/dispatch') @RequirePermissions('stock.transfer.dispatch')
  dispatch(@Param() params: IdParamDto, @CurrentUser() actor: AuthUser, @Ip() ip: string, @Req() req: Request) {
    return this.operations.dispatchTransfer(params.id, actor, meta(ip, req));
  }

  @Patch(':id/receive') @RequirePermissions('stock.transfer.receive')
  receive(@Param() params: IdParamDto, @CurrentUser() actor: AuthUser, @Ip() ip: string, @Req() req: Request) {
    return this.operations.receiveTransfer(params.id, actor, meta(ip, req));
  }
}

@Controller('expenses')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExpensesController {
  constructor(private readonly operations: OperationsService) {}

  @Get() @RequirePermissions('expense.read')
  list(@Query() query: BranchFilterDto, @CurrentUser() actor: AuthUser) {
    return this.operations.listExpenses(query, actor);
  }

  @Post() @RequirePermissions('expense.manage')
  create(@Body() dto: CreateExpenseDto, @CurrentUser() actor: AuthUser, @Ip() ip: string, @Req() req: Request) {
    return this.operations.createExpense(dto, actor, meta(ip, req));
  }
}

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttendanceController {
  constructor(private readonly operations: OperationsService) {}

  @Get('employees') @RequirePermissions('attendance.read')
  employees(@Query() query: BranchFilterDto, @CurrentUser() actor: AuthUser) {
    return this.operations.listEmployees(query, actor);
  }

  @Post('employees') @RequirePermissions('attendance.manage')
  createEmployee(@Body() dto: CreateEmployeeDto, @CurrentUser() actor: AuthUser, @Ip() ip: string, @Req() req: Request) {
    return this.operations.createEmployee(dto, actor, meta(ip, req));
  }

  @Get('attendance') @RequirePermissions('attendance.read')
  attendance(@Query() query: BranchFilterDto, @CurrentUser() actor: AuthUser) {
    return this.operations.listAttendance(query, actor);
  }

  @Post('attendance/check-in') @RequirePermissions('attendance.manage')
  checkIn(@Body() dto: AttendanceDto, @CurrentUser() actor: AuthUser, @Ip() ip: string, @Req() req: Request) {
    return this.operations.checkIn(dto, actor, meta(ip, req));
  }

  @Post('attendance/check-out') @RequirePermissions('attendance.manage')
  checkOut(@Body() dto: AttendanceDto, @CurrentUser() actor: AuthUser, @Ip() ip: string, @Req() req: Request) {
    return this.operations.checkOut(dto, actor, meta(ip, req));
  }
}
