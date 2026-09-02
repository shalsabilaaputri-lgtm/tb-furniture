import { getD1 } from "@/db";

const ROLE_ROWS = [
  ["role-owner", "OWNER", "Owner", "Akses penuh seluruh cabang"],
  ["role-admin", "ADMIN", "Admin", "Mengelola operasional dan master data"],
  ["role-manager", "MANAGER", "Manager", "Mengelola operasional cabang"],
  ["role-cashier", "CASHIER", "Kasir", "Transaksi penjualan dan customer"],
  ["role-warehouse", "WAREHOUSE", "Gudang", "Stok, barang masuk, dan penyesuaian"],
  ["role-accounting", "ACCOUNTING", "Keuangan", "Piutang, pengeluaran, dan laporan"],
] as const;

const PERMISSION_ROWS = [
  ["perm-dashboard-read", "dashboard.read", "Dashboard", "Lihat ringkasan"],
  ["perm-branch-all", "branch.read_all", "Cabang", "Lihat seluruh cabang"],
  ["perm-product-read", "product.read", "Produk", "Lihat produk"],
  ["perm-product-create", "product.create", "Produk", "Tambah produk"],
  ["perm-product-update", "product.update", "Produk", "Ubah produk dan harga"],
  ["perm-cost-read", "cost_price.read", "Produk", "Lihat HPP"],
  ["perm-stock-read", "stock.read", "Inventory", "Lihat stok"],
  ["perm-stock-adjust", "stock.adjust", "Inventory", "Ubah stok"],
  ["perm-transfer-read", "transfer.read", "Inventory", "Lihat transfer cabang"],
  ["perm-transfer-request", "transfer.request", "Inventory", "Buat transfer cabang"],
  ["perm-transfer-approve", "transfer.approve", "Inventory", "Setujui transfer cabang"],
  ["perm-transfer-dispatch", "transfer.dispatch", "Inventory", "Kirim transfer cabang"],
  ["perm-transfer-receive", "transfer.receive", "Inventory", "Terima transfer cabang"],
  ["perm-sales-read", "sales.read", "Penjualan", "Lihat transaksi"],
  ["perm-sales-create", "sales.create", "Penjualan", "Buat transaksi"],
  ["perm-sales-return", "sales.return", "Penjualan", "Buat retur"],
  ["perm-delivery-approve", "delivery.approve", "Penjualan", "Setujui ongkir di atas 20 km"],
  ["perm-finance-read", "finance.read", "Keuangan", "Lihat keuangan"],
  ["perm-finance-manage", "finance.manage", "Keuangan", "Kelola keuangan dan piutang"],
  ["perm-report-read", "report.read", "Laporan", "Lihat laporan"],
  ["perm-attendance", "attendance.manage", "Karyawan", "Kelola presensi"],
  ["perm-user-manage", "user.manage", "Pengguna", "Kelola pengguna dan akses"],
] as const;

const ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: PERMISSION_ROWS.map((row) => row[1]),
  ADMIN: ["dashboard.read", "branch.read_all", "product.read", "product.create", "product.update", "cost_price.read", "stock.read", "stock.adjust", "transfer.read", "transfer.request", "transfer.approve", "transfer.dispatch", "transfer.receive", "sales.read", "sales.create", "sales.return", "delivery.approve", "finance.read", "finance.manage", "report.read", "attendance.manage"],
  MANAGER: ["dashboard.read", "product.read", "product.update", "cost_price.read", "stock.read", "stock.adjust", "transfer.read", "transfer.request", "transfer.approve", "transfer.dispatch", "transfer.receive", "sales.read", "sales.create", "sales.return", "delivery.approve", "finance.read", "report.read", "attendance.manage"],
  CASHIER: ["dashboard.read", "product.read", "stock.read", "sales.read", "sales.create", "sales.return"],
  WAREHOUSE: ["dashboard.read", "product.read", "stock.read", "stock.adjust", "transfer.read", "transfer.request", "transfer.dispatch", "transfer.receive"],
  ACCOUNTING: ["dashboard.read", "sales.read", "finance.read", "finance.manage", "report.read"],
};

export type AccessUser = {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  branchId: string | null;
  permissions: string[];
};

export async function resolveAccessUser(identity: { email: string; displayName: string }) {
  const d1 = getD1();
  const statements = [];
  for (const role of ROLE_ROWS) {
    statements.push(d1.prepare("INSERT OR IGNORE INTO roles (id,code,name,description,is_active) VALUES (?,?,?,?,1)").bind(...role));
  }
  for (const permission of PERMISSION_ROWS) {
    statements.push(d1.prepare("INSERT OR IGNORE INTO permissions (id,code,module,name) VALUES (?,?,?,?)").bind(...permission));
  }
  for (const role of ROLE_ROWS) {
    for (const permissionCode of ROLE_PERMISSIONS[role[1]] || []) {
      const permission = PERMISSION_ROWS.find((row) => row[1] === permissionCode);
      if (permission) statements.push(d1.prepare("INSERT OR IGNORE INTO role_permissions (id,role_id,permission_id) VALUES (?,?,?)").bind(`${role[0]}:${permission[0]}`, role[0], permission[0]));
    }
  }
  await d1.batch(statements);

  const userCount = await d1.prepare("SELECT COUNT(*) AS total FROM app_users").first<{ total: number }>();
  if (!Number(userCount?.total || 0)) {
    await d1.prepare("INSERT OR IGNORE INTO app_users (id,email,name,role_id,branch_id,is_active) VALUES (?,?,?,'role-owner',NULL,1)")
      .bind(crypto.randomUUID(), identity.email.toLowerCase(), identity.displayName).run();
  }

  const user = await d1.prepare(`SELECT u.id,u.email,u.name,u.role_id AS roleId,r.code AS roleCode,r.name AS roleName,u.branch_id AS branchId
    FROM app_users u JOIN roles r ON r.id=u.role_id
    WHERE LOWER(u.email)=LOWER(?) AND u.is_active=1 AND r.is_active=1`).bind(identity.email).first<any>();
  if (!user) return null;
  const permissions = await d1.prepare(`SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
    WHERE rp.role_id=? ORDER BY p.code`).bind(user.roleId).all<{ code: string }>();
  return { ...user, permissions: permissions.results.map((row: { code: string }) => row.code) } as AccessUser;
}

export function can(user: AccessUser, permission: string) {
  return user.roleCode === "OWNER" || user.permissions.includes(permission);
}
