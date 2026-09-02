import { getD1 } from "@/db";
import { apiError, requireApiUser } from "@/lib/api-auth";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser("product.create");
    const body = await request.json() as Record<string, unknown>;
    const required = ["sku", "name", "brand", "category", "unit"];
    if (required.some((key) => !String(body[key] ?? "").trim())) {
      return Response.json({ error: "SKU, nama, merek, kategori, dan satuan wajib diisi." }, { status: 400 });
    }
    const d1 = getD1();
    const id = crypto.randomUUID();
    const branches = await d1.prepare("SELECT b.id,w.id AS warehouseId FROM branches b JOIN warehouses w ON w.branch_id=b.id WHERE b.is_active=1 GROUP BY b.id").all<any>();
    const statements = [
      d1.prepare(`INSERT INTO products
        (id,sku,barcode,name,brand,category,series,color,size,unit,pieces_per_box,sqm_per_box,purchase_price,landed_cost,selling_price,wholesale_price,project_price,minimum_price,minimum_stock,is_active)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`).bind(
        id, String(body.sku).trim().toUpperCase(), String(body.barcode ?? "").trim() || null,
        String(body.name).trim(), String(body.brand).trim(), String(body.category).trim(),
        String(body.series ?? "").trim(), String(body.color ?? "").trim(), String(body.size ?? "").trim(),
        String(body.unit).trim(), Number(body.piecesPerBox) || null, Number(body.sqmPerBox) || null,
        Number(body.purchasePrice) || 0, Number(body.landedCost) || Number(body.purchasePrice) || 0,
        Number(body.sellingPrice) || 0, Number(body.wholesalePrice) || Number(body.sellingPrice) || 0,
        Number(body.projectPrice) || Number(body.wholesalePrice) || Number(body.sellingPrice) || 0,
        Number(body.minimumPrice) || 0, Number(body.minimumStock) || 0,
      ),
      d1.prepare("INSERT INTO audit_logs (id,user_email,module,action,reference_number,details) VALUES (?,?,'Product','Tambah produk',?,?)")
        .bind(crypto.randomUUID(), user.email, String(body.sku).trim().toUpperCase(), String(body.name).trim()),
    ];
    for (const branch of branches.results) {
      statements.push(d1.prepare(`INSERT INTO stocks
        (id,branch_id,warehouse_id,product_id,batch,shade,physical_qty,reserved_qty,damaged_qty)
        VALUES (?,?,?,?, 'REGULER','STD',0,0,0)`).bind(crypto.randomUUID(), branch.id, branch.warehouseId, id));
    }
    await d1.batch(statements);
    return Response.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireApiUser("product.update");
    const body = await request.json() as Record<string, unknown>;
    const id = String(body.id ?? "");
    const sellingPrice = Math.round(Number(body.sellingPrice));
    const wholesalePrice = Math.round(Number(body.wholesalePrice));
    const projectPrice = Math.round(Number(body.projectPrice));
    const minimumPrice = Math.round(Number(body.minimumPrice));
    if (!id || [sellingPrice, wholesalePrice, projectPrice, minimumPrice].some((value) => !Number.isFinite(value) || value < 0) || sellingPrice < minimumPrice) {
      return Response.json({ error: "Data harga tidak valid." }, { status: 400 });
    }
    const d1 = getD1();
    const current = await d1.prepare("SELECT selling_price AS sellingPrice FROM products WHERE id=?").bind(id).first<any>();
    if (!current) return Response.json({ error: "Produk tidak ditemukan." }, { status: 404 });
    await d1.batch([
      d1.prepare("UPDATE products SET selling_price=?,wholesale_price=?,project_price=?,minimum_price=? WHERE id=?")
        .bind(sellingPrice, wholesalePrice, projectPrice, minimumPrice, id),
      d1.prepare("INSERT INTO audit_logs (id,user_email,module,action,reference_number,details) VALUES (?,?,'Product','Ubah harga',?,?)")
        .bind(crypto.randomUUID(), user.email, id, `${current.sellingPrice} → ${sellingPrice}`),
    ]);
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
