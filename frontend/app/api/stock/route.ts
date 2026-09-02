import { getD1 } from "@/db";
import { apiError, assertBranchAccess, requireApiUser } from "@/lib/api-auth";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser("stock.adjust");
    const payload = await request.json() as {
      branchId?: string; productId?: string; type?: "IN" | "OUT" | "ADJUST"; quantity?: number; reason?: string;
    };
    const branchId = payload.branchId?.trim();
    const productId = payload.productId?.trim();
    const quantity = Number(payload.quantity);
    if (!branchId || !productId || !["IN", "OUT", "ADJUST"].includes(payload.type ?? "") || !Number.isFinite(quantity) || quantity < 0 || (payload.type !== "ADJUST" && quantity === 0)) {
      return Response.json({ error: "Data perubahan stok belum lengkap." }, { status: 400 });
    }
    assertBranchAccess(user, branchId);

    const d1 = getD1();
    const stock = await d1.prepare(`SELECT s.id,s.warehouse_id AS warehouseId,s.physical_qty AS physicalQty,s.reserved_qty AS reservedQty,s.damaged_qty AS damagedQty
      FROM stocks s WHERE s.branch_id=? AND s.product_id=? ORDER BY s.rowid LIMIT 1`).bind(branchId, productId).first<any>();
    if (!stock) return Response.json({ error: "Lokasi stok produk tidak ditemukan." }, { status: 404 });

    const before = Number(stock.physicalQty);
    const after = payload.type === "IN" ? before + quantity : payload.type === "OUT" ? before - quantity : quantity;
    if (after < Number(stock.reservedQty) + Number(stock.damagedQty)) {
      return Response.json({ error: `Stok tersedia tidak cukup. Stok fisik saat ini ${before}.` }, { status: 409 });
    }

    const id = crypto.randomUUID();
    const reference = `${payload.type === "IN" ? "BM" : payload.type === "OUT" ? "BK" : "ADJ"}-${Date.now().toString().slice(-8)}`;
    const movementType = payload.type === "IN" ? "GOODS_IN" : payload.type === "OUT" ? "GOODS_OUT" : "ADJUSTMENT";
    const movementQuantity = payload.type === "IN" ? quantity : payload.type === "OUT" ? -quantity : after - before;
    const action = payload.type === "IN" ? "Barang masuk" : payload.type === "OUT" ? "Barang keluar" : "Penyesuaian stok";
    const results = await d1.batch([
      d1.prepare("UPDATE stocks SET physical_qty=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND physical_qty=?").bind(after, stock.id, before),
      d1.prepare(`INSERT INTO stock_movements
        (id,reference_number,branch_id,warehouse_id,product_id,movement_type,quantity,stock_before,stock_after,reason,user_email)
        SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM stocks WHERE id=? AND physical_qty=?)`)
        .bind(id, reference, branchId, stock.warehouseId, productId, movementType, movementQuantity, before, after, payload.reason?.trim() || action, user.email, stock.id, after),
      d1.prepare(`INSERT INTO audit_logs (id,user_email,branch_id,module,action,reference_number,details)
        SELECT ?,?,?,'Inventory',?,?,? WHERE EXISTS (SELECT 1 FROM stocks WHERE id=? AND physical_qty=?)`)
        .bind(crypto.randomUUID(), user.email, branchId, action, reference, `${before} → ${after}`, stock.id, after),
    ]);
    if (Number((results[0] as any).meta?.changes ?? 0) !== 1) {
      return Response.json({ error: "Stok baru saja berubah. Silakan ulangi transaksi." }, { status: 409 });
    }
    return Response.json({ ok: true, reference, stockAfter: after });
  } catch (error) {
    return apiError(error);
  }
}
