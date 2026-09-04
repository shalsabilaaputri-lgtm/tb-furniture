import { getDb } from "@/db";
import { apiError, requireApiUser } from "@/lib/api-auth";

const demoProductIds = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
const demoSaleIds = ["sale-demo-1", "sale-demo-2", "sale-demo-3"];
const demoCustomerIds = ["c1", "c2", "c3"];
const productList = demoProductIds.map((id) => `'${id}'`).join(",");
const saleList = demoSaleIds.map((id) => `'${id}'`).join(",");
const customerList = demoCustomerIds.map((id) => `'${id}'`).join(",");

async function requireOwner() {
  const user = await requireApiUser("user.manage");
  if (user.roleCode !== "OWNER") throw new Response(JSON.stringify({ error: "Hanya Owner yang dapat membersihkan data contoh." }), { status: 403, headers: { "content-type": "application/json" } });
  return user;
}

async function preview() {
  const d1 = getDb();
  const [products, stocks, movements, sales, customers] = await d1.batch([
    d1.prepare(`SELECT COUNT(*) AS total FROM products WHERE id IN (${productList}) AND is_active=1`),
    d1.prepare(`SELECT COUNT(*) AS total FROM stocks WHERE product_id IN (${productList})`),
    d1.prepare(`SELECT COUNT(*) AS total FROM stock_movements WHERE product_id IN (${productList})`),
    d1.prepare(`SELECT COUNT(*) AS total FROM sales WHERE id IN (${saleList})`),
    d1.prepare(`SELECT COUNT(*) AS total FROM customers WHERE id IN (${customerList})`),
  ]);
  const count = (result: { results: unknown[] }) => Number((result.results[0] as { total?: number | string } | undefined)?.total || 0);
  return { products: count(products), stocks: count(stocks), movements: count(movements), sales: count(sales), customers: count(customers) };
}

export async function GET() {
  try {
    await requireOwner();
    return Response.json({ preview: await preview() });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireOwner();
    if (request.headers.get("x-confirm-demo-cleanup") !== "DELETE-DEMO-DATA") return Response.json({ error: "Konfirmasi pembersihan data contoh diperlukan." }, { status: 400 });
    const before = await preview();
    const d1 = getDb();
    await d1.batch([
      d1.prepare(`DELETE FROM customer_return_items WHERE return_id IN (SELECT id FROM customer_returns WHERE sale_id IN (${saleList}))`),
      d1.prepare(`DELETE FROM customer_returns WHERE sale_id IN (${saleList})`),
      d1.prepare(`DELETE FROM payments WHERE sale_id IN (${saleList})`),
      d1.prepare(`DELETE FROM sale_items WHERE sale_id IN (${saleList})`),
      d1.prepare(`DELETE FROM sales WHERE id IN (${saleList})`),
      d1.prepare(`DELETE FROM stocks WHERE product_id IN (${productList})`),
      d1.prepare(`DELETE FROM stock_movements WHERE product_id IN (${productList})`),
      d1.prepare(`UPDATE products SET is_active=0 WHERE id IN (${productList})`),
      d1.prepare(`DELETE FROM customers WHERE id IN (${customerList})
        AND NOT EXISTS (SELECT 1 FROM sales WHERE sales.customer_id=customers.id)
        AND NOT EXISTS (SELECT 1 FROM customer_returns WHERE customer_returns.customer_id=customers.id)
        AND NOT EXISTS (SELECT 1 FROM receivable_payments WHERE receivable_payments.customer_id=customers.id)`),
      d1.prepare("INSERT INTO audit_logs (id,user_email,module,action,reference_number,details) VALUES (?,?,'Administrasi','Hapus data contoh','DEMO-CLEANUP',?)")
        .bind(crypto.randomUUID(), actor.email, JSON.stringify(before)),
    ]);
    console.info("[admin.demo-data] cleaned", { actor: actor.email, ...before });
    return Response.json({ ok: true, removed: before });
  } catch (error) { return apiError(error); }
}
