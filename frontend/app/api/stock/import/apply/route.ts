import { getDb } from "@/db";
import { apiError, assertBranchAccess, requireApiUser } from "@/lib/api-auth";
import { can } from "@/lib/access";
import { createReference } from "@/lib/reference";

export const runtime = "nodejs";
export const maxDuration = 60;

type ImportItem = {
  productId?: string; createNew?: boolean; quantity?: number; sourceName?: string;
  sku?: string; barcode?: string; brand?: string; series?: string; size?: string; unit?: string;
};

export async function POST(request: Request) {
  try {
    const user = await requireApiUser("stock.adjust");
    const payload = await request.json() as { branchId?: string; direction?: "IN" | "OUT" | "ADJUST"; sourceName?: string; reference?: string; items?: ImportItem[] };
    console.info("[stock-import.apply] received", { branchId: payload.branchId, direction: payload.direction, itemCount: payload.items?.length || 0 });
    const branchId = payload.branchId?.trim();
    if (!branchId || !["IN", "OUT", "ADJUST"].includes(payload.direction || "") || !Array.isArray(payload.items) || !payload.items.length || payload.items.length > 200) {
      return Response.json({ error: "Data impor belum lengkap atau terlalu banyak." }, { status: 400 });
    }
    assertBranchAccess(user, branchId);
    const db = getDb();
    const resolvedItems: Array<ImportItem & { productId: string }> = [];
    const newItems = payload.items.filter((item) => !item.productId?.trim());
    if (newItems.length && !can(user, "product.create")) {
      return Response.json({ error: "Akun Anda boleh mengubah stok, tetapi tidak boleh membuat produk baru dari impor." }, { status: 403 });
    }
    if (newItems.some((item) => item.createNew === false || !item.sourceName?.trim())) {
      return Response.json({ error: "Produk yang belum ada harus disimpan memakai nama yang tertulis di dokumen." }, { status: 400 });
    }
    if (newItems.length) {
      const warehouses = await db.prepare("SELECT b.id AS branchId,MIN(w.id) AS warehouseId FROM branches b JOIN warehouses w ON w.branch_id=b.id WHERE b.is_active=1 GROUP BY b.id").all<{ branchId: string; warehouseId: string }>();
      if (!warehouses.results.some((warehouse) => warehouse.branchId === branchId)) return Response.json({ error: "Gudang cabang tujuan belum tersedia." }, { status: 409 });
      const created = new Map<ImportItem, string>();
      const statements = [];
      for (const item of newItems) {
        const id = crypto.randomUUID();
        const sku = createReference("IMP");
        created.set(item, id);
        statements.push(
          db.prepare(`INSERT INTO products (id,sku,barcode,name,brand,category,series,size,unit,is_active)
            VALUES (?,?,?,?,?,?,?,?,?,1)`).bind(
            id, sku, item.barcode?.trim() || null, item.sourceName!.trim().slice(0, 240),
            item.brand?.trim() || "Tanpa merek", "Impor Excel", item.series?.trim() || "", item.size?.trim() || "", item.unit?.trim() || "dus",
          ),
          db.prepare("INSERT INTO audit_logs (id,user_email,module,action,reference_number,details) VALUES (?,?,'Product','Tambah dari impor',?,?)")
            .bind(crypto.randomUUID(), user.email, sku, item.sourceName!.trim().slice(0, 240)),
        );
        for (const warehouse of warehouses.results) {
          statements.push(db.prepare(`INSERT INTO stocks (id,branch_id,warehouse_id,product_id,batch,shade,physical_qty,reserved_qty,damaged_qty)
            VALUES (?,?,?,?, 'REGULER','STD',0,0,0)`).bind(crypto.randomUUID(), warehouse.branchId, warehouse.warehouseId, id));
        }
      }
      await db.batch(statements);
      console.info("[stock-import.apply] products-created", { branchId, productCount: newItems.length });
      for (const item of newItems) resolvedItems.push({ ...item, productId: created.get(item)! });
    }
    for (const item of payload.items) if (item.productId?.trim()) resolvedItems.push({ ...item, productId: item.productId.trim() });
    const grouped = new Map<string, { quantity: number; sourceName: string }>();
    for (const item of resolvedItems) {
      const productId = item.productId;
      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) return Response.json({ error: "Setiap baris wajib memiliki jumlah lebih dari nol." }, { status: 400 });
      if (payload.direction === "ADJUST" && grouped.has(productId)) return Response.json({ error: "Stok opname hanya boleh memiliki satu baris untuk setiap produk." }, { status: 400 });
      const current = grouped.get(productId) || { quantity: 0, sourceName: item.sourceName?.trim() || "Impor dokumen" };
      current.quantity += quantity;
      grouped.set(productId, current);
    }
    const rows = [] as Array<{ productId: string; quantity: number; sourceName: string; stock: { id: string; warehouseId: string; physicalQty: number; reservedQty: number; damagedQty: number } }>;
    for (const [productId, item] of grouped) {
      const stock = await db.prepare(`SELECT id,warehouse_id AS warehouseId,physical_qty AS physicalQty,reserved_qty AS reservedQty,damaged_qty AS damagedQty
        FROM stocks WHERE branch_id=? AND product_id=? ORDER BY id LIMIT 1`).bind(branchId, productId).first<{ id: string; warehouseId: string; physicalQty: number; reservedQty: number; damagedQty: number }>();
      if (!stock) return Response.json({ error: "Ada produk yang belum memiliki lokasi stok pada cabang ini." }, { status: 409 });
      const after = payload.direction === "IN" ? Number(stock.physicalQty) + item.quantity : payload.direction === "OUT" ? Number(stock.physicalQty) - item.quantity : item.quantity;
      if (after < Number(stock.reservedQty) + Number(stock.damagedQty)) return Response.json({ error: `Stok tidak cukup untuk ${item.sourceName}.` }, { status: 409 });
      rows.push({ productId, quantity: item.quantity, sourceName: item.sourceName, stock });
    }
    const reference = (payload.reference || "").trim().slice(0, 120) || createReference(payload.direction === "IN" ? "IMP-BM" : payload.direction === "OUT" ? "IMP-BK" : "IMP-OPN");
    const movementType = payload.direction === "IN" ? "GOODS_IN" : payload.direction === "OUT" ? "GOODS_OUT" : "ADJUSTMENT";
    const action = payload.direction === "IN" ? "Impor barang masuk" : payload.direction === "OUT" ? "Impor barang keluar" : "Impor stok opname";
    const note = `Impor ${String(payload.sourceName || "dokumen").slice(0, 120)} (berkas asli tidak disimpan)`;
    // One PostgreSQL statement locks, validates, updates, and writes the two
    // ledgers together. A concurrent stock change makes verification false,
    // so this import cannot partially apply only some of its rows.
    // PostgreSQL infers bare VALUES parameters as text in this CTE. Cast each
    // value explicitly so stock comparisons remain numeric on Neon.
    const values = rows.map(() => "(?::text,?::double precision,?::double precision,?::text,?::text,?::double precision,?::text,?::text,?::text)").join(",");
    const bindings: unknown[] = [];
    for (const row of rows) {
      const before = Number(row.stock.physicalQty);
      const after = payload.direction === "IN" ? before + row.quantity : payload.direction === "OUT" ? before - row.quantity : row.quantity;
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
        SELECT r.movement_id,?,?,r.warehouse_id,r.product_id,?,CASE WHEN ?='IN' THEN r.quantity WHEN ?='OUT' THEN -r.quantity ELSE r.after_qty-r.before_qty END,r.before_qty,r.after_qty,?,?
        FROM requested r JOIN updated u ON u.id=r.stock_id CROSS JOIN verification v WHERE v.ok=1 RETURNING id
      ),
      audits AS (
        INSERT INTO audit_logs (id,user_email,branch_id,module,action,reference_number,details)
        SELECT r.audit_id,?,?,'Inventory',?,?,r.source_name||': '||r.before_qty||' → '||r.after_qty
        FROM requested r JOIN updated u ON u.id=r.stock_id CROSS JOIN verification v WHERE v.ok=1 RETURNING id
      )
      SELECT v.ok,(SELECT COUNT(*) FROM updated) AS changed FROM verification v
    `).bind(...bindings, reference, branchId, movementType, payload.direction, payload.direction, note, user.email, user.email, branchId, action, reference).first<{ ok: number; changed: number }>();
    if (Number(result?.ok) !== 1 || Number(result?.changed) !== rows.length) return Response.json({ error: "Ada stok yang baru berubah. Muat ulang, lalu ulangi impor agar seluruh data konsisten." }, { status: 409 });
    console.info("[stock-import.apply] completed", { branchId, reference, itemCount: rows.length });
    return Response.json({ ok: true, reference, itemCount: rows.length });
  } catch (error) {
    return apiError(error);
  }
}
