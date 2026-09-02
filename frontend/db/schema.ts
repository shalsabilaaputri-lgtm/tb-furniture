import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const branches = sqliteTable("branches", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  address: text("address").notNull().default(""),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const roles = sqliteTable("roles", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const permissions = sqliteTable("permissions", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  module: text("module").notNull(),
  name: text("name").notNull(),
});

export const rolePermissions = sqliteTable("role_permissions", {
  id: text("id").primaryKey(),
  roleId: text("role_id").notNull().references(() => roles.id),
  permissionId: text("permission_id").notNull().references(() => permissions.id),
}, (table) => [
  uniqueIndex("uq_role_permissions_role_permission").on(table.roleId, table.permissionId),
  index("idx_role_permissions_role").on(table.roleId),
]);

export const appUsers = sqliteTable("app_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  roleId: text("role_id").notNull().references(() => roles.id),
  branchId: text("branch_id").references(() => branches.id),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_app_users_role_active").on(table.roleId, table.isActive),
  index("idx_app_users_branch").on(table.branchId),
]);

export const employees = sqliteTable("employees", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  name: text("name").notNull(),
  position: text("position").notNull().default("Karyawan Toko"),
  phone: text("phone").notNull().default(""),
  scheduledStart: text("scheduled_start").notNull().default("08:00"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_employees_branch_active").on(table.branchId, table.isActive)]);

export const attendance = sqliteTable("attendance", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id),
  branchId: text("branch_id").notNull().references(() => branches.id),
  attendanceDate: text("attendance_date").notNull(),
  scheduledStart: text("scheduled_start").notNull(),
  checkInTime: text("check_in_time"),
  status: text("status").notNull(),
  note: text("note").notNull().default(""),
  recordedBy: text("recorded_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("uq_attendance_employee_date").on(table.employeeId, table.attendanceDate),
  index("idx_attendance_branch_date").on(table.branchId, table.attendanceDate),
]);

export const warehouses = sqliteTable("warehouses", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  name: text("name").notNull(),
}, (table) => [index("idx_warehouses_branch").on(table.branchId)]);

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  sku: text("sku").notNull().unique(),
  barcode: text("barcode").unique(),
  name: text("name").notNull(),
  brand: text("brand").notNull(),
  category: text("category").notNull(),
  series: text("series").notNull().default(""),
  color: text("color").notNull().default(""),
  size: text("size").notNull().default(""),
  unit: text("unit").notNull().default("dus"),
  piecesPerBox: real("pieces_per_box"),
  sqmPerBox: real("sqm_per_box"),
  purchasePrice: integer("purchase_price").notNull().default(0),
  landedCost: integer("landed_cost").notNull().default(0),
  sellingPrice: integer("selling_price").notNull().default(0),
  wholesalePrice: integer("wholesale_price").notNull().default(0),
  projectPrice: integer("project_price").notNull().default(0),
  minimumPrice: integer("minimum_price").notNull().default(0),
  minimumStock: real("minimum_stock").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_products_name").on(table.name),
  index("idx_products_brand_category").on(table.brand, table.category),
]);

export const stocks = sqliteTable("stocks", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  warehouseId: text("warehouse_id").notNull().references(() => warehouses.id),
  productId: text("product_id").notNull().references(() => products.id),
  batch: text("batch").notNull().default("REGULER"),
  shade: text("shade").notNull().default("STD"),
  physicalQty: real("physical_qty").notNull().default(0),
  reservedQty: real("reserved_qty").notNull().default(0),
  damagedQty: real("damaged_qty").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("uq_stocks_location_product_batch").on(table.branchId, table.warehouseId, table.productId, table.batch, table.shade),
  index("idx_stocks_branch_product").on(table.branchId, table.productId),
  check("stocks_qty_valid", sql`${table.physicalQty} >= 0 AND ${table.reservedQty} >= 0 AND ${table.damagedQty} >= 0 AND ${table.physicalQty} >= ${table.reservedQty}`),
]);

export const stockMovements = sqliteTable("stock_movements", {
  id: text("id").primaryKey(),
  referenceNumber: text("reference_number").notNull(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  warehouseId: text("warehouse_id").notNull().references(() => warehouses.id),
  productId: text("product_id").notNull().references(() => products.id),
  movementType: text("movement_type").notNull(),
  quantity: real("quantity").notNull(),
  stockBefore: real("stock_before").notNull(),
  stockAfter: real("stock_after").notNull(),
  reason: text("reason").notNull().default(""),
  userEmail: text("user_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_movements_product_date").on(table.productId, table.createdAt),
  index("idx_movements_branch_date").on(table.branchId, table.createdAt),
]);

export const stockTransfers = sqliteTable("stock_transfers", {
  id: text("id").primaryKey(),
  transferNumber: text("transfer_number").notNull().unique(),
  sourceBranchId: text("source_branch_id").notNull().references(() => branches.id),
  sourceWarehouseId: text("source_warehouse_id").notNull().references(() => warehouses.id),
  destinationBranchId: text("destination_branch_id").notNull().references(() => branches.id),
  destinationWarehouseId: text("destination_warehouse_id").notNull().references(() => warehouses.id),
  status: text("status").notNull().default("REQUESTED"),
  note: text("note").notNull().default(""),
  requestedBy: text("requested_by").notNull(),
  approvedBy: text("approved_by"),
  shippedBy: text("shipped_by"),
  receivedBy: text("received_by"),
  approvedAt: text("approved_at"),
  shippedAt: text("shipped_at"),
  receivedAt: text("received_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_transfers_source_status").on(table.sourceBranchId, table.status, table.createdAt),
  index("idx_transfers_destination_status").on(table.destinationBranchId, table.status, table.createdAt),
  check("transfers_different_branches", sql`${table.sourceBranchId} <> ${table.destinationBranchId}`),
]);

export const stockTransferItems = sqliteTable("stock_transfer_items", {
  id: text("id").primaryKey(),
  transferId: text("transfer_id").notNull().references(() => stockTransfers.id),
  productId: text("product_id").notNull().references(() => products.id),
  quantity: real("quantity").notNull(),
}, (table) => [
  uniqueIndex("uq_transfer_items_product").on(table.transferId, table.productId),
  check("transfer_items_quantity_positive", sql`${table.quantity} > 0`),
]);

export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  whatsapp: text("whatsapp").notNull().default(""),
  type: text("type").notNull().default("Ecer"),
  creditLimit: integer("credit_limit").notNull().default(0),
  outstanding: integer("outstanding").notNull().default(0),
  referralCode: text("referral_code"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_customers_name").on(table.name),
  uniqueIndex("uq_customers_whatsapp").on(table.whatsapp),
]);

export const sales = sqliteTable("sales", {
  id: text("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  customerId: text("customer_id").references(() => customers.id),
  subtotal: integer("subtotal").notNull(),
  discount: integer("discount").notNull().default(0),
  deliveryDistance: real("delivery_distance").notNull().default(0),
  deliveryFee: integer("delivery_fee").notNull().default(0),
  deliveryApproval: text("delivery_approval").notNull().default("NOT_REQUIRED"),
  customerPhone: text("customer_phone").notNull().default(""),
  total: integer("total").notNull(),
  paymentMethod: text("payment_method").notNull(),
  paidAmount: integer("paid_amount").notNull(),
  status: text("status").notNull().default("PAID"),
  userEmail: text("user_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_sales_branch_date").on(table.branchId, table.createdAt)]);

export const saleItems = sqliteTable("sale_items", {
  id: text("id").primaryKey(),
  saleId: text("sale_id").notNull().references(() => sales.id),
  productId: text("product_id").notNull().references(() => products.id),
  quantity: real("quantity").notNull(),
  unit: text("unit").notNull(),
  unitPrice: integer("unit_price").notNull(),
  costPrice: integer("cost_price").notNull(),
  lineTotal: integer("line_total").notNull(),
}, (table) => [index("idx_sale_items_sale").on(table.saleId)]);

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  saleId: text("sale_id").notNull().references(() => sales.id),
  method: text("method").notNull(),
  amount: integer("amount").notNull(),
  reference: text("reference").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const receivablePayments = sqliteTable("receivable_payments", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull().references(() => customers.id),
  branchId: text("branch_id").notNull().references(() => branches.id),
  amount: integer("amount").notNull(),
  method: text("method").notNull(),
  referenceNumber: text("reference_number").notNull().unique(),
  userEmail: text("user_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_receivable_payments_customer_date").on(table.customerId, table.createdAt)]);

export const customerReturns = sqliteTable("customer_returns", {
  id: text("id").primaryKey(),
  returnNumber: text("return_number").notNull().unique(),
  saleId: text("sale_id").notNull().references(() => sales.id),
  branchId: text("branch_id").notNull().references(() => branches.id),
  customerId: text("customer_id").references(() => customers.id),
  totalRefund: integer("total_refund").notNull().default(0),
  reason: text("reason").notNull(),
  condition: text("condition").notNull(),
  status: text("status").notNull().default("COMPLETED"),
  userEmail: text("user_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_customer_returns_branch_date").on(table.branchId, table.createdAt),
  index("idx_customer_returns_sale").on(table.saleId),
]);

export const customerReturnItems = sqliteTable("customer_return_items", {
  id: text("id").primaryKey(),
  returnId: text("return_id").notNull().references(() => customerReturns.id),
  productId: text("product_id").notNull().references(() => products.id),
  quantity: real("quantity").notNull(),
  unitPrice: integer("unit_price").notNull(),
  refundAmount: integer("refund_amount").notNull(),
}, (table) => [index("idx_customer_return_items_return").on(table.returnId)]);

export const expenses = sqliteTable("expenses", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  category: text("category").notNull(),
  amount: integer("amount").notNull(),
  paymentMethod: text("payment_method").notNull(),
  description: text("description").notNull().default(""),
  userEmail: text("user_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_expenses_branch_date").on(table.branchId, table.createdAt)]);

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  branchId: text("branch_id"),
  module: text("module").notNull(),
  action: text("action").notNull(),
  referenceNumber: text("reference_number").notNull().default(""),
  details: text("details").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_audit_date").on(table.createdAt)]);
