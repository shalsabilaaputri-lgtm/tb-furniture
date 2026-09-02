import { getD1 } from "@/db";
import { apiError, assertBranchAccess, requireApiUser } from "@/lib/api-auth";
import { can } from "@/lib/access";

type CartItem = { productId: string; quantity: number; unitPrice: number };

export async function POST(request: Request) {
  try {
    const user = await requireApiUser("sales.create");
    const body = await request.json() as {
      branchId?: string;
      customerId?: string | null;
      items?: CartItem[];
      discount?: number;
      deliveryDistance?: number;
      deliveryFee?: number;
      ownerDeliveryApproval?: boolean;
      customerPhone?: string;
      paymentMethod?: string;
      paidAmount?: number;
    };
    const branchId = body.branchId?.trim();
    const items = (body.items ?? []).filter((item) => item.productId && Number(item.quantity) > 0);
    if (!branchId || !items.length) {
      return Response.json({ error: "Cabang dan produk penjualan wajib dipilih." }, { status: 400 });
    }
    assertBranchAccess(user, branchId);

    const d1 = getD1();
    const resolved = [] as Array<CartItem & {
      name: string; unit: string; costPrice: number; minimumPrice: number;
      stockId: string; warehouseId: string; before: number; after: number;
    }>;
    for (const item of items) {
      const row = await d1.prepare(`SELECT p.name,p.unit,p.landed_cost AS costPrice,p.minimum_price AS minimumPrice,
        s.id AS stockId,s.warehouse_id AS warehouseId,s.physical_qty AS physicalQty,
        s.reserved_qty AS reservedQty,s.damaged_qty AS damagedQty
        FROM products p JOIN stocks s ON s.product_id=p.id
        WHERE p.id=? AND s.branch_id=? ORDER BY s.rowid LIMIT 1`).bind(item.productId, branchId).first<any>();
      if (!row) return Response.json({ error: "Produk atau lokasi stok tidak ditemukan." }, { status: 404 });
      const quantity = Number(item.quantity);
      const unitPrice = Math.round(Number(item.unitPrice));
      const available = Number(row.physicalQty) - Number(row.reservedQty) - Number(row.damagedQty);
      if (quantity > available) {
        return Response.json({ error: `${row.name}: stok tersedia hanya ${available} ${row.unit}.` }, { status: 409 });
      }
      if (unitPrice < Number(row.minimumPrice)) {
        return Response.json({ error: `${row.name}: harga di bawah batas minimum memerlukan persetujuan manajer.` }, { status: 409 });
      }
      resolved.push({
        ...item, quantity, unitPrice, name: row.name, unit: row.unit,
        costPrice: Number(row.costPrice), minimumPrice: Number(row.minimumPrice),
        stockId: row.stockId, warehouseId: row.warehouseId,
        before: Number(row.physicalQty), after: Number(row.physicalQty) - quantity,
      });
    }

    const subtotal = resolved.reduce((sum, item) => sum + Math.round(item.quantity * item.unitPrice), 0);
    const discount = Math.max(0, Math.round(Number(body.discount) || 0));
    if (discount > subtotal) {
      return Response.json({ error: "Diskon tidak boleh melebihi subtotal." }, { status: 409 });
    }
    const deliveryDistance = Math.max(0, Number(body.deliveryDistance) || 0);
    let deliveryFee = 0;
    let deliveryApproval = "NOT_REQUIRED";
    if (deliveryDistance > 0 && deliveryDistance <= 5) deliveryFee = 25000;
    else if (deliveryDistance > 5 && deliveryDistance <= 10) deliveryFee = 50000;
    else if (deliveryDistance > 10 && deliveryDistance <= 20) deliveryFee = 75000;
    else if (deliveryDistance > 20) {
      if (!body.ownerDeliveryApproval) {
        return Response.json({ error: "Pengiriman lebih dari 20 km harus mendapat persetujuan owner." }, { status: 409 });
      }
      if (!can(user, "delivery.approve")) {
        return Response.json({ error: "Persetujuan ongkir ini hanya dapat dilakukan owner, admin, atau manager." }, { status: 403 });
      }
      deliveryFee = Math.max(0, Math.round(Number(body.deliveryFee) || 0));
      deliveryApproval = "OWNER";
    }
    const total = subtotal - discount + deliveryFee;
    const paymentMethod = String(body.paymentMethod || "Cash");
    const isCredit = paymentMethod === "Piutang";
    const paidAmount = isCredit ? Math.max(0, Math.min(total, Math.round(Number(body.paidAmount) || 0))) : total;

    if (isCredit && !body.customerId) {
      return Response.json({ error: "Penjualan piutang harus memilih customer." }, { status: 400 });
    }
    if (isCredit && body.customerId) {
      const customer = await d1.prepare("SELECT credit_limit AS creditLimit,outstanding FROM customers WHERE id=?").bind(body.customerId).first<any>();
      if (!customer || Number(customer.outstanding) + (total - paidAmount) > Number(customer.creditLimit)) {
        return Response.json({ error: "Transaksi melebihi batas kredit customer dan memerlukan persetujuan." }, { status: 409 });
      }
    }

    const saleId = crypto.randomUUID();
    const invoiceNumber = `INV-${branchId.toUpperCase()}-${Date.now().toString().slice(-9)}`;
    const statements: any[] = [];
    for (const item of resolved) {
      statements.push(d1.prepare("UPDATE stocks SET physical_qty=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND physical_qty=?").bind(item.after, item.stockId, item.before));
    }

    const conditions = resolved.map(() => "(id=? AND physical_qty=?)").join(" OR ");
    const conditionBindings = resolved.flatMap((item) => [item.stockId, item.after]);
    statements.push(
      d1.prepare(`INSERT INTO sales
        (id,invoice_number,branch_id,customer_id,subtotal,discount,delivery_distance,delivery_fee,delivery_approval,customer_phone,total,payment_method,paid_amount,status,user_email)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
        WHERE (SELECT COUNT(*) FROM stocks WHERE ${conditions})=?`)
        .bind(saleId, invoiceNumber, branchId, body.customerId || null, subtotal, discount, deliveryDistance, deliveryFee, deliveryApproval, String(body.customerPhone || ""), total, paymentMethod, paidAmount, isCredit && paidAmount < total ? "PARTIAL" : "PAID", user.email, ...conditionBindings, resolved.length),
    );

    for (const item of resolved) {
      statements.push(
        d1.prepare(`INSERT INTO sale_items (id,sale_id,product_id,quantity,unit,unit_price,cost_price,line_total)
          VALUES (?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), saleId, item.productId, item.quantity, item.unit, item.unitPrice, item.costPrice, Math.round(item.quantity * item.unitPrice)),
      );
      statements.push(
        d1.prepare(`INSERT INTO stock_movements
          (id,reference_number,branch_id,warehouse_id,product_id,movement_type,quantity,stock_before,stock_after,reason,user_email)
          VALUES (?,?,?,?,?,'SALE',?,?,?,?,?)`)
          .bind(crypto.randomUUID(), invoiceNumber, branchId, item.warehouseId, item.productId, -item.quantity, item.before, item.after, "Penjualan POS", user.email),
      );
    }

    if (paidAmount > 0) {
      statements.push(d1.prepare("INSERT INTO payments (id,sale_id,method,amount,reference) VALUES (?,?,?,?,?)")
        .bind(crypto.randomUUID(), saleId, paymentMethod, paidAmount, ""));
    }
    if (isCredit && body.customerId && total > paidAmount) {
      statements.push(d1.prepare("UPDATE customers SET outstanding=outstanding+? WHERE id=?").bind(total - paidAmount, body.customerId));
    }
    statements.push(d1.prepare("INSERT INTO audit_logs (id,user_email,branch_id,module,action,reference_number,details) VALUES (?,?,?,'Sales','Transaksi POS',?,?)")
      .bind(crypto.randomUUID(), user.email, branchId, invoiceNumber, `Total ${total}`));

    await d1.batch(statements);
    return Response.json({ ok: true, invoiceNumber, total, paidAmount, deliveryFee, deliveryDistance, deliveryApproval }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
