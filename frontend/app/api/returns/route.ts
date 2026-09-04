import { getDb } from "@/db";
import { apiError, assertBranchAccess, requireApiUser } from "@/lib/api-auth";
import { createReference } from "@/lib/reference";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser("sales.return");
    const body = await request.json() as { saleId?: string; productId?: string; quantity?: number; condition?: string; reason?: string };
    const quantity = Number(body.quantity);
    if (!body.saleId || !body.productId || !Number.isFinite(quantity) || quantity <= 0 || !body.reason?.trim() || !["LAYAK_JUAL","RUSAK"].includes(body.condition ?? "")) {
      return Response.json({ error: "Data retur belum lengkap." }, { status: 400 });
    }
    const d1 = getDb();
    const item = await d1.prepare(`SELECT s.branch_id AS branchId,s.customer_id AS customerId,s.payment_method AS paymentMethod,
      si.unit_price AS unitPrice,si.quantity AS soldQty,
      COALESCE((SELECT SUM(cri.quantity) FROM customer_return_items cri JOIN customer_returns cr ON cr.id=cri.return_id WHERE cr.sale_id=s.id AND cri.product_id=si.product_id),0) AS returnedQty,
      st.id AS stockId,st.warehouse_id AS warehouseId,st.physical_qty AS physicalQty,st.damaged_qty AS damagedQty
      FROM sales s JOIN sale_items si ON si.sale_id=s.id
      JOIN stocks st ON st.product_id=si.product_id AND st.branch_id=s.branch_id
      WHERE s.id=? AND si.product_id=? ORDER BY st.rowid LIMIT 1`).bind(body.saleId, body.productId).first<any>();
    if (!item) return Response.json({ error: "Produk pada transaksi tidak ditemukan." }, { status: 404 });
    assertBranchAccess(user, item.branchId);
    if (quantity > Number(item.soldQty) - Number(item.returnedQty)) {
      return Response.json({ error: "Jumlah retur melebihi jumlah yang dapat diretur." }, { status: 409 });
    }
    const before = Number(item.physicalQty);
    const after = before + quantity;
    const damagedAfter = Number(item.damagedQty) + (body.condition === "RUSAK" ? quantity : 0);
    const refund = Math.round(quantity * Number(item.unitPrice));
    const returnId = crypto.randomUUID();
    const returnNumber = createReference("RET");
    const statements: any[] = [
      d1.prepare("UPDATE stocks SET physical_qty=?,damaged_qty=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND physical_qty=? AND damaged_qty=?").bind(after, damagedAfter, item.stockId, before, item.damagedQty),
      d1.prepare(`INSERT INTO customer_returns (id,return_number,sale_id,branch_id,customer_id,total_refund,reason,condition,status,user_email)
        SELECT ?,?,?,?,?,?,?,?,'COMPLETED',? WHERE EXISTS (SELECT 1 FROM stocks WHERE id=? AND physical_qty=? AND damaged_qty=?)`)
        .bind(returnId, returnNumber, body.saleId, item.branchId, item.customerId, refund, body.reason.trim(), body.condition, user.email, item.stockId, after, damagedAfter),
      d1.prepare("INSERT INTO customer_return_items (id,return_id,product_id,quantity,unit_price,refund_amount) VALUES (?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), returnId, body.productId, quantity, item.unitPrice, refund),
      d1.prepare(`INSERT INTO stock_movements
        (id,reference_number,branch_id,warehouse_id,product_id,movement_type,quantity,stock_before,stock_after,reason,user_email)
        VALUES (?,?,?,?,?,'CUSTOMER_RETURN',?,?,?,?,?)`)
        .bind(crypto.randomUUID(), returnNumber, item.branchId, item.warehouseId, body.productId, quantity, before, after, body.reason.trim(), user.email),
      d1.prepare("INSERT INTO audit_logs (id,user_email,branch_id,module,action,reference_number,details) VALUES (?,?,?,'Return','Retur customer',?,?)")
        .bind(crypto.randomUUID(), user.email, item.branchId, returnNumber, `Refund ${refund}; kondisi ${body.condition}`),
    ];
    if (item.paymentMethod === "Piutang" && item.customerId) {
      statements.push(d1.prepare("UPDATE customers SET outstanding=MAX(0,outstanding-?) WHERE id=?").bind(refund, item.customerId));
    }
    await d1.batch(statements);
    return Response.json({ ok: true, returnNumber, refund }, { status: 201 });
  } catch (error) { return apiError(error); }
}
