import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../common/types/auth-user';
import type { BranchFilterDto } from '../operations/operations.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(query: BranchFilterDto, actor: AuthUser) {
    const branchId = query.branchId ?? (actor.permissions.includes('branch.read_all') ? null : actor.branchId);
    if (query.branchId && !actor.permissions.includes('branch.read_all') && query.branchId !== actor.branchId) {
      throw new ForbiddenException('Anda tidak memiliki akses ke laporan cabang tersebut.');
    }
    const createdAt = this.dateRange(query);
    const salesWhere: Prisma.SaleWhereInput = {
      ...(branchId ? { branchId } : {}),
      ...(createdAt ? { createdAt } : {}),
      status: { not: 'VOID' },
    };
    const expenseWhere: Prisma.ExpenseWhereInput = {
      ...(branchId ? { branchId } : {}),
      ...(createdAt ? { createdAt } : {}),
    };

    const [sales, expenses, receivables, lowStock, transfers, attendance, branchSales] = await Promise.all([
      this.prisma.sale.aggregate({
        where: salesWhere,
        _sum: { grandTotal: true, discountAmount: true, shippingFee: true, paidAmount: true },
        _count: { id: true },
        _avg: { grandTotal: true },
      }),
      this.prisma.expense.aggregate({ where: expenseWhere, _sum: { amount: true }, _count: { id: true } }),
      this.prisma.receivable.aggregate({
        where: { ...(branchId ? { branchId } : {}), status: { in: ['OPEN', 'PARTIAL', 'OVERDUE'] } },
        _sum: { outstandingAmount: true },
        _count: { id: true },
      }),
      this.prisma.branchStock.count({
        where: { ...(branchId ? { branchId } : {}), quantity: { lte: this.prisma.branchStock.fields.minimumQuantity } },
      }).catch(() => 0),
      this.prisma.stockTransfer.count({
        where: {
          ...(branchId ? { OR: [{ sourceBranchId: branchId }, { destinationBranchId: branchId }] } : {}),
          status: { in: ['REQUESTED', 'APPROVED', 'IN_TRANSIT'] },
        },
      }),
      this.prisma.attendance.groupBy({
        by: ['status'],
        where: { ...(branchId ? { branchId } : {}), ...(createdAt ? { attendanceDate: createdAt } : {}) },
        _count: { id: true },
      }),
      this.prisma.sale.groupBy({
        by: ['branchId'],
        where: salesWhere,
        _sum: { grandTotal: true },
        _count: { id: true },
      }),
    ]);

    const revenue = sales._sum.grandTotal ?? new Prisma.Decimal(0);
    const canSeeFinance = actor.permissions.includes('report.finance');
    const itemRows = await this.prisma.saleItem.findMany({
      where: { sale: salesWhere },
      select: { costPrice: true, quantity: true, productId: true, lineTotal: true },
    });
    const cogs = itemRows.reduce((sum, row) => sum.add(row.costPrice.mul(row.quantity)), new Prisma.Decimal(0));
    const expenseTotal = expenses._sum.amount ?? new Prisma.Decimal(0);
    const grossProfit = revenue.sub(cogs);
    const netProfit = grossProfit.sub(expenseTotal);

    const productTotals = new Map<string, { quantity: Prisma.Decimal; revenue: Prisma.Decimal }>();
    for (const row of itemRows) {
      const current = productTotals.get(row.productId) ?? { quantity: new Prisma.Decimal(0), revenue: new Prisma.Decimal(0) };
      current.quantity = current.quantity.add(row.quantity);
      current.revenue = current.revenue.add(row.lineTotal);
      productTotals.set(row.productId, current);
    }
    const topIds = [...productTotals.entries()].sort((a, b) => b[1].revenue.comparedTo(a[1].revenue)).slice(0, 10).map(([id]) => id);
    const products = await this.prisma.product.findMany({ where: { id: { in: topIds } }, select: { id: true, sku: true, name: true, brand: true } });
    const branches = await this.prisma.branch.findMany({ where: { id: { in: branchSales.map((row) => row.branchId) } }, select: { id: true, code: true, name: true } });

    return {
      generatedAt: new Date().toISOString(),
      filters: { branchId, from: query.from ?? null, to: query.to ?? null },
      sales: {
        revenue,
        transactions: sales._count.id,
        averageTransaction: sales._avg.grandTotal ?? 0,
        discount: sales._sum.discountAmount ?? 0,
        shippingRevenue: sales._sum.shippingFee ?? 0,
      },
      finance: canSeeFinance ? { cogs, grossProfit, expenses: expenseTotal, netProfit } : null,
      receivables: { outstanding: receivables._sum.outstandingAmount ?? 0, openCount: receivables._count.id },
      operations: { lowStock, activeTransfers: transfers, attendance },
      topProducts: topIds.map((id) => ({ ...products.find((product) => product.id === id), ...productTotals.get(id) })),
      branches: branchSales.map((row) => ({
        ...branches.find((branch) => branch.id === row.branchId),
        revenue: row._sum.grandTotal ?? 0,
        transactions: row._count.id,
      })),
    };
  }

  private dateRange(query: BranchFilterDto): Prisma.DateTimeFilter | undefined {
    if (!query.from && !query.to) return undefined;
    return {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(`${query.to.slice(0, 10)}T23:59:59.999Z`) } : {}),
    };
  }
}
