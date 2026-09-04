import { getDb } from "@/db";
import { apiError, assertBranchAccess, requireApiUser } from "@/lib/api-auth";
import { can } from "@/lib/access";
import { createReference } from "@/lib/reference";

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
      customerName?: string;
      customerCreditLimit?: number;
      paymentMethod?: string;
      paidAmount?: number;
      creditDueRule?: "BEFORE_DELIVERY" | "AFTER_DELIVERY" | "DATE";
      creditDueDate?: string;
    };
    const branchId = body.branchId?.trim();
    const submittedItems = body.items ?? [];
    const items = submittedItems.filter((item) => item.productId && Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0 && Number.isFinite(Number(item.unitPrice)) && Number(item.unitPrice) >= 0);
    if (!branchId || !items.length || items.length !== submittedItems.length) {
      return Response.json({ error: "Cabang dan produk penjualan wajib dipilih." }, { status: 400 });
    }
    assertBranchAccess(user, branchId);

    const d1 = getDb();
    const resolved = [] as Array<CartItem & {
      name: string; unit: string; costPrice: number; minimumPrice: number; sellingPrice: number;
      stockId: string; warehouseId: string; before: number; after: number;
    }>;
    for (const item of items) {
      const row = await d1.prepare(`SELECT p.name,p.unit,p.landed_cost AS costPrice,p.minimum_price AS minimumPrice,p.selling_price AS sellingPrice,
        s.id AS stockId,s.warehouse_id AS warehouseId,s.physical_qty AS physicalQty,
        s.reserved_qty AS reservedQty,s.damaged_qty AS damagedQty
        FROM products p JOIN stocks s ON s.product_id=p.id
        WHERE p.id=? AND s.branch_id=? ORDER BY s.rowid LIMIT 1`).bind(item.productId, branchId).first<any>();
      if (!row) return Response.json({ error: "Produk atau lokasi stok tidak ditemukan." }, { status: 404 });
      const quantity = Number(item.quantity);
      // The selling price is master data controlled by the owner. Never trust
      // a price supplied by a browser, which can otherwise be modified by a cashier.
      const unitPrice = Math.round(Number(row.sellingPrice));
      const available = Number(row.physicalQty) - Number(row.reservedQty) - Number(row.damagedQty);
      if (quantity > available) {
        return Response.json({ error: `${row.name}: stok tersedia hanya ${available} ${row.unit}.` }, { status: 409 });
      }
      resolved.push({
        ...item, quantity, unitPrice, name: row.name, unit: row.unit,
        costPrice: Number(row.costPrice), minimumPrice: Number(row.minimumPrice), sellingPrice: Number(row.sellingPrice),
        stockId: row.stockId, warehouseId: row.warehouseId,
        before: Number(row.physicalQty), after: Number(row.physicalQty) - quantity,
      });
    }

    if (!Number.isFinite(Number(body.discount ?? 0)) || !Number.isFinite(Number(body.deliveryDistance ?? 0)) || !Number.isFinite(Number(body.deliveryFee ?? 0)) || !Number.isFinite(Number(body.paidAmount ?? 0))) {
      return Response.json({ error: "Nominal transaksi tidak valid." }, { status: 400 });
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
    let customerId = body.customerId?.trim() || "";
    let customerName = String(body.customerName || "").trim();
    const customerPhone = String(body.customerPhone || "").trim();
    const dueRule = isCredit ? body.creditDueRule : undefined;
    const dueDate = dueRule === "DATE" ? String(body.creditDueDate || "").trim() : null;
    if (isCredit && !["BEFORE_DELIVERY", "AFTER_DELIVERY", "DATE"].includes(dueRule || "")) {
      return Response.json({ error: "Pilih batas pembayaran piutang." }, { status: 400 });
    }
    if (dueRule === "DATE" && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate || "")) {
      return Response.json({ error: "Tanggal jatuh tempo piutang belum valid." }, { status: 400 });
    }
    let customer: any = null;
    let newCustomer = false;
    if (isCredit && !customerId) {
      if (!customerName || !customerPhone.replace(/\D/g, "")) {
        return Response.json({ error: "Piutang wajib diisi nama dan nomor WhatsApp customer." }, { status: 400 });
      }
      customer = await d1.prepare("SELECT id,name,credit_limit AS creditLimit,outstanding FROM customers WHERE whatsapp=?").bind(customerPhone).first<any>();
      if (customer) {
        customerId = String(customer.id);
        customerName = String(customer.name);
      } else {
        customerId = crypto.randomUUID();
        newCustomer = true;
        customer = { creditLimit: Math.max(total, Math.round(Number(body.customerCreditLimit) || 0)), outstanding: 0 };
      }
    } else if (customerId) {
      customer = await d1.prepare("SELECT id,name,credit_limit AS creditLimit,outstanding FROM customers WHERE id=?").bind(customerId).first<any>();
      if (!customer) return Response.json({ error: "Customer tidak ditemukan." }, { status: 404 });
      customerName = String(customer.name);
    }
    if (isCredit && (!customer || Number(customer.outstanding) + (total - paidAmount) > Number(customer.creditLimit))) {
      return Response.json({ error: "Transaksi melebihi batas kredit customer dan memerlukan persetujuan." }, { status: 409 });
    }

    const saleId = crypto.randomUUID();
    const invoiceNumber = createReference(`INV-${branchId.toUpperCase()}`);
    const invoiceToken = crypto.randomUUID();
    const statements: any[] = [];
    if (newCustomer) {
      statements.push(d1.prepare(`INSERT INTO customers (id,name,whatsapp,type,credit_limit,outstanding)
        VALUES (?,?,?,'Ecer',?,0)`).bind(customerId, customerName, customerPhone, Number(customer.creditLimit)));
    }
    for (const item of resolved) {
      statements.push(d1.prepare("UPDATE stocks SET physical_qty=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND physical_qty=?").bind(item.after, item.stockId, item.before));
    }

    const conditions = resolved.map(() => "(id=? AND physical_qty=?)").join(" OR ");
    const conditionBindings = resolved.flatMap((item) => [item.stockId, item.after]);
    statements.push(
      d1.prepare(`INSERT INTO sales
        (id,invoice_number,branch_id,customer_id,customer_name,subtotal,discount,delivery_distance,delivery_fee,delivery_approval,customer_phone,total,payment_method,paid_amount,credit_due_rule,credit_due_date,invoice_token,status,user_email)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
        WHERE (SELECT COUNT(*) FROM stocks WHERE ${conditions})=?`)
        .bind(saleId, invoiceNumber, branchId, customerId || null, customerName || "Customer Umum", subtotal, discount, deliveryDistance, deliveryFee, deliveryApproval, customerPhone, total, paymentMethod, paidAmount, dueRule || null, dueDate, invoiceToken, isCredit && paidAmount < total ? "PARTIAL" : "PAID", user.email, ...conditionBindings, resolved.length),
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
    if (isCredit && customerId && total > paidAmount) {
      statements.push(d1.prepare("UPDATE customers SET outstanding=outstanding+? WHERE id=?").bind(total - paidAmount, customerId));
    }
    statements.push(d1.prepare("INSERT INTO audit_logs (id,user_email,branch_id,module,action,reference_number,details) VALUES (?,?,?,'Sales','Transaksi POS',?,?)")
      .bind(crypto.randomUUID(), user.email, branchId, invoiceNumber, `Total ${total}`));

    await d1.batch(statements);
    return Response.json({ ok: true, invoiceNumber, invoiceToken, customerId: customerId || null, customerName: customerName || "Customer Umum", total, paidAmount, deliveryFee, deliveryDistance, deliveryApproval, creditDueRule: dueRule || null, creditDueDate: dueDate }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
