import { getDb } from "@/db";
import { apiError, assertBranchAccess, requireApiUser } from "@/lib/api-auth";
import { createReference } from "@/lib/reference";

type TransferItem = { productId?: string; quantity?: number };

export async function GET(request: Request) {
  try {
    const user = await requireApiUser("transfer.read");
    const branchParam = new URL(request.url).searchParams.get("branchId");
    const branchId = branchParam && branchParam !== "all" ? branchParam : null;
    if (branchId) assertBranchAccess(user, branchId);
    const d1 = getDb();
    const result = await d1.prepare(`SELECT t.id,t.transfer_number AS transferNumber,
      t.source_branch_id AS sourceBranchId,sb.short_name AS sourceBranchName,
      t.destination_branch_id AS destinationBranchId,db.short_name AS destinationBranchName,
      t.status,t.note,t.requested_by AS requestedBy,t.approved_by AS approvedBy,
      t.shipped_by AS shippedBy,t.received_by AS receivedBy,t.created_at AS createdAt,
      ti.product_id AS productId,p.name AS productName,p.unit,ti.quantity
      FROM stock_transfers t
      JOIN branches sb ON sb.id=t.source_branch_id JOIN branches db ON db.id=t.destination_branch_id
      JOIN stock_transfer_items ti ON ti.transfer_id=t.id JOIN products p ON p.id=ti.product_id
      WHERE (?::text IS NULL OR t.source_branch_id=? OR t.destination_branch_id=?)
        AND (?=1 OR t.source_branch_id=? OR t.destination_branch_id=?)
      ORDER BY t.created_at DESC,t.rowid DESC LIMIT 200`)
      .bind(branchId, branchId, branchId, user.roleCode === "OWNER" || user.permissions.includes("branch.read_all") ? 1 : 0, user.branchId, user.branchId)
      .all<any>();
    const map = new Map<string, any>();
    for (const row of result.results) {
      if (!map.has(row.id)) map.set(row.id, { ...row, productId: undefined, productName: undefined, unit: undefined, quantity: undefined, items: [] });
      map.get(row.id).items.push({ productId: row.productId, productName: row.productName, unit: row.unit, quantity: Number(row.quantity) });
    }
    return Response.json(Array.from(map.values()));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser("transfer.request");
    const body = await request.json() as {
      sourceBranchId?: string; destinationBranchId?: string; items?: TransferItem[]; note?: string;
    };
    const sourceBranchId = body.sourceBranchId?.trim();
    const destinationBranchId = body.destinationBranchId?.trim();
    const submittedItems = body.items ?? [];
    const items = submittedItems.map((item) => ({ productId: String(item.productId || ""), quantity: Number(item.quantity) })).filter((item) => item.productId && Number.isFinite(item.quantity) && item.quantity > 0);
    if (!sourceBranchId || !destinationBranchId || sourceBranchId === destinationBranchId || !items.length || items.length !== submittedItems.length) {
      return Response.json({ error: "Cabang asal, tujuan, dan barang transfer wajib diisi." }, { status: 400 });
    }
    if (new Set(items.map((item) => item.productId)).size !== items.length) {
      return Response.json({ error: "Produk yang sama tidak boleh berulang." }, { status: 400 });
    }
    assertBranchAccess(user, sourceBranchId);
    const d1 = getDb();
    const [sourceWarehouse, destinationWarehouse] = await Promise.all([
      d1.prepare("SELECT id FROM warehouses WHERE branch_id=? ORDER BY rowid LIMIT 1").bind(sourceBranchId).first<{ id: string }>(),
      d1.prepare("SELECT id FROM warehouses WHERE branch_id=? ORDER BY rowid LIMIT 1").bind(destinationBranchId).first<{ id: string }>(),
    ]);
    if (!sourceWarehouse || !destinationWarehouse) return Response.json({ error: "Gudang asal atau tujuan belum tersedia." }, { status: 404 });
    const id = crypto.randomUUID();
    const transferNumber = createReference("TRF");
    await d1.batch([
      d1.prepare(`INSERT INTO stock_transfers
        (id,transfer_number,source_branch_id,source_warehouse_id,destination_branch_id,destination_warehouse_id,status,note,requested_by)
        VALUES (?,?,?,?,?,?,'REQUESTED',?,?)`)
        .bind(id, transferNumber, sourceBranchId, sourceWarehouse.id, destinationBranchId, destinationWarehouse.id, body.note?.trim() || "", user.email),
      ...items.map((item) => d1.prepare("INSERT INTO stock_transfer_items (id,transfer_id,product_id,quantity) VALUES (?,?,?,?)")
        .bind(crypto.randomUUID(), id, item.productId, item.quantity)),
      d1.prepare("INSERT INTO audit_logs (id,user_email,branch_id,module,action,reference_number,details) VALUES (?,?,?,'Inventory','Permintaan transfer',?,?)")
        .bind(crypto.randomUUID(), user.email, sourceBranchId, transferNumber, `${items.length} item ke ${destinationBranchId}`),
    ]);
    return Response.json({ ok: true, id, transferNumber }, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { id?: string; action?: "APPROVE" | "DISPATCH" | "RECEIVE" };
    if (!body.id || !body.action) return Response.json({ error: "Transfer dan tindakan wajib dipilih." }, { status: 400 });
    const permission = body.action === "APPROVE" ? "transfer.approve" : body.action === "DISPATCH" ? "transfer.dispatch" : "transfer.receive";
    const user = await requireApiUser(permission);
    const d1 = getDb();
    const transfer = await d1.prepare(`SELECT id,transfer_number AS transferNumber,source_branch_id AS sourceBranchId,
      source_warehouse_id AS sourceWarehouseId,destination_branch_id AS destinationBranchId,
      destination_warehouse_id AS destinationWarehouseId,status FROM stock_transfers WHERE id=?`).bind(body.id).first<any>();
    if (!transfer) return Response.json({ error: "Transfer tidak ditemukan." }, { status: 404 });

    if (body.action === "APPROVE") {
      assertBranchAccess(user, transfer.sourceBranchId);
      const result = await d1.prepare("UPDATE stock_transfers SET status='APPROVED',approved_by=?,approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='REQUESTED'")
        .bind(user.email, body.id).run();
      if (!Number(result.meta.changes)) return Response.json({ error: "Transfer sudah diproses atau tidak dapat disetujui." }, { status: 409 });
    }

    if (body.action === "DISPATCH") {
      assertBranchAccess(user, transfer.sourceBranchId);
      const results = await d1.batch([
        d1.prepare(`UPDATE stock_transfers SET status='DISPATCHING',updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND status='APPROVED' AND NOT EXISTS (
            SELECT 1 FROM stock_transfer_items ti LEFT JOIN stocks s
              ON s.product_id=ti.product_id AND s.branch_id=? AND s.warehouse_id=?
            WHERE ti.transfer_id=? AND (s.id IS NULL OR s.physical_qty-s.reserved_qty-s.damaged_qty<ti.quantity)
          ) AND NOT EXISTS (
            SELECT 1 FROM stock_transfer_items ti JOIN stocks s
              ON s.product_id=ti.product_id AND s.branch_id=? AND s.warehouse_id=?
            WHERE ti.transfer_id=? GROUP BY ti.product_id HAVING COUNT(s.id)<>1
          )`).bind(body.id, transfer.sourceBranchId, transfer.sourceWarehouseId, body.id, transfer.sourceBranchId, transfer.sourceWarehouseId, body.id),
        d1.prepare(`INSERT INTO stock_movements
          (id,reference_number,branch_id,warehouse_id,product_id,movement_type,quantity,stock_before,stock_after,reason,user_email)
          SELECT LOWER(HEX(RANDOMBLOB(16))),t.transfer_number,t.source_branch_id,t.source_warehouse_id,ti.product_id,
            'TRANSFER_OUT',-ti.quantity,s.physical_qty,s.physical_qty-ti.quantity,'Transfer antar cabang',?
          FROM stock_transfers t JOIN stock_transfer_items ti ON ti.transfer_id=t.id
          JOIN stocks s ON s.product_id=ti.product_id AND s.branch_id=t.source_branch_id AND s.warehouse_id=t.source_warehouse_id
          WHERE t.id=? AND t.status='DISPATCHING'`).bind(user.email, body.id),
        d1.prepare(`UPDATE stocks SET physical_qty=physical_qty-(SELECT ti.quantity FROM stock_transfer_items ti WHERE ti.transfer_id=? AND ti.product_id=stocks.product_id),updated_at=CURRENT_TIMESTAMP
          WHERE branch_id=? AND warehouse_id=? AND product_id IN (SELECT product_id FROM stock_transfer_items WHERE transfer_id=?)
            AND EXISTS (SELECT 1 FROM stock_transfers WHERE id=? AND status='DISPATCHING')`)
          .bind(body.id, transfer.sourceBranchId, transfer.sourceWarehouseId, body.id, body.id),
        d1.prepare("UPDATE stock_transfers SET status='IN_TRANSIT',shipped_by=?,shipped_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='DISPATCHING'").bind(user.email, body.id),
      ]);
      if (!Number((results[0] as any).meta?.changes)) return Response.json({ error: "Stok asal tidak cukup atau transfer belum disetujui." }, { status: 409 });
    }

    if (body.action === "RECEIVE") {
      assertBranchAccess(user, transfer.destinationBranchId);
      const results = await d1.batch([
        d1.prepare(`UPDATE stock_transfers SET status='RECEIVING',updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND status='IN_TRANSIT' AND NOT EXISTS (
            SELECT 1 FROM stock_transfer_items ti JOIN stocks s
              ON s.product_id=ti.product_id AND s.branch_id=? AND s.warehouse_id=?
            WHERE ti.transfer_id=? GROUP BY ti.product_id HAVING COUNT(s.id)<>1
          )`).bind(body.id, transfer.destinationBranchId, transfer.destinationWarehouseId, body.id),
        d1.prepare(`INSERT INTO stock_movements
          (id,reference_number,branch_id,warehouse_id,product_id,movement_type,quantity,stock_before,stock_after,reason,user_email)
          SELECT LOWER(HEX(RANDOMBLOB(16))),t.transfer_number,t.destination_branch_id,t.destination_warehouse_id,ti.product_id,
            'TRANSFER_IN',ti.quantity,s.physical_qty,s.physical_qty+ti.quantity,'Transfer antar cabang',?
          FROM stock_transfers t JOIN stock_transfer_items ti ON ti.transfer_id=t.id
          JOIN stocks s ON s.product_id=ti.product_id AND s.branch_id=t.destination_branch_id AND s.warehouse_id=t.destination_warehouse_id
          WHERE t.id=? AND t.status='RECEIVING'`).bind(user.email, body.id),
        d1.prepare(`UPDATE stocks SET physical_qty=physical_qty+(SELECT ti.quantity FROM stock_transfer_items ti WHERE ti.transfer_id=? AND ti.product_id=stocks.product_id),updated_at=CURRENT_TIMESTAMP
          WHERE branch_id=? AND warehouse_id=? AND product_id IN (SELECT product_id FROM stock_transfer_items WHERE transfer_id=?)
            AND EXISTS (SELECT 1 FROM stock_transfers WHERE id=? AND status='RECEIVING')`)
          .bind(body.id, transfer.destinationBranchId, transfer.destinationWarehouseId, body.id, body.id),
        d1.prepare("UPDATE stock_transfers SET status='RECEIVED',received_by=?,received_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='RECEIVING'").bind(user.email, body.id),
      ]);
      if (!Number((results[0] as any).meta?.changes)) return Response.json({ error: "Transfer belum dikirim atau sudah diterima." }, { status: 409 });
    }

    await d1.prepare("INSERT INTO audit_logs (id,user_email,branch_id,module,action,reference_number,details) VALUES (?,?,?,'Inventory',?,?,?)")
      .bind(crypto.randomUUID(), user.email, body.action === "RECEIVE" ? transfer.destinationBranchId : transfer.sourceBranchId, `Transfer ${body.action}`, transfer.transferNumber, body.id).run();
    return Response.json({ ok: true, transferNumber: transfer.transferNumber, status: body.action === "APPROVE" ? "APPROVED" : body.action === "DISPATCH" ? "IN_TRANSIT" : "RECEIVED" });
  } catch (error) { return apiError(error); }
}
