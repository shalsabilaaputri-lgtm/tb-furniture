import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import type {
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

type RequestMeta = { ipAddress?: string; userAgent?: string };
type StockRow = { id: string; quantity: Prisma.Decimal; reserved_quantity: Prisma.Decimal; damaged_quantity: Prisma.Decimal };

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listStock(query: BranchFilterDto, actor: AuthUser) {
    const branchId = this.resolveBranch(actor, query.branchId);
    return this.prisma.branchStock.findMany({
      where: branchId ? { branchId } : {},
      include: {
        branch: { select: { id: true, code: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        product: { include: { baseUnit: true, barcodes: true } },
      },
      orderBy: [{ product: { name: 'asc' } }, { branch: { name: 'asc' } }],
    });
  }

  listMovements(query: BranchFilterDto, actor: AuthUser) {
    const branchId = this.resolveBranch(actor, query.branchId);
    return this.prisma.stockMovement.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        createdAt: this.dateRange(query),
      },
      include: {
        product: { select: { id: true, sku: true, name: true } },
        branch: { select: { id: true, code: true, name: true } },
        warehouse: { select: { id: true, name: true } },
        actor: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async adjustStock(dto: StockAdjustmentDto, actor: AuthUser, meta: RequestMeta) {
    this.assertBranchScope(actor, dto.branchId);
    const result = await this.serializable(async (tx) => {
      await this.assertWarehouse(tx, dto.warehouseId, dto.branchId);
      const existing = await tx.branchStock.upsert({
        where: { warehouseId_productId: { warehouseId: dto.warehouseId, productId: dto.productId } },
        update: {},
        create: { branchId: dto.branchId, warehouseId: dto.warehouseId, productId: dto.productId },
      });
      const before = existing.quantity;
      const amount = new Prisma.Decimal(dto.quantity);
      const after = dto.type === 'ADJUST'
        ? amount
        : dto.type === 'IN'
          ? before.add(amount)
          : before.sub(amount);
      if (after.lt(existing.reservedQuantity.add(existing.damagedQuantity))) {
        throw new ConflictException('Stok setelah perubahan lebih kecil dari stok terpesan/rusak.');
      }
      const updated = await tx.branchStock.update({
        where: { id: existing.id },
        data: { quantity: after, version: { increment: 1 } },
      });
      const referenceNumber = `STK-${Date.now()}-${randomUUID().slice(0, 4).toUpperCase()}`;
      const movement = await tx.stockMovement.create({
        data: {
          branchId: dto.branchId,
          warehouseId: dto.warehouseId,
          productId: dto.productId,
          movementType: dto.type === 'IN' ? 'STOCK_IN' : dto.type === 'OUT' ? 'STOCK_OUT' : 'STOCK_ADJUSTMENT',
          quantity: after.sub(before),
          stockBefore: before,
          stockAfter: after,
          referenceType: 'ADJUSTMENT',
          referenceNumber,
          reason: dto.reason.trim(),
          actorUserId: actor.sub,
        },
      });
      return { stock: updated, movement, referenceNumber };
    });
    await this.record(actor, 'STOCK_ADJUSTED', 'branch_stock', result.stock.id, undefined, result, meta, dto.branchId);
    return result;
  }

  listSales(query: BranchFilterDto, actor: AuthUser) {
    const branchId = this.resolveBranch(actor, query.branchId);
    return this.prisma.sale.findMany({
      where: { ...(branchId ? { branchId } : {}), createdAt: this.dateRange(query) },
      include: this.saleInclude(actor.permissions.includes('product.cost.read')),
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async getSale(id: string, actor: AuthUser) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: this.saleInclude(actor.permissions.includes('product.cost.read')),
    });
    if (!sale) throw new NotFoundException('Transaksi tidak ditemukan.');
    this.assertBranchScope(actor, sale.branchId);
    return sale;
  }

  async createSale(dto: CreateSaleDto, actor: AuthUser, meta: RequestMeta) {
    this.assertBranchScope(actor, dto.branchId);
    if (!dto.items.length || dto.items.length > 200) throw new BadRequestException('Transaksi harus berisi 1–200 item.');
    const duplicateUnits = new Set(dto.items.map((item) => item.productUnitId));
    if (duplicateUnits.size !== dto.items.length) throw new BadRequestException('Satuan produk yang sama tidak boleh berulang.');

    const sale = await this.serializable(async (tx) => {
      const branch = await tx.branch.findUnique({ where: { id: dto.branchId } });
      if (!branch?.isActive) throw new NotFoundException('Cabang tidak ditemukan atau tidak aktif.');
      const warehouse = dto.warehouseId
        ? await this.assertWarehouse(tx, dto.warehouseId, dto.branchId)
        : await tx.warehouse.findFirst({ where: { branchId: dto.branchId, isActive: true }, orderBy: { code: 'asc' } });
      if (!warehouse) throw new NotFoundException('Gudang aktif untuk cabang ini belum dibuat.');

      const distance = new Prisma.Decimal(dto.shippingDistanceKm ?? 0);
      let shippingFee = new Prisma.Decimal(0);
      let shippingApprovalStatus = 'NOT_REQUIRED';
      let shippingApprovedById: string | undefined;
      if (distance.gt(0) && distance.lte(20)) {
        const rate = await tx.shippingRate.findFirst({
          where: { branchId: dto.branchId, isActive: true, upToKm: { gte: distance } },
          orderBy: { upToKm: 'asc' },
        });
        if (!rate) throw new ConflictException('Tarif ongkir untuk jarak ini belum ditetapkan.');
        shippingFee = rate.fee;
      } else if (distance.gt(20)) {
        if (!dto.ownerApprovedShipping || !actor.permissions.includes('delivery.approve')) {
          throw new ForbiddenException('Ongkir lebih dari 20 km harus ditetapkan dan disetujui owner/manager.');
        }
        shippingFee = new Prisma.Decimal(dto.shippingFee ?? 0);
        shippingApprovalStatus = 'APPROVED';
        shippingApprovedById = actor.sub;
      }

      const now = new Date();
      const lines = [] as Array<{
        productId: string;
        productUnitId: string;
        quantity: Prisma.Decimal;
        baseQuantity: Prisma.Decimal;
        unitPrice: Prisma.Decimal;
        costPrice: Prisma.Decimal;
        lineDiscount: Prisma.Decimal;
        gross: Prisma.Decimal;
        lineTotal: Prisma.Decimal;
      }>;
      for (const item of dto.items) {
        const quantity = new Prisma.Decimal(item.quantity);
        const productUnit = await tx.productUnit.findUnique({
          where: { id: item.productUnitId },
          include: { product: true },
        });
        if (!productUnit?.product.isActive) throw new NotFoundException('Ada produk/satuan yang tidak aktif.');
        const tier = await tx.productPrice.findFirst({
          where: {
            branchId: dto.branchId,
            productUnitId: item.productUnitId,
            isActive: true,
            minQuantity: { lte: quantity },
            AND: [
              { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
              { OR: [{ validTo: null }, { validTo: { gt: now } }] },
            ],
          },
          orderBy: { minQuantity: 'desc' },
        });
        if (!tier) throw new ConflictException(`${productUnit.product.name}: harga cabang belum ditetapkan.`);
        const unitPrice = item.unitPrice === undefined ? tier.sellPrice : new Prisma.Decimal(item.unitPrice);
        if (unitPrice.lt(tier.sellPrice) && !actor.permissions.includes('product.price.manage')) {
          throw new ForbiddenException(`${productUnit.product.name}: harga di bawah harga aktif memerlukan manager.`);
        }
        const gross = unitPrice.mul(quantity);
        const lineDiscount = new Prisma.Decimal(item.lineDiscount ?? 0);
        if (lineDiscount.gt(gross)) throw new BadRequestException('Diskon item tidak boleh melebihi nilai item.');
        const cost = await tx.productCost.findUnique({
          where: { branchId_productId: { branchId: dto.branchId, productId: productUnit.productId } },
        });
        lines.push({
          productId: productUnit.productId,
          productUnitId: productUnit.id,
          quantity,
          baseQuantity: quantity.mul(productUnit.conversionToBase),
          unitPrice,
          costPrice: (cost?.unitCost ?? new Prisma.Decimal(0)).mul(productUnit.conversionToBase),
          lineDiscount,
          gross,
          lineTotal: gross.sub(lineDiscount),
        });
      }

      const subtotal = lines.reduce((sum, line) => sum.add(line.gross), new Prisma.Decimal(0));
      const lineDiscountTotal = lines.reduce((sum, line) => sum.add(line.lineDiscount), new Prisma.Decimal(0));
      const headerDiscount = new Prisma.Decimal(dto.discountAmount ?? 0);
      const discountAmount = lineDiscountTotal.add(headerDiscount);
      if (discountAmount.gt(subtotal)) throw new BadRequestException('Total diskon tidak boleh melebihi subtotal.');
      const grandTotal = subtotal.sub(discountAmount).add(shippingFee);
      const paidAmount = new Prisma.Decimal(dto.paidAmount ?? (dto.paymentMethod === 'CREDIT' ? 0 : grandTotal));
      if (paidAmount.gt(grandTotal)) throw new BadRequestException('Pembayaran tidak boleh melebihi total transaksi.');
      const outstanding = grandTotal.sub(paidAmount);
      if (outstanding.gt(0) && !dto.customerId) throw new BadRequestException('Transaksi piutang wajib memilih pelanggan.');

      if (outstanding.gt(0) && dto.customerId) {
        const customer = await tx.customer.findUnique({ where: { id: dto.customerId } });
        if (!customer?.isActive) throw new NotFoundException('Pelanggan tidak ditemukan atau tidak aktif.');
        const current = await tx.receivable.aggregate({
          where: { customerId: dto.customerId, status: { in: ['OPEN', 'PARTIAL', 'OVERDUE'] } },
          _sum: { outstandingAmount: true },
        });
        const totalCredit = (current._sum.outstandingAmount ?? new Prisma.Decimal(0)).add(outstanding);
        if (totalCredit.gt(customer.creditLimit) && !actor.permissions.includes('receivable.manage')) {
          throw new ForbiddenException('Transaksi melebihi limit kredit pelanggan dan memerlukan manager/keuangan.');
        }
      }

      const invoiceNumber = `INV-${branch.code}-${Date.now()}-${randomUUID().slice(0, 4).toUpperCase()}`;
      const created = await tx.sale.create({
        data: {
          invoiceNumber,
          branchId: dto.branchId,
          customerId: dto.customerId,
          cashierId: actor.sub,
          subtotal,
          discountAmount,
          shippingDistanceKm: distance,
          shippingFee,
          shippingApprovalStatus,
          shippingApprovedById,
          grandTotal,
          paidAmount,
          status: outstanding.gt(0) ? (paidAmount.gt(0) ? 'PARTIAL' : 'CREDIT') : 'PAID',
          notes: dto.notes?.trim(),
        },
      });

      for (const line of lines) {
        const rows = await tx.$queryRaw<StockRow[]>(Prisma.sql`
          UPDATE "branch_stocks"
          SET "quantity" = "quantity" - ${line.baseQuantity}, "version" = "version" + 1, "updated_at" = CURRENT_TIMESTAMP
          WHERE "warehouse_id" = ${warehouse.id}::uuid AND "product_id" = ${line.productId}::uuid
            AND ("quantity" - "reserved_quantity" - "damaged_quantity") >= ${line.baseQuantity}
          RETURNING "id", "quantity", "reserved_quantity", "damaged_quantity"
        `);
        if (!rows.length) throw new ConflictException('Stok berubah atau tidak cukup. Muat ulang kasir dan coba lagi.');
        const after = rows[0].quantity;
        const before = after.add(line.baseQuantity);
        await tx.saleItem.create({ data: { saleId: created.id, ...line, gross: undefined } as Prisma.SaleItemUncheckedCreateInput });
        await tx.stockMovement.create({
          data: {
            branchId: dto.branchId,
            warehouseId: warehouse.id,
            productId: line.productId,
            movementType: 'SALE',
            quantity: line.baseQuantity.negated(),
            stockBefore: before,
            stockAfter: after,
            referenceType: 'SALE',
            referenceId: created.id,
            referenceNumber: invoiceNumber,
            reason: 'Penjualan kasir',
            actorUserId: actor.sub,
          },
        });
      }
      if (paidAmount.gt(0)) {
        await tx.payment.create({
          data: { saleId: created.id, method: dto.paymentMethod, amount: paidAmount, actorUserId: actor.sub },
        });
      }
      if (outstanding.gt(0) && dto.customerId) {
        await tx.receivable.create({
          data: {
            saleId: created.id,
            customerId: dto.customerId,
            branchId: dto.branchId,
            originalAmount: outstanding,
            outstandingAmount: outstanding,
            dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          },
        });
      }
      return tx.sale.findUniqueOrThrow({ where: { id: created.id }, include: this.saleInclude(true) });
    });

    await this.record(actor, 'SALE_CREATED', 'sale', sale.id, undefined, { invoiceNumber: sale.invoiceNumber, grandTotal: sale.grandTotal }, meta, dto.branchId);
    return sale;
  }

  listCustomers() {
    return this.prisma.customer.findMany({
      include: { receivables: { where: { status: { in: ['OPEN', 'PARTIAL', 'OVERDUE'] } }, select: { outstandingAmount: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createCustomer(dto: CreateCustomerDto, actor: AuthUser, meta: RequestMeta) {
    try {
      const customer = await this.prisma.customer.create({
        data: {
          name: dto.name.trim(),
          whatsapp: dto.whatsapp?.replace(/\s/g, ''),
          customerType: dto.customerType ?? 'RETAIL',
          creditLimit: dto.creditLimit ?? 0,
        },
      });
      await this.record(actor, 'CUSTOMER_CREATED', 'customer', customer.id, undefined, customer, meta);
      return customer;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Nomor WhatsApp sudah digunakan pelanggan lain.');
      }
      throw error;
    }
  }

  listReceivables(query: BranchFilterDto, actor: AuthUser) {
    const branchId = this.resolveBranch(actor, query.branchId);
    return this.prisma.receivable.findMany({
      where: { ...(branchId ? { branchId } : {}), createdAt: this.dateRange(query) },
      include: {
        customer: true,
        sale: { select: { id: true, invoiceNumber: true, grandTotal: true, createdAt: true } },
        payments: { orderBy: { createdAt: 'desc' } },
        branch: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async payReceivable(id: string, dto: PayReceivableDto, actor: AuthUser, meta: RequestMeta) {
    const result = await this.serializable(async (tx) => {
      const receivable = await tx.receivable.findUnique({ where: { id } });
      if (!receivable) throw new NotFoundException('Piutang tidak ditemukan.');
      this.assertBranchScope(actor, receivable.branchId);
      const amount = new Prisma.Decimal(dto.amount);
      if (amount.gt(receivable.outstandingAmount)) throw new BadRequestException('Pembayaran melebihi sisa piutang.');
      const outstandingAmount = receivable.outstandingAmount.sub(amount);
      const updated = await tx.receivable.update({
        where: { id },
        data: { outstandingAmount, status: outstandingAmount.eq(0) ? 'PAID' : 'PARTIAL' },
      });
      const payment = await tx.receivablePayment.create({
        data: {
          receivableId: id,
          branchId: receivable.branchId,
          amount,
          method: dto.method,
          reference: dto.reference?.trim(),
          actorUserId: actor.sub,
        },
      });
      await tx.sale.update({
        where: { id: receivable.saleId },
        data: { paidAmount: { increment: amount }, status: outstandingAmount.eq(0) ? 'PAID' : 'PARTIAL' },
      });
      return { receivable: updated, payment };
    });
    await this.record(actor, 'RECEIVABLE_PAYMENT_CREATED', 'receivable', id, undefined, result, meta, result.receivable.branchId);
    return result;
  }

  listReturns(query: BranchFilterDto, actor: AuthUser) {
    const branchId = this.resolveBranch(actor, query.branchId);
    return this.prisma.customerReturn.findMany({
      where: { ...(branchId ? { branchId } : {}), createdAt: this.dateRange(query) },
      include: {
        sale: { select: { invoiceNumber: true } },
        customer: true,
        items: { include: { product: true, productUnit: { include: { unit: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createReturn(dto: CreateReturnDto, actor: AuthUser, meta: RequestMeta) {
    if (!dto.items.length) throw new BadRequestException('Retur harus berisi barang.');
    const result = await this.serializable(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id: dto.saleId }, include: { items: true } });
      if (!sale) throw new NotFoundException('Transaksi asal tidak ditemukan.');
      this.assertBranchScope(actor, sale.branchId);
      await this.assertWarehouse(tx, dto.warehouseId, sale.branchId);
      const returnNumber = `RET-${Date.now()}-${randomUUID().slice(0, 4).toUpperCase()}`;
      const resolved = [] as Array<{ saleItem: (typeof sale.items)[number]; quantity: Prisma.Decimal; baseQuantity: Prisma.Decimal; refundAmount: Prisma.Decimal }>;
      for (const input of dto.items) {
        const saleItem = sale.items.find((item) => item.id === input.saleItemId);
        if (!saleItem) throw new BadRequestException('Barang retur tidak berasal dari transaksi ini.');
        const already = await tx.customerReturnItem.aggregate({ where: { saleItemId: input.saleItemId }, _sum: { quantity: true } });
        const quantity = new Prisma.Decimal(input.quantity);
        if ((already._sum.quantity ?? new Prisma.Decimal(0)).add(quantity).gt(saleItem.quantity)) {
          throw new ConflictException('Jumlah retur melebihi jumlah yang dibeli.');
        }
        const ratio = saleItem.baseQuantity.div(saleItem.quantity);
        resolved.push({ saleItem, quantity, baseQuantity: quantity.mul(ratio), refundAmount: quantity.mul(saleItem.unitPrice) });
      }
      const totalRefund = resolved.reduce((sum, item) => sum.add(item.refundAmount), new Prisma.Decimal(0));
      const created = await tx.customerReturn.create({
        data: {
          returnNumber,
          saleId: sale.id,
          branchId: sale.branchId,
          customerId: sale.customerId,
          totalRefund,
          reason: dto.reason.trim(),
          condition: dto.condition,
          actorUserId: actor.sub,
        },
      });
      for (const item of resolved) {
        await tx.customerReturnItem.create({
          data: {
            returnId: created.id,
            saleItemId: item.saleItem.id,
            productId: item.saleItem.productId,
            productUnitId: item.saleItem.productUnitId,
            quantity: item.quantity,
            baseQuantity: item.baseQuantity,
            unitPrice: item.saleItem.unitPrice,
            refundAmount: item.refundAmount,
          },
        });
        const stock = await tx.branchStock.upsert({
          where: { warehouseId_productId: { warehouseId: dto.warehouseId, productId: item.saleItem.productId } },
          update: {
            quantity: { increment: item.baseQuantity },
            ...(dto.condition === 'DAMAGED' ? { damagedQuantity: { increment: item.baseQuantity } } : {}),
            version: { increment: 1 },
          },
          create: {
            branchId: sale.branchId,
            warehouseId: dto.warehouseId,
            productId: item.saleItem.productId,
            quantity: item.baseQuantity,
            damagedQuantity: dto.condition === 'DAMAGED' ? item.baseQuantity : 0,
          },
        });
        await tx.stockMovement.create({
          data: {
            branchId: sale.branchId,
            warehouseId: dto.warehouseId,
            productId: item.saleItem.productId,
            movementType: dto.condition === 'DAMAGED' ? 'RETURN_DAMAGED' : 'RETURN_IN',
            quantity: item.baseQuantity,
            stockBefore: stock.quantity.sub(item.baseQuantity),
            stockAfter: stock.quantity,
            referenceType: 'RETURN',
            referenceId: created.id,
            referenceNumber: returnNumber,
            reason: dto.reason,
            actorUserId: actor.sub,
          },
        });
      }
      const receivable = await tx.receivable.findUnique({ where: { saleId: sale.id } });
      if (receivable?.outstandingAmount.gt(0)) {
        const outstanding = Prisma.Decimal.max(receivable.outstandingAmount.sub(totalRefund), 0);
        await tx.receivable.update({ where: { id: receivable.id }, data: { outstandingAmount: outstanding, status: outstanding.eq(0) ? 'PAID' : 'PARTIAL' } });
      }
      const totalReturned = await tx.customerReturnItem.aggregate({
        where: { customerReturn: { saleId: sale.id } },
        _sum: { baseQuantity: true },
      });
      const soldBase = sale.items.reduce((sum, item) => sum.add(item.baseQuantity), new Prisma.Decimal(0));
      await tx.sale.update({ where: { id: sale.id }, data: { status: (totalReturned._sum.baseQuantity ?? 0).toString() === soldBase.toString() ? 'RETURNED' : 'PARTIAL_RETURN' } });
      return tx.customerReturn.findUniqueOrThrow({ where: { id: created.id }, include: { items: true } });
    });
    await this.record(actor, 'RETURN_CREATED', 'customer_return', result.id, undefined, result, meta, result.branchId);
    return result;
  }

  listTransfers(query: BranchFilterDto, actor: AuthUser) {
    const requested = query.branchId ?? actor.branchId;
    if (query.branchId) this.assertBranchScope(actor, query.branchId);
    const where: Prisma.StockTransferWhereInput = actor.permissions.includes('branch.read_all')
      ? requested ? { OR: [{ sourceBranchId: requested }, { destinationBranchId: requested }] } : {}
      : { OR: [{ sourceBranchId: actor.branchId ?? undefined }, { destinationBranchId: actor.branchId ?? undefined }] };
    return this.prisma.stockTransfer.findMany({
      where,
      include: {
        sourceBranch: true,
        destinationBranch: true,
        sourceWarehouse: true,
        destinationWarehouse: true,
        items: { include: { product: true, productUnit: { include: { unit: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTransfer(dto: CreateTransferDto, actor: AuthUser, meta: RequestMeta) {
    this.assertBranchScope(actor, dto.sourceBranchId);
    if (dto.sourceBranchId === dto.destinationBranchId) throw new BadRequestException('Cabang asal dan tujuan harus berbeda.');
    if (!dto.items.length) throw new BadRequestException('Transfer harus berisi barang.');
    const result = await this.serializable(async (tx) => {
      await this.assertWarehouse(tx, dto.sourceWarehouseId, dto.sourceBranchId);
      await this.assertWarehouse(tx, dto.destinationWarehouseId, dto.destinationBranchId);
      const resolved = [] as Array<{ productId: string; productUnitId: string; quantity: Prisma.Decimal; baseQuantity: Prisma.Decimal }>;
      for (const input of dto.items) {
        const productUnit = await tx.productUnit.findUnique({ where: { id: input.productUnitId } });
        if (!productUnit) throw new NotFoundException('Satuan produk transfer tidak ditemukan.');
        const quantity = new Prisma.Decimal(input.quantity);
        resolved.push({ productId: productUnit.productId, productUnitId: productUnit.id, quantity, baseQuantity: quantity.mul(productUnit.conversionToBase) });
      }
      if (new Set(resolved.map((item) => item.productId)).size !== resolved.length) {
        throw new BadRequestException('Produk yang sama tidak boleh berulang dalam transfer.');
      }
      const transferNumber = `TRF-${Date.now()}-${randomUUID().slice(0, 4).toUpperCase()}`;
      return tx.stockTransfer.create({
        data: {
          transferNumber,
          sourceBranchId: dto.sourceBranchId,
          sourceWarehouseId: dto.sourceWarehouseId,
          destinationBranchId: dto.destinationBranchId,
          destinationWarehouseId: dto.destinationWarehouseId,
          requestedById: actor.sub,
          note: dto.note?.trim(),
          items: { create: resolved },
        },
        include: { items: true },
      });
    });
    await this.record(actor, 'STOCK_TRANSFER_REQUESTED', 'stock_transfer', result.id, undefined, result, meta, dto.sourceBranchId);
    return result;
  }

  async approveTransfer(id: string, actor: AuthUser, meta: RequestMeta) {
    const transfer = await this.prisma.stockTransfer.findUnique({ where: { id } });
    if (!transfer) throw new NotFoundException('Transfer tidak ditemukan.');
    if (transfer.status !== 'REQUESTED') throw new ConflictException('Hanya transfer REQUESTED yang dapat disetujui.');
    const result = await this.prisma.stockTransfer.update({ where: { id }, data: { status: 'APPROVED', approvedById: actor.sub, approvedAt: new Date() } });
    await this.record(actor, 'STOCK_TRANSFER_APPROVED', 'stock_transfer', id, transfer, result, meta, transfer.sourceBranchId);
    return result;
  }

  async dispatchTransfer(id: string, actor: AuthUser, meta: RequestMeta) {
    const result = await this.serializable(async (tx) => {
      const transfer = await tx.stockTransfer.findUnique({ where: { id }, include: { items: true } });
      if (!transfer) throw new NotFoundException('Transfer tidak ditemukan.');
      this.assertBranchScope(actor, transfer.sourceBranchId);
      if (transfer.status !== 'APPROVED') throw new ConflictException('Transfer harus disetujui sebelum dikirim.');
      for (const item of transfer.items) {
        const rows = await tx.$queryRaw<StockRow[]>(Prisma.sql`
          UPDATE "branch_stocks"
          SET "quantity" = "quantity" - ${item.baseQuantity}, "version" = "version" + 1, "updated_at" = CURRENT_TIMESTAMP
          WHERE "warehouse_id" = ${transfer.sourceWarehouseId}::uuid AND "product_id" = ${item.productId}::uuid
            AND ("quantity" - "reserved_quantity" - "damaged_quantity") >= ${item.baseQuantity}
          RETURNING "id", "quantity", "reserved_quantity", "damaged_quantity"
        `);
        if (!rows.length) throw new ConflictException('Stok cabang asal tidak cukup untuk transfer.');
        await tx.stockMovement.create({
          data: {
            branchId: transfer.sourceBranchId,
            warehouseId: transfer.sourceWarehouseId,
            productId: item.productId,
            movementType: 'TRANSFER_OUT',
            quantity: item.baseQuantity.negated(),
            stockBefore: rows[0].quantity.add(item.baseQuantity),
            stockAfter: rows[0].quantity,
            referenceType: 'TRANSFER',
            referenceId: transfer.id,
            referenceNumber: transfer.transferNumber,
            reason: `Transfer ke cabang ${transfer.destinationBranchId}`,
            actorUserId: actor.sub,
          },
        });
      }
      return tx.stockTransfer.update({ where: { id }, data: { status: 'IN_TRANSIT', shippedById: actor.sub, shippedAt: new Date() } });
    });
    await this.record(actor, 'STOCK_TRANSFER_DISPATCHED', 'stock_transfer', id, undefined, result, meta, result.sourceBranchId);
    return result;
  }

  async receiveTransfer(id: string, actor: AuthUser, meta: RequestMeta) {
    const result = await this.serializable(async (tx) => {
      const transfer = await tx.stockTransfer.findUnique({ where: { id }, include: { items: true } });
      if (!transfer) throw new NotFoundException('Transfer tidak ditemukan.');
      this.assertBranchScope(actor, transfer.destinationBranchId);
      if (transfer.status !== 'IN_TRANSIT') throw new ConflictException('Hanya transfer dalam perjalanan yang dapat diterima.');
      for (const item of transfer.items) {
        const stock = await tx.branchStock.upsert({
          where: { warehouseId_productId: { warehouseId: transfer.destinationWarehouseId, productId: item.productId } },
          update: { quantity: { increment: item.baseQuantity }, version: { increment: 1 } },
          create: {
            branchId: transfer.destinationBranchId,
            warehouseId: transfer.destinationWarehouseId,
            productId: item.productId,
            quantity: item.baseQuantity,
          },
        });
        await tx.stockMovement.create({
          data: {
            branchId: transfer.destinationBranchId,
            warehouseId: transfer.destinationWarehouseId,
            productId: item.productId,
            movementType: 'TRANSFER_IN',
            quantity: item.baseQuantity,
            stockBefore: stock.quantity.sub(item.baseQuantity),
            stockAfter: stock.quantity,
            referenceType: 'TRANSFER',
            referenceId: transfer.id,
            referenceNumber: transfer.transferNumber,
            reason: `Transfer dari cabang ${transfer.sourceBranchId}`,
            actorUserId: actor.sub,
          },
        });
      }
      return tx.stockTransfer.update({ where: { id }, data: { status: 'RECEIVED', receivedById: actor.sub, receivedAt: new Date() } });
    });
    await this.record(actor, 'STOCK_TRANSFER_RECEIVED', 'stock_transfer', id, undefined, result, meta, result.destinationBranchId);
    return result;
  }

  listExpenses(query: BranchFilterDto, actor: AuthUser) {
    const branchId = this.resolveBranch(actor, query.branchId);
    return this.prisma.expense.findMany({
      where: { ...(branchId ? { branchId } : {}), createdAt: this.dateRange(query) },
      include: { branch: true, actor: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createExpense(dto: CreateExpenseDto, actor: AuthUser, meta: RequestMeta) {
    this.assertBranchScope(actor, dto.branchId);
    const expense = await this.prisma.expense.create({ data: { ...dto, category: dto.category.trim(), description: dto.description?.trim(), actorUserId: actor.sub } });
    await this.record(actor, 'EXPENSE_CREATED', 'expense', expense.id, undefined, expense, meta, dto.branchId);
    return expense;
  }

  listEmployees(query: BranchFilterDto, actor: AuthUser) {
    const branchId = this.resolveBranch(actor, query.branchId);
    return this.prisma.employee.findMany({ where: branchId ? { branchId } : {}, include: { branch: true }, orderBy: { fullName: 'asc' } });
  }

  async createEmployee(dto: CreateEmployeeDto, actor: AuthUser, meta: RequestMeta) {
    this.assertBranchScope(actor, dto.branchId);
    const employee = await this.prisma.employee.create({
      data: { ...dto, fullName: dto.fullName.trim(), position: dto.position.trim(), scheduledStart: dto.scheduledStart ?? '08:00' },
    });
    await this.record(actor, 'EMPLOYEE_CREATED', 'employee', employee.id, undefined, employee, meta, dto.branchId);
    return employee;
  }

  listAttendance(query: BranchFilterDto, actor: AuthUser) {
    const branchId = this.resolveBranch(actor, query.branchId);
    return this.prisma.attendance.findMany({
      where: { ...(branchId ? { branchId } : {}), attendanceDate: this.dateRange(query) },
      include: { employee: true, branch: true, recordedBy: { select: { id: true, fullName: true } } },
      orderBy: [{ attendanceDate: 'desc' }, { checkInAt: 'asc' }],
      take: 1000,
    });
  }

  async checkIn(dto: AttendanceDto, actor: AuthUser, meta: RequestMeta) {
    const employee = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!employee?.isActive) throw new NotFoundException('Karyawan tidak ditemukan atau tidak aktif.');
    this.assertBranchScope(actor, employee.branchId);
    const now = new Date();
    const date = this.jakartaDate(now);
    const currentTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
    const status = dto.status ?? (currentTime > employee.scheduledStart ? 'LATE' : 'PRESENT');
    try {
      const attendance = await this.prisma.attendance.create({
        data: {
          employeeId: employee.id,
          branchId: employee.branchId,
          attendanceDate: date,
          scheduledStart: employee.scheduledStart,
          checkInAt: now,
          status,
          note: dto.note?.trim(),
          recordedById: actor.sub,
        },
      });
      await this.record(actor, 'ATTENDANCE_CHECK_IN', 'attendance', attendance.id, undefined, attendance, meta, employee.branchId);
      return attendance;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Karyawan sudah presensi hari ini.');
      }
      throw error;
    }
  }

  async checkOut(dto: AttendanceDto, actor: AuthUser, meta: RequestMeta) {
    const employee = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!employee) throw new NotFoundException('Karyawan tidak ditemukan.');
    this.assertBranchScope(actor, employee.branchId);
    const key = { employeeId_attendanceDate: { employeeId: employee.id, attendanceDate: this.jakartaDate(new Date()) } };
    const existing = await this.prisma.attendance.findUnique({ where: key });
    if (!existing?.checkInAt) throw new ConflictException('Karyawan belum melakukan presensi masuk hari ini.');
    if (existing.checkOutAt) throw new ConflictException('Presensi pulang sudah tercatat.');
    const attendance = await this.prisma.attendance.update({ where: key, data: { checkOutAt: new Date(), note: dto.note?.trim() ?? existing.note } });
    await this.record(actor, 'ATTENDANCE_CHECK_OUT', 'attendance', attendance.id, existing, attendance, meta, employee.branchId);
    return attendance;
  }

  private saleInclude(canSeeCost: boolean) {
    return Prisma.validator<Prisma.SaleInclude>()({
      branch: { select: { id: true, code: true, name: true } },
      customer: true,
      cashier: { select: { id: true, fullName: true, email: true } },
      items: {
        include: { product: true, productUnit: { include: { unit: true } } },
        omit: canSeeCost ? undefined : { costPrice: true },
      },
      payments: true,
      receivable: true,
      returns: { include: { items: true } },
    });
  }

  private dateRange(query: BranchFilterDto): Prisma.DateTimeFilter | undefined {
    if (!query.from && !query.to) return undefined;
    return {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(`${query.to.slice(0, 10)}T23:59:59.999Z`) } : {}),
    };
  }

  private resolveBranch(actor: AuthUser, requested?: string) {
    if (requested) this.assertBranchScope(actor, requested);
    return requested ?? (actor.permissions.includes('branch.read_all') ? null : actor.branchId);
  }

  private assertBranchScope(actor: AuthUser, branchId: string) {
    if (!actor.permissions.includes('branch.read_all') && actor.branchId !== branchId) {
      throw new ForbiddenException('Anda tidak memiliki akses ke cabang tersebut.');
    }
  }

  private async assertWarehouse(tx: Prisma.TransactionClient, warehouseId: string, branchId: string) {
    const warehouse = await tx.warehouse.findFirst({ where: { id: warehouseId, branchId, isActive: true } });
    if (!warehouse) throw new NotFoundException('Gudang tidak ditemukan pada cabang tersebut.');
    return warehouse;
  }

  private jakartaDate(date: Date) {
    const value = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    return new Date(`${value}T00:00:00.000Z`);
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
    return this.audit.record({ actorUserId: actor.sub, branchId, action, entityType, entityId, oldValue, newValue, ...meta });
  }

  private async serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30_000,
        });
      } catch (error) {
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (!retryable || attempt === 3) throw error;
      }
    }
    throw new ConflictException('Transaksi bertabrakan dengan perubahan lain. Silakan ulangi.');
  }
}
