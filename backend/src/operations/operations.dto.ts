import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class BranchFilterDto {
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class StockAdjustmentDto {
  @IsUUID() branchId!: string;
  @IsUUID() warehouseId!: string;
  @IsUUID() productId!: string;
  @IsIn(['IN', 'OUT', 'ADJUST']) type!: 'IN' | 'OUT' | 'ADJUST';
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0)
  quantity!: number;
  @IsString() @MinLength(3) @MaxLength(500)
  reason!: string;
}

export class SaleItemDto {
  @IsUUID() productUnitId!: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001)
  quantity!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  unitPrice?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  lineDiscount?: number;
}

export class CreateSaleDto {
  @IsUUID() branchId!: string;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => SaleItemDto)
  items!: SaleItemDto[];
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  discountAmount?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  shippingDistanceKm?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  shippingFee?: number;
  @IsOptional() @IsBoolean()
  ownerApprovedShipping?: boolean;
  @IsIn(['CASH', 'TRANSFER', 'QRIS', 'DEBIT', 'CREDIT'])
  paymentMethod!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  paidAmount?: number;
  @IsOptional() @IsDateString()
  dueDate?: string;
  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;
}

export class CreateCustomerDto {
  @IsString() @MinLength(2) @MaxLength(150) name!: string;
  @IsOptional() @IsString() @Matches(/^\+?[0-9]{8,20}$/) whatsapp?: string;
  @IsOptional() @IsIn(['RETAIL', 'WHOLESALE', 'CONTRACTOR', 'DEVELOPER']) customerType?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) creditLimit?: number;
}

export class PayReceivableDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
  @IsIn(['CASH', 'TRANSFER', 'QRIS', 'DEBIT']) method!: string;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
}

export class ReturnItemDto {
  @IsUUID() saleItemId!: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) quantity!: number;
}

export class CreateReturnDto {
  @IsUUID() saleId!: string;
  @IsUUID() warehouseId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReturnItemDto)
  items!: ReturnItemDto[];
  @IsIn(['GOOD', 'DAMAGED']) condition!: 'GOOD' | 'DAMAGED';
  @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}

export class TransferItemDto {
  @IsUUID() productUnitId!: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) quantity!: number;
}

export class CreateTransferDto {
  @IsUUID() sourceBranchId!: string;
  @IsUUID() sourceWarehouseId!: string;
  @IsUUID() destinationBranchId!: string;
  @IsUUID() destinationWarehouseId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => TransferItemDto)
  items!: TransferItemDto[];
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class CreateExpenseDto {
  @IsUUID() branchId!: string;
  @IsString() @MinLength(2) @MaxLength(80) category!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
  @IsIn(['CASH', 'TRANSFER', 'QRIS', 'DEBIT']) paymentMethod!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}

export class CreateEmployeeDto {
  @IsUUID() branchId!: string;
  @IsString() @MinLength(2) @MaxLength(150) fullName!: string;
  @IsString() @MinLength(2) @MaxLength(80) position!: string;
  @IsOptional() @IsString() @Matches(/^\+?[0-9]{8,20}$/) phone?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) scheduledStart?: string;
}

export class AttendanceDto {
  @IsUUID() employeeId!: string;
  @IsOptional() @IsIn(['PRESENT', 'LATE', 'ABSENT', 'LEAVE', 'SICK']) status?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
