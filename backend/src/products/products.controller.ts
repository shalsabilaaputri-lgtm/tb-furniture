import { Body, Controller, Get, Ip, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { AuthUser } from '../common/types/auth-user';
import {
  CreateBarcodeDto,
  CreateCategoryDto,
  CreateProductDto,
  CreateProductUnitDto,
  CreateUnitDto,
  ProductQueryDto,
  ReplacePricesDto,
  SetProductCostDto,
  UpdateCategoryDto,
  UpdateProductDto,
  UpdateUnitDto,
} from './products.dto';
import { ProductsService } from './products.service';

class IdParamDto {
  @IsUUID() id!: string;
}

class ProductBranchParamDto {
  @IsUUID() id!: string;
  @IsUUID() branchId!: string;
}

class BranchQueryDto {
  @IsOptional() @IsUUID() branchId?: string;
}

@Controller('products')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermissions('product.read')
  list(@Query() query: ProductQueryDto, @CurrentUser() actor: AuthUser) {
    return this.products.list(query, actor);
  }

  @Get(':id')
  @RequirePermissions('product.read')
  get(@Param() params: IdParamDto, @Query() query: BranchQueryDto, @CurrentUser() actor: AuthUser) {
    return this.products.get(params.id, actor, query.branchId);
  }

  @Post()
  @RequirePermissions('product.manage')
  create(
    @Body() dto: CreateProductDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ) {
    return this.products.create(dto, actor, this.meta(ipAddress, request));
  }

  @Patch(':id')
  @RequirePermissions('product.manage')
  update(
    @Param() params: IdParamDto,
    @Body() dto: UpdateProductDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ) {
    return this.products.update(params.id, dto, actor, this.meta(ipAddress, request));
  }

  @Post(':id/units')
  @RequirePermissions('product.manage')
  addUnit(
    @Param() params: IdParamDto,
    @Body() dto: CreateProductUnitDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ) {
    return this.products.addProductUnit(params.id, dto, actor, this.meta(ipAddress, request));
  }

  @Post(':id/barcodes')
  @RequirePermissions('product.manage')
  addBarcode(
    @Param() params: IdParamDto,
    @Body() dto: CreateBarcodeDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ) {
    return this.products.addBarcode(params.id, dto, actor, this.meta(ipAddress, request));
  }

  @Put(':id/prices/:branchId')
  @RequirePermissions('product.price.manage')
  replacePrices(
    @Param() params: ProductBranchParamDto,
    @Body() dto: ReplacePricesDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ) {
    return this.products.replacePrices(
      params.id,
      params.branchId,
      dto,
      actor,
      this.meta(ipAddress, request),
    );
  }

  @Put(':id/costs/:branchId')
  @RequirePermissions('product.cost.manage')
  setCost(
    @Param() params: ProductBranchParamDto,
    @Body() dto: SetProductCostDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ) {
    return this.products.setCost(params.id, params.branchId, dto, actor, this.meta(ipAddress, request));
  }

  private meta(ipAddress: string, request: Request) {
    return { ipAddress, userAgent: request.headers['user-agent'] };
  }
}

@Controller('product-categories')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductCategoriesController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermissions('product.read')
  list() {
    return this.products.listCategories();
  }

  @Post()
  @RequirePermissions('product.manage')
  create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ) {
    return this.products.createCategory(dto, actor, { ipAddress, userAgent: request.headers['user-agent'] });
  }

  @Patch(':id')
  @RequirePermissions('product.manage')
  update(
    @Param() params: IdParamDto,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ) {
    return this.products.updateCategory(params.id, dto, actor, {
      ipAddress,
      userAgent: request.headers['user-agent'],
    });
  }
}

@Controller('units')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UnitsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermissions('product.read')
  list() {
    return this.products.listUnits();
  }

  @Post()
  @RequirePermissions('product.manage')
  create(
    @Body() dto: CreateUnitDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ) {
    return this.products.createUnit(dto, actor, { ipAddress, userAgent: request.headers['user-agent'] });
  }

  @Patch(':id')
  @RequirePermissions('product.manage')
  update(
    @Param() params: IdParamDto,
    @Body() dto: UpdateUnitDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ) {
    return this.products.updateUnit(params.id, dto, actor, {
      ipAddress,
      userAgent: request.headers['user-agent'],
    });
  }
}
