import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ProductQueryDto {
  @IsInt() @Min(1) page = 1;
  @IsInt() @Min(1) @Max(100) limit = 30;
  @IsOptional() @IsString() @MaxLength(150) search?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() @MaxLength(100) brand?: string;
  @IsOptional() @IsIn(['true', 'false']) isActive?: 'true' | 'false';
  @IsOptional() @IsUUID() branchId?: string;
}

export class CreateProductDto {
  @IsString() @Matches(/^[A-Za-z0-9._/-]+$/) @MaxLength(80)
  sku!: string;

  @IsString() @MinLength(2) @MaxLength(200)
  name!: string;

  @IsOptional() @IsString() @MaxLength(100)
  brand?: string;

  @IsOptional() @IsString() @Matches(/^[A-Z_]+$/) @MaxLength(40)
  productType?: string;

  @IsOptional() @IsString() @MaxLength(3000)
  description?: string;

  @IsOptional() @IsUrl({ require_protocol: true }) @MaxLength(500)
  imageUrl?: string;

  @IsUUID()
  categoryId!: string;

  @IsUUID()
  baseUnitId!: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  taxPercentage?: number;

  @IsOptional() @IsString() @MaxLength(100)
  barcode?: string;
}

export class UpdateProductDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200)
  name?: string;
  @IsOptional() @IsString() @MaxLength(100)
  brand?: string;
  @IsOptional() @IsString() @Matches(/^[A-Z_]+$/) @MaxLength(40)
  productType?: string;
  @IsOptional() @IsString() @MaxLength(3000)
  description?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) @MaxLength(500)
  imageUrl?: string;
  @IsOptional() @IsUUID()
  categoryId?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  taxPercentage?: number;
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class CreateProductUnitDto {
  @IsUUID()
  unitId!: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001)
  conversionToBase!: number;
  @IsOptional() @IsBoolean()
  isDefaultSale?: boolean;
  @IsOptional() @IsString() @MaxLength(100)
  barcode?: string;
}

export class CreateBarcodeDto {
  @IsString() @MinLength(3) @MaxLength(100)
  barcode!: string;
  @IsOptional() @IsUUID()
  productUnitId?: string;
  @IsOptional() @IsString() @MaxLength(100)
  label?: string;
}

export class PriceTierDto {
  @IsUUID()
  productUnitId!: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001)
  minQuantity!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  sellPrice!: number;
  @IsOptional() @IsBoolean()
  isActive?: boolean;
  @IsOptional() @IsISO8601()
  validFrom?: string;
  @IsOptional() @IsISO8601()
  validTo?: string;
}

export class ReplacePricesDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => PriceTierDto)
  tiers!: PriceTierDto[];
}

export class SetProductCostDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  unitCost!: number;
}

export class CreateCategoryDto {
  @IsString() @Matches(/^[A-Z0-9_-]+$/) @MaxLength(40)
  code!: string;
  @IsString() @MinLength(2) @MaxLength(120)
  name!: string;
  @IsOptional() @IsUUID()
  parentId?: string;
  @IsOptional() @IsInt()
  sortOrder?: number;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120)
  name?: string;
  @IsOptional() @IsUUID()
  parentId?: string | null;
  @IsOptional() @IsInt()
  sortOrder?: number;
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class CreateUnitDto {
  @IsString() @Matches(/^[A-Z0-9_-]+$/) @MaxLength(20)
  code!: string;
  @IsString() @MinLength(1) @MaxLength(60)
  name!: string;
  @IsOptional() @IsBoolean()
  allowDecimal?: boolean;
}

export class UpdateUnitDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60)
  name?: string;
  @IsOptional() @IsBoolean()
  allowDecimal?: boolean;
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
