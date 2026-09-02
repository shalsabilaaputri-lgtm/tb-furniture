import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import {
  AttendanceController,
  CustomersController,
  ExpensesController,
  ReceivablesController,
  ReturnsController,
  SalesController,
  StockController,
  TransfersController,
} from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [
    StockController,
    SalesController,
    CustomersController,
    ReceivablesController,
    ReturnsController,
    TransfersController,
    ExpensesController,
    AttendanceController,
  ],
  providers: [OperationsService],
  exports: [OperationsService],
})
export class OperationsModule {}
