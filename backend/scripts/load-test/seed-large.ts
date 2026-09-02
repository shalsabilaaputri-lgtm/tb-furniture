import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const productCount = Number(process.env.LARGE_PRODUCT_COUNT ?? 50_000);
const saleCount = Number(process.env.LARGE_SALE_COUNT ?? 200_000);
const batchSize = 1_000;

async function main() {
  const owner = await prisma.user.findFirst({ where: { role: { code: 'OWNER' } } });
  const category = await prisma.productCategory.findFirst({ where: { code: 'LAINNYA' } });
  const unit = await prisma.unit.findFirst({ where: { code: 'PCS' } });
  if (!owner || !category || !unit) throw new Error('Jalankan npm run db:seed sebelum seed data besar.');

  const branches: Array<{ id: string; code: string; name: string; warehouseId: string }> = [];
  for (let index = 1; index <= 6; index += 1) {
    const code = index === 1 ? 'PUSAT' : `CBG-${index}`;
    const branch = await prisma.branch.upsert({
      where: { code },
      update: { isActive: true },
      create: { code, name: `TB Permata Keramik ${code}` },
    });
    const warehouse = await prisma.warehouse.upsert({
      where: { branchId_code: { branchId: branch.id, code: 'UTAMA' } },
      update: { isActive: true },
      create: { branchId: branch.id, code: 'UTAMA', name: 'Gudang Utama' },
    });
    branches.push({ ...branch, warehouseId: warehouse.id });
  }

  const productIds: string[] = [];
  const productUnitIds: string[] = [];
  for (let offset = 0; offset < productCount; offset += batchSize) {
    const size = Math.min(batchSize, productCount - offset);
    const products = Array.from({ length: size }, (_, local) => {
      const number = offset + local + 1;
      const id = randomUUID();
      const productUnitId = randomUUID();
      productIds.push(id);
      productUnitIds.push(productUnitId);
      return { id, productUnitId, number };
    });
    await prisma.product.createMany({
      data: products.map(({ id, number }) => ({
        id,
        sku: `LOAD-${number.toString().padStart(6, '0')}`,
        name: `Produk Uji Beban ${number}`,
        brand: `Merek ${number % 100}`,
        productType: 'LOAD_TEST',
        categoryId: category.id,
        baseUnitId: unit.id,
      })),
      skipDuplicates: true,
    });
    await prisma.productUnit.createMany({
      data: products.map(({ id, productUnitId }) => ({ id: productUnitId, productId: id, unitId: unit.id, conversionToBase: 1, isDefaultSale: true })),
      skipDuplicates: true,
    });
    for (const branch of branches) {
      await prisma.productPrice.createMany({
        data: products.map(({ id, productUnitId, number }) => ({
          branchId: branch.id,
          productId: id,
          productUnitId,
          minQuantity: 1,
          sellPrice: 10_000 + (number % 500) * 100,
        })),
        skipDuplicates: true,
      });
      await prisma.productCost.createMany({
        data: products.map(({ id, number }) => ({ branchId: branch.id, productId: id, unitCost: 8_000 + (number % 400) * 100 })),
        skipDuplicates: true,
      });
      await prisma.branchStock.createMany({
        data: products.map(({ id }) => ({ branchId: branch.id, warehouseId: branch.warehouseId, productId: id, quantity: 1_000_000, minimumQuantity: 50 })),
        skipDuplicates: true,
      });
    }
    console.info(`Produk: ${Math.min(offset + size, productCount)}/${productCount}`);
  }

  for (let offset = 0; offset < saleCount; offset += batchSize) {
    const size = Math.min(batchSize, saleCount - offset);
    const rows = Array.from({ length: size }, (_, local) => {
      const number = offset + local;
      const branch = branches[number % branches.length];
      const productIndex = number % productIds.length;
      const saleId = randomUUID();
      const quantity = (number % 10) + 1;
      const unitPrice = 10_000 + (productIndex % 500) * 100;
      const total = quantity * unitPrice;
      return { number, branch, productIndex, saleId, quantity, unitPrice, total };
    });
    await prisma.sale.createMany({
      data: rows.map((row) => ({
        id: row.saleId,
        invoiceNumber: `LOAD-${row.number.toString().padStart(9, '0')}`,
        branchId: row.branch.id,
        cashierId: owner.id,
        subtotal: row.total,
        grandTotal: row.total,
        paidAmount: row.total,
        status: 'PAID',
        createdAt: new Date(Date.now() - (row.number % 365) * 86_400_000),
      })),
      skipDuplicates: true,
    });
    await prisma.saleItem.createMany({
      data: rows.map((row) => ({
        saleId: row.saleId,
        productId: productIds[row.productIndex],
        productUnitId: productUnitIds[row.productIndex],
        quantity: row.quantity,
        baseQuantity: row.quantity,
        unitPrice: row.unitPrice,
        costPrice: row.unitPrice * 0.8,
        lineTotal: row.total,
      })),
      skipDuplicates: true,
    });
    console.info(`Transaksi: ${Math.min(offset + size, saleCount)}/${saleCount}`);
  }
}

main()
  .catch((error) => { console.error(error); process.exit(1); })
  .finally(async () => prisma.$disconnect());
