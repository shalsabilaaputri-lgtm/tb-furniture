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
    if (!id) return Response.json({ error: "Produk tidak ditemukan." }, { status: 404 });
    const d1 = getD1();
    const current = await d1.prepare("SELECT selling_price AS sellingPrice, name, pieces_per_box AS piecesPerBox, sqm_per_box AS sqmPerBox FROM products WHERE id=?").bind(id).first<any>();
    if (!current) return Response.json({ error: "Produk tidak ditemukan." }, { status: 404 });

    // Full detail edit (name, SKU, kategori, dll.) when those fields are sent.
    if ("sku" in body || "name" in body || "brand" in body || "category" in body || "unit" in body) {
      const required = ["sku", "name", "brand", "category", "unit"];
      if (required.some((key) => !String(body[key] ?? "").trim())) {
        return Response.json({ error: "SKU, nama, merek, kategori, dan satuan wajib diisi." }, { status: 400 });
      }
      const sellingPrice = Math.round(Number(body.sellingPrice)) || 0;
      const wholesalePrice = Math.round(Number(body.wholesalePrice)) || sellingPrice;
      const projectPrice = Math.round(Number(body.projectPrice)) || wholesalePrice;
      const minimumPrice = Math.round(Number(body.minimumPrice)) || 0;
      await d1.batch([
        d1.prepare(`UPDATE products SET
          sku=?,barcode=?,name=?,brand=?,category=?,series=?,color=?,size=?,unit=?,
          pieces_per_box=?,sqm_per_box=?,landed_cost=?,selling_price=?,wholesale_price=?,
          project_price=?,minimum_price=?,minimum_stock=? WHERE id=?`).bind(
          String(body.sku).trim().toUpperCase(), String(body.barcode ?? "").trim() || null,
          String(body.name).trim(), String(body.brand).trim(), String(body.category).trim(),
          String(body.series ?? "").trim(), String(body.color ?? "").trim(), String(body.size ?? "").trim(),
          String(body.unit).trim(), Number(body.piecesPerBox) || current.piecesPerBox || null, Number(body.sqmPerBox) || current.sqmPerBox || null,
          Number(body.landedCost) || 0, sellingPrice, wholesalePrice, projectPrice, minimumPrice,
          Number(body.minimumStock) || 0, id,
        ),
        d1.prepare("INSERT INTO audit_logs (id,user_email,module,action,reference_number,details) VALUES (?,?,'Product','Edit produk',?,?)")
          .bind(crypto.randomUUID(), user.email, id, `${current.name} → ${String(body.name).trim()}`),
      ]);
      return Response.json({ ok: true });
    }

    // Legacy: harga saja.
    const sellingPrice = Math.round(Number(body.sellingPrice));
    const wholesalePrice = Math.round(Number(body.wholesalePrice));
    const projectPrice = Math.round(Number(body.projectPrice));
    const minimumPrice = Math.round(Number(body.minimumPrice));
    if ([sellingPrice, wholesalePrice, projectPrice, minimumPrice].some((value) => !Number.isFinite(value) || value < 0) || sellingPrice < minimumPrice) {
      return Response.json({ error: "Data harga tidak valid." }, { status: 400 });
    }
    await d1.batch([
      d1.prepare("UPDATE products SET selling_price=?,wholesale_price=?,project_price=?,minimum_price=? WHERE id=?")
        .bind(sellingPrice, wholesalePrice, projectPrice, minimumPrice, id),
      d1.prepare("INSERT INTO audit_logs (id,user_email,module,action,reference_number,details) VALUES (?,?,'Product','Ubah harga',?,?)")
        .bind(crypto.randomUUID(), user.email, id, `${current.sellingPrice} → ${sellingPrice}`),
    ]);
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireApiUser("product.update");
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!id) return Response.json({ error: "Produk tidak ditemukan." }, { status: 404 });
    const d1 = getD1();
    const current = await d1.prepare("SELECT name FROM products WHERE id=? AND is_active=1").bind(id).first<any>();
    if (!current) return Response.json({ error: "Produk tidak ditemukan." }, { status: 404 });
    // Soft delete: products are referenced by sale_items/stocks/stock_movements
    // history, so a hard DELETE would fail on the foreign keys. Deactivating
    // hides it from the app (bootstrap already filters is_active=1) while
    // keeping past transactions intact.
    await d1.batch([
      d1.prepare("UPDATE products SET is_active=0 WHERE id=?").bind(id),
      d1.prepare("INSERT INTO audit_logs (id,user_email,module,action,reference_number,details) VALUES (?,?,'Product','Hapus produk',?,?)")
        .bind(crypto.randomUUID(), user.email, id, current.name),
    ]);
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
