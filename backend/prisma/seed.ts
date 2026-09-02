import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const permissions = [
  ['system.manage', 'system', 'Kelola sistem'],
  ['user.manage', 'user', 'Kelola pengguna'],
  ['branch.manage', 'branch', 'Kelola cabang'],
  ['branch.read_all', 'branch', 'Lihat seluruh cabang'],
  ['audit.read', 'audit', 'Lihat audit log'],
  ['product.read', 'product', 'Lihat produk dan harga'],
  ['product.manage', 'product', 'Kelola master produk'],
  ['product.price.manage', 'product', 'Kelola harga jual per cabang'],
  ['product.cost.read', 'product', 'Lihat harga modal'],
  ['product.cost.manage', 'product', 'Kelola harga modal'],
  ['stock.read', 'stock', 'Lihat stok seluruh lokasi yang diizinkan'],
  ['stock.adjust', 'stock', 'Catat barang masuk, keluar, dan koreksi'],
  ['stock.transfer.request', 'stock', 'Membuat permintaan transfer cabang'],
  ['stock.transfer.approve', 'stock', 'Menyetujui transfer cabang'],
  ['stock.transfer.dispatch', 'stock', 'Mengirim transfer cabang'],
  ['stock.transfer.receive', 'stock', 'Menerima transfer cabang'],
  ['sales.create', 'sales', 'Membuat transaksi kasir'],
  ['sales.read', 'sales', 'Lihat transaksi'],
  ['customer.read', 'customer', 'Lihat pelanggan'],
  ['customer.manage', 'customer', 'Kelola pelanggan'],
  ['receivable.read', 'receivable', 'Lihat piutang'],
  ['receivable.manage', 'receivable', 'Catat pembayaran piutang'],
  ['return.read', 'return', 'Lihat retur'],
  ['return.create', 'return', 'Membuat retur penjualan'],
  ['expense.read', 'finance', 'Lihat pengeluaran'],
  ['expense.manage', 'finance', 'Catat pengeluaran'],
  ['report.read', 'report', 'Lihat laporan operasional'],
  ['report.finance', 'report', 'Lihat laporan keuangan dan laba'],
  ['attendance.read', 'attendance', 'Lihat presensi'],
  ['attendance.manage', 'attendance', 'Kelola karyawan dan presensi'],
  ['delivery.approve', 'sales', 'Menyetujui ongkir lebih dari 20 km'],
] as const;

const roles = [
  ['OWNER', 'Owner', 'Akses penuh seluruh cabang'],
  ['ADMIN', 'Administrator', 'Administrasi user, cabang, dan audit'],
  ['MANAGER', 'Manajer Cabang', 'Operasional satu cabang'],
  ['CASHIER', 'Kasir', 'Operasional kasir'],
  ['WAREHOUSE', 'Gudang', 'Operasional stok dan gudang'],
  ['ACCOUNTING', 'Keuangan', 'Piutang dan laporan keuangan'],
] as const;

async function main() {
  const branch = await prisma.branch.upsert({
    where: { code: 'PUSAT' },
    update: {},
    create: { code: 'PUSAT', name: 'TB Permata Keramik - Pusat' },
  });

  const permissionRows = [];
  for (const [code, module, name] of permissions) {
    permissionRows.push(
      await prisma.permission.upsert({
        where: { code },
        update: { module, name },
        create: { code, module, name },
      }),
    );
  }

  const roleRows = new Map<string, { id: string }>();
  for (const [code, name, description] of roles) {
    const role = await prisma.role.upsert({
      where: { code },
      update: { name, description },
      create: { code, name, description },
    });
    roleRows.set(code, role);
  }

  const grants: Record<string, string[]> = {
    OWNER: permissionRows.map((permission) => permission.code),
    ADMIN: permissionRows.map((permission) => permission.code),
    MANAGER: permissionRows.map((permission) => permission.code).filter((code) => !['system.manage', 'user.manage'].includes(code)),
    CASHIER: ['product.read', 'stock.read', 'sales.create', 'sales.read', 'customer.read', 'customer.manage', 'receivable.read', 'return.read', 'return.create'],
    WAREHOUSE: ['product.read', 'stock.read', 'stock.adjust', 'stock.transfer.request', 'stock.transfer.dispatch', 'stock.transfer.receive'],
    ACCOUNTING: ['product.read', 'product.cost.read', 'sales.read', 'customer.read', 'receivable.read', 'receivable.manage', 'expense.read', 'expense.manage', 'report.read', 'report.finance'],
  };

  for (const [roleCode, permissionCodes] of Object.entries(grants)) {
    const role = roleRows.get(roleCode);
    if (!role) continue;
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const rows = permissionRows
      .filter((permission) => permissionCodes.includes(permission.code))
      .map((permission) => ({ roleId: role.id, permissionId: permission.id }));
    if (rows.length) await prisma.rolePermission.createMany({ data: rows });
  }

  const email = (process.env.SEED_OWNER_EMAIL ?? 'owner@tbpermata.local').trim().toLowerCase();
  const password = process.env.SEED_OWNER_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error('SEED_OWNER_PASSWORD wajib diisi dan minimal 12 karakter.');
  }

  const ownerRole = roleRows.get('OWNER');
  if (!ownerRole) throw new Error('Role OWNER gagal dibuat.');

  await prisma.user.upsert({
    where: { email },
    update: {
      fullName: process.env.SEED_OWNER_NAME ?? 'Owner TB Permata',
      roleId: ownerRole.id,
      branchId: branch.id,
      isActive: true,
    },
    create: {
      email,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      fullName: process.env.SEED_OWNER_NAME ?? 'Owner TB Permata',
      roleId: ownerRole.id,
      branchId: branch.id,
    },
  });

  const unitSeeds = [
    ['PCS', 'Pcs', false],
    ['DUS', 'Dus', false],
    ['SAK', 'Sak', false],
    ['BATANG', 'Batang', false],
    ['LEMBAR', 'Lembar', false],
    ['M', 'Meter', true],
    ['M2', 'Meter Persegi', true],
    ['KG', 'Kilogram', true],
  ] as const;
  for (const [code, name, allowDecimal] of unitSeeds) {
    await prisma.unit.upsert({
      where: { code },
      update: { name, allowDecimal, isActive: true },
      create: { code, name, allowDecimal },
    });
  }

  const categorySeeds = [
    ['KERAMIK', 'Keramik'],
    ['GRANIT', 'Granit'],
    ['SEMEN', 'Semen'],
    ['CAT', 'Cat'],
    ['SANITARI', 'Sanitari'],
    ['BESI', 'Besi dan Baja'],
    ['LAINNYA', 'Lainnya'],
  ] as const;
  for (const [code, name] of categorySeeds) {
    await prisma.productCategory.upsert({
      where: { code },
      update: { name, isActive: true },
      create: { code, name },
    });
  }

  const warehouse = await prisma.warehouse.upsert({
    where: { branchId_code: { branchId: branch.id, code: 'UTAMA' } },
    update: { name: 'Gudang Utama', isActive: true },
    create: { branchId: branch.id, code: 'UTAMA', name: 'Gudang Utama' },
  });
  for (const [upToKm, fee] of [[5, 25000], [10, 50000], [20, 75000]] as const) {
    await prisma.shippingRate.upsert({
      where: { branchId_upToKm: { branchId: branch.id, upToKm } },
      update: { fee, isActive: true },
      create: { branchId: branch.id, upToKm, fee },
    });
  }

  console.info(`Seed selesai. Owner: ${email}, cabang: ${branch.code}, gudang: ${warehouse.code}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
