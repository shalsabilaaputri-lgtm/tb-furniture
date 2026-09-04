import { getDb } from "@/db";
import { apiError, assertBranchAccess, requireApiUser } from "@/lib/api-auth";
import { createReference } from "@/lib/reference";

type ImportItem = { productId?: string; quantity?: number; sourceName?: string };

export async function POST(request: Request) {
  try {
    const user = await requireApiUser("stock.adjust");
    const payload = await request.json() as { branchId?: string; direction?: "IN" | "OUT"; sourceName?: string; reference?: string; items?: ImportItem[] };
    const branchId = payload.branchId?.trim();
    if (!branchId || !["IN", "OUT"].includes(payload.direction || "") || !Array.isArray(payload.items) || !payload.items.length || payload.items.length > 200) {
      return Response.json({ error: "Data impor belum lengkap atau terlalu banyak." }, { status: 400 });
    }
    assertBranchAccess(user, branchId);
    const grouped = new Map<string, { quantity: number; sourceName: string }>();
    for (const item of payload.items) {
      const productId = item.productId?.trim();
      const quantity = Number(item.quantity);
      if (!productId || !Number.isFinite(quantity) || quantity <= 0) return Response.json({ error: "Setiap baris wajib memilih produk dan jumlah lebih dari nol." }, { status: 400 });
      const current = grouped.get(productId) || { quantity: 0, sourceName: item.sourceName?.trim() || "Impor dokumen" };
      current.quantity += quantity;
      grouped.set(productId, current);
    }
    const db = getDb();
    const rows = [] as Array<{ productId: string; quantity: number; sourceName: string; stock: { id: string; warehouseId: string; physicalQty: number; reservedQty: number; damagedQty: number } }>;
    for (const [productId, item] of grouped) {
      const stock = await db.prepare(`SELECT id,warehouse_id AS warehouseId,physical_qty AS physicalQty,reserved_qty AS reservedQty,damaged_qty AS damagedQty
        FROM stocks WHERE branch_id=? AND product_id=? ORDER BY id LIMIT 1`).bind(branchId, productId).first<{ id: string; warehouseId: string; physicalQty: number; reservedQty: number; damagedQty: number }>();
      if (!stock) return Response.json({ error: "Ada produk yang belum memiliki lokasi stok pada cabang ini." }, { status: 409 });
      const after = payload.direction === "IN" ? Number(stock.physicalQty) + item.quantity : Number(stock.physicalQty) - item.quantity;
      if (after < Number(stock.reservedQty) + Number(stock.damagedQty)) return Response.json({ error: `Stok tidak cukup untuk ${item.sourceName}.` }, { status: 409 });
      rows.push({ productId, quantity: item.quantity, sourceName: item.sourceName, stock });
    }
    const reference = (payload.reference || "").trim().slice(0, 120) || createReference(payload.direction === "IN" ? "IMP-BM" : "IMP-BK");
    const movementType = payload.direction === "IN" ? "GOODS_IN" : "GOODS_OUT";
    const action = payload.direction === "IN" ? "Impor barang masuk" : "Impor barang keluar";
    const note = `Impor ${String(payload.sourceName || "dokumen").slice(0, 120)} (berkas asli tidak disimpan)`;
    // One PostgreSQL statement locks, validates, updates, and writes the two
    // ledgers together. A concurrent stock change makes verification false,
    // so this import cannot partially apply only some of its rows.
    const values = rows.map(() => "(?,?,?,?,?,?,?,?,?)").join(",");
    const bindings: unknown[] = [];
    for (const row of rows) {
      const before = Number(row.stock.physicalQty);
      const after = payload.direction === "IN" ? before + row.quantity : before - row.quantity;
      bindings.push(row.stock.id, before, after, row.stock.warehouseId, row.productId, row.quantity, row.sourceName, crypto.randomUUID(), crypto.randomUUID());
    }
    const result = await db.prepare(`
      WITH requested(stock_id,before_qty,after_qty,warehouse_id,product_id,quantity,source_name,movement_id,audit_id) AS (VALUES ${values}),
      locked AS MATERIALIZED (SELECT s.id FROM stocks s JOIN requested r ON r.stock_id=s.id FOR UPDATE),
      verification AS MATERIALIZED (
        SELECT CASE WHEN (SELECT COUNT(*) FROM locked)=(SELECT COUNT(*) FROM requested)
          AND NOT EXISTS (SELECT 1 FROM stocks s JOIN requested r ON r.stock_id=s.id
            WHERE s.physical_qty<>r.before_qty OR r.after_qty<s.reserved_qty+s.damaged_qty)
          THEN 1 ELSE 0 END AS ok
      ),
      updated AS (
        UPDATE stocks s SET physical_qty=r.after_qty,updated_at=CURRENT_TIMESTAMP
        FROM requested r,verification v WHERE s.id=r.stock_id AND v.ok=1 RETURNING s.id
      ),
      movements AS (
        INSERT INTO stock_movements (id,reference_number,branch_id,warehouse_id,product_id,movement_type,quantity,stock_before,stock_after,reason,user_email)
        SELECT r.movement_id,?,?,r.warehouse_id,r.product_id,?,CASE WHEN ?='IN' THEN r.quantity ELSE -r.quantity END,r.before_qty,r.after_qty,?,?
        FROM requested r JOIN updated u ON u.id=r.stock_id CROSS JOIN verification v WHERE v.ok=1 RETURNING id
      ),
      audits AS (
        INSERT INTO audit_logs (id,user_email,branch_id,module,action,reference_number,details)
        SELECT r.audit_id,?,?,'Inventory',?,?,r.source_name||': '||r.before_qty||' → '||r.after_qty
        FROM requested r JOIN updated u ON u.id=r.stock_id CROSS JOIN verification v WHERE v.ok=1 RETURNING id
      )
      SELECT v.ok,(SELECT COUNT(*) FROM updated) AS changed FROM verification v
    `).bind(...bindings, reference, branchId, movementType, payload.direction, note, user.email, user.email, branchId, action, reference).first<{ ok: number; changed: number }>();
    if (Number(result?.ok) !== 1 || Number(result?.changed) !== rows.length) return Response.json({ error: "Ada stok yang baru berubah. Muat ulang, lalu ulangi impor agar seluruh data konsisten." }, { status: 409 });
    return Response.json({ ok: true, reference, itemCount: rows.length });
  } catch (error) {
    return apiError(error);
  }
}
