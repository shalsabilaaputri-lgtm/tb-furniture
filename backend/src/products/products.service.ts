import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import type {
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

type RequestMeta = { ipAddress?: string; userAgent?: string };
const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listCategories() {
    return this.prisma.productCategory.findMany({
      include: { parent: { select: { id: true, code: true, name: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(dto: CreateCategoryDto, actor: AuthUser, meta: RequestMeta) {
    try {
      const category = await this.prisma.productCategory.create({
        data: {
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          parentId: dto.parentId,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
      await this.record(actor, 'PRODUCT_CATEGORY_CREATED', 'product_category', category.id, undefined, category, meta);
      return category;
    } catch (error) {
      this.handlePrismaError(error, 'Kode kategori sudah digunakan.', 'Kategori induk tidak ditemukan.');
    }
  }

  async updateCategory(id: string, dto: UpdateCategoryDto, actor: AuthUser, meta: RequestMeta) {
    const existing = await this.prisma.productCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Kategori tidak ditemukan.');
    if (dto.parentId !== undefined) await this.assertValidCategoryParent(id, dto.parentId);
    const category = await this.prisma.productCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.record(actor, 'PRODUCT_CATEGORY_UPDATED', 'product_category', id, existing, category, meta);
    return category;
  }

  listUnits() {
    return this.prisma.unit.findMany({ orderBy: { name: 'asc' } });
  }

  async createUnit(dto: CreateUnitDto, actor: AuthUser, meta: RequestMeta) {
    try {
      const unit = await this.prisma.unit.create({
        data: {
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          allowDecimal: dto.allowDecimal ?? false,
        },
      });
      await this.record(actor, 'UNIT_CREATED', 'unit', unit.id, undefined, unit, meta);
      return unit;
    } catch (error) {
      this.handlePrismaError(error, 'Kode satuan sudah digunakan.', 'Satuan tidak ditemukan.');
    }
  }

  async updateUnit(id: string, dto: UpdateUnitDto, actor: AuthUser, meta: RequestMeta) {
    const existing = await this.prisma.unit.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Satuan tidak ditemukan.');
    const unit = await this.prisma.unit.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.allowDecimal !== undefined ? { allowDecimal: dto.allowDecimal } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.record(actor, 'UNIT_UPDATED', 'unit', id, existing, unit, meta);
    return unit;
  }

  async list(query: ProductQueryDto, actor: AuthUser) {
    const branchId = this.resolveBranch(actor, query.branchId);
    const search = query.search?.trim();
    const where: Prisma.ProductWhereInput = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.brand ? { brand: { equals: query.brand.trim(), mode: 'insensitive' } } : {}),
      ...(query.isActive ? { isActive: query.isActive === 'true' } : {}),
      ...(search
        ? {
            OR: [
              { sku: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
              { brand: { contains: search, mode: 'insensitive' } },
              { barcodes: { some: { barcode: search } } },
            ],
          }
        : {}),
    };
    const include = this.productInclude(branchId, actor.permissions.includes('product.cost.read'));
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      items,
      meta: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
    };
  }

  async get(id: string, actor: AuthUser, requestedBranchId?: string) {
    const branchId = this.resolveBranch(actor, requestedBranchId);
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: this.productInclude(branchId, actor.permissions.includes('product.cost.read')),
    });
    if (!product) throw new NotFoundException('Produk tidak ditemukan.');
    return product;
  }

  async create(dto: CreateProductDto, actor: AuthUser, meta: RequestMeta) {
    try {
      const product = await this.prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            sku: dto.sku.trim().toUpperCase(),
            name: dto.name.trim(),
            brand: dto.brand?.trim(),
            productType: dto.productType ?? 'GENERAL',
            description: dto.description?.trim(),
            imageUrl: dto.imageUrl,
            categoryId: dto.categoryId,
            baseUnitId: dto.baseUnitId,
            taxPercentage: dto.taxPercentage ?? 0,
          },
        });
        const baseProductUnit = await tx.productUnit.create({
          data: {
            productId: created.id,
            unitId: dto.baseUnitId,
            conversionToBase: 1,
            isDefaultSale: true,
          },
        });
        if (dto.barcode) {
          await tx.productBarcode.create({
            data: { productId: created.id, productUnitId: baseProductUnit.id, barcode: dto.barcode.trim() },
          });
        }
        return created;
      });
      await this.record(actor, 'PRODUCT_CREATED', 'product', product.id, undefined, product, meta);
      return this.get(product.id, actor);
    } catch (error) {
      this.handlePrismaError(error, 'SKU atau barcode sudah digunakan.', 'Kategori atau satuan tidak ditemukan.');
    }
  }

  async update(id: string, dto: UpdateProductDto, actor: AuthUser, meta: RequestMeta) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Produk tidak ditemukan.');
    try {
      const product = await this.prisma.product.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.brand !== undefined ? { brand: dto.brand.trim() } : {}),
          ...(dto.productType !== undefined ? { productType: dto.productType } : {}),
          ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
          ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
          ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
          ...(dto.taxPercentage !== undefined ? { taxPercentage: dto.taxPercentage } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
      await this.record(actor, 'PRODUCT_UPDATED', 'product', id, existing, product, meta);
      return this.get(id, actor);
    } catch (error) {
      this.handlePrismaError(error, 'Data produk bertabrakan dengan data lain.', 'Kategori tidak ditemukan.');
    }
  }

  async addProductUnit(id: string, dto: CreateProductUnitDto, actor: AuthUser, meta: RequestMeta) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Produk tidak ditemukan.');
    try {
      const productUnit = await this.prisma.$transaction(async (tx) => {
        if (dto.isDefaultSale) {
          await tx.productUnit.updateMany({ where: { productId: id }, data: { isDefaultSale: false } });
        }
        const created = await tx.productUnit.create({
          data: {
            productId: id,
            unitId: dto.unitId,
            conversionToBase: dto.conversionToBase,
            isDefaultSale: dto.isDefaultSale ?? false,
          },
          include: { unit: true },
        });
        if (dto.barcode) {
          await tx.productBarcode.create({
            data: { productId: id, productUnitId: created.id, barcode: dto.barcode.trim() },
          });
        }
        return created;
      });
      await this.record(actor, 'PRODUCT_UNIT_CREATED', 'product', id, undefined, productUnit, meta);
      return productUnit;
    } catch (error) {
      this.handlePrismaError(error, 'Satuan atau barcode sudah digunakan pada produk ini.', 'Produk atau satuan tidak ditemukan.');
    }
  }

  async addBarcode(id: string, dto: CreateBarcodeDto, actor: AuthUser, meta: RequestMeta) {
    if (dto.productUnitId) {
      const relatedUnit = await this.prisma.productUnit.findFirst({ where: { id: dto.productUnitId, productId: id } });
      if (!relatedUnit) throw new BadRequestException('Satuan jual tidak berasal dari produk ini.');
    }
    try {
      const barcode = await this.prisma.productBarcode.create({
        data: {
          productId: id,
          productUnitId: dto.productUnitId,
          barcode: dto.barcode.trim(),
          label: dto.label?.trim(),
        },
      });
      await this.record(actor, 'PRODUCT_BARCODE_CREATED', 'product', id, undefined, barcode, meta);
      return barcode;
    } catch (error) {
      this.handlePrismaError(error, 'Barcode sudah digunakan.', 'Produk tidak ditemukan.');
    }
  }

  async replacePrices(
    productId: string,
    branchId: string,
    dto: ReplacePricesDto,
    actor: AuthUser,
    meta: RequestMeta,
  ) {
    this.assertBranchScope(actor, branchId);
    if (dto.tiers.length > 100) throw new BadRequestException('Maksimal 100 tingkat harga per produk.');
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!product || !branch) throw new NotFoundException('Produk atau cabang tidak ditemukan.');
    const unitIds = [...new Set(dto.tiers.map((tier) => tier.productUnitId))];
    const validUnits = await this.prisma.productUnit.count({ where: { id: { in: unitIds }, productId } });
    if (validUnits !== unitIds.length) throw new BadRequestException('Ada satuan jual yang bukan milik produk ini.');

    const uniqueKeys = new Set(dto.tiers.map((tier) => `${tier.productUnitId}:${tier.minQuantity}`));
    if (uniqueKeys.size !== dto.tiers.length) throw new BadRequestException('Jumlah minimum pada satuan yang sama harus unik.');
    for (const tier of dto.tiers) {
      if (tier.validFrom && tier.validTo && new Date(tier.validTo) <= new Date(tier.validFrom)) {
        throw new BadRequestException('validTo harus lebih akhir dari validFrom.');
      }
    }

    const oldPrices = await this.prisma.productPrice.findMany({ where: { productId, branchId } });
    const prices = await this.prisma.$transaction(async (tx) => {
      await tx.productPrice.deleteMany({ where: { productId, branchId } });
      if (dto.tiers.length) {
        await tx.productPrice.createMany({
          data: dto.tiers.map((tier) => ({
            productId,
            branchId,
            productUnitId: tier.productUnitId,
            minQuantity: new Prisma.Decimal(tier.minQuantity),
            sellPrice: new Prisma.Decimal(tier.sellPrice),
            isActive: tier.isActive ?? true,
            validFrom: tier.validFrom ? new Date(tier.validFrom) : null,
            validTo: tier.validTo ? new Date(tier.validTo) : null,
          })),
        });
      }
      return tx.productPrice.findMany({
        where: { productId, branchId },
        include: { productUnit: { include: { unit: true } } },
        orderBy: [{ productUnitId: 'asc' }, { minQuantity: 'asc' }],
      });
    });
    await this.record(actor, 'PRODUCT_PRICES_REPLACED', 'product', productId, oldPrices, prices, meta, branchId);
    return prices;
  }

  async setCost(
    productId: string,
    branchId: string,
    dto: SetProductCostDto,
    actor: AuthUser,
    meta: RequestMeta,
  ) {
    this.assertBranchScope(actor, branchId);
    const oldCost = await this.prisma.productCost.findUnique({
      where: { branchId_productId: { branchId, productId } },
    });
    try {
      const cost = await this.prisma.productCost.upsert({
        where: { branchId_productId: { branchId, productId } },
        update: { unitCost: dto.unitCost },
        create: { branchId, productId, unitCost: dto.unitCost },
      });
      await this.record(actor, 'PRODUCT_COST_UPDATED', 'product', productId, oldCost, cost, meta, branchId);
      return cost;
    } catch (error) {
      this.handlePrismaError(error, 'Harga modal tidak dapat disimpan.', 'Produk atau cabang tidak ditemukan.');
    }
  }

  private productInclude(branchId: string | null, canSeeCost: boolean) {
    return Prisma.validator<Prisma.ProductInclude>()({
      category: true,
      baseUnit: true,
      barcodes: true,
      units: { include: { unit: true, barcodes: true }, orderBy: { isDefaultSale: 'desc' } },
      prices: {
        where: { branchId: branchId ?? EMPTY_UUID, isActive: true },
        include: { productUnit: { include: { unit: true } } },
        orderBy: [{ productUnitId: 'asc' }, { minQuantity: 'asc' }],
      },
      costs: { where: { branchId: canSeeCost && branchId ? branchId : EMPTY_UUID } },
    });
  }

  private resolveBranch(actor: AuthUser, requested?: string) {
    if (requested) this.assertBranchScope(actor, requested);
    return requested ?? actor.branchId;
  }

  private assertBranchScope(actor: AuthUser, branchId: string) {
    if (!actor.permissions.includes('branch.read_all') && actor.branchId !== branchId) {
      throw new ForbiddenException('Anda tidak memiliki akses ke harga cabang tersebut.');
    }
  }

  private async assertValidCategoryParent(categoryId: string, parentId: string | null) {
    if (!parentId) return;
    if (parentId === categoryId) throw new BadRequestException('Kategori tidak dapat menjadi induk dirinya sendiri.');
    let cursor: string | null = parentId;
    for (let depth = 0; cursor && depth < 100; depth += 1) {
      const row: { parentId: string | null } | null = await this.prisma.productCategory.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      if (!row) throw new NotFoundException('Kategori induk tidak ditemukan.');
      if (row.parentId === categoryId) throw new BadRequestException('Relasi kategori membentuk siklus.');
      cursor = row.parentId;
    }
  }

  private record(
    actor: AuthUser,
    action: string,
    entityType: string,
    entityId: string,
    oldValue: unknown,
    newValue: unknown,
    meta: RequestMeta,
    branchId: string | null = actor.branchId,
  ) {
    return this.audit.record({
      actorUserId: actor.sub,
      branchId,
      action,
      entityType,
      entityId,
      oldValue,
      newValue,
      ...meta,
    });
  }

  private handlePrismaError(error: unknown, conflictMessage: string, notFoundMessage: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') throw new ConflictException(conflictMessage);
      if (error.code === 'P2003' || error.code === 'P2025') throw new NotFoundException(notFoundMessage);
    }
    throw error;
  }
}
