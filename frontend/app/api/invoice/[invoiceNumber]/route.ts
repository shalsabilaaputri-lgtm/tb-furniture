import { getDb } from "@/db";
import { createInvoicePdf } from "@/lib/invoice-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ invoiceNumber: string }> }) {
  const { invoiceNumber } = await params;
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return Response.json({ error: "Tautan invoice tidak valid." }, { status: 400 });
  const d1 = getDb();
  const sale = await d1.prepare(`SELECT s.id,s.invoice_number AS invoiceNumber,s.created_at AS issuedAt,
    b.short_name AS branchName,COALESCE(c.name,NULLIF(s.customer_name,''),'Customer Umum') AS customerName,
    COALESCE(NULLIF(s.customer_phone,''),c.whatsapp,'') AS customerPhone,s.subtotal,s.discount,
    s.delivery_fee AS deliveryFee,s.total,s.paid_amount AS paidAmount,s.payment_method AS paymentMethod,
    s.credit_due_rule AS dueRule,s.credit_due_date AS dueDate
    FROM sales s JOIN branches b ON b.id=s.branch_id LEFT JOIN customers c ON c.id=s.customer_id
    WHERE s.invoice_number=? AND s.invoice_token=?`).bind(invoiceNumber, token).first<any>();
  if (!sale) return Response.json({ error: "Invoice tidak ditemukan atau tautan sudah tidak berlaku." }, { status: 404 });
  const itemResult = await d1.prepare(`SELECT p.name,si.quantity,si.unit,si.unit_price AS unitPrice,si.line_total AS lineTotal
    FROM sale_items si JOIN products p ON p.id=si.product_id WHERE si.sale_id=? ORDER BY si.rowid`).bind(sale.id).all<any>();
  const pdf = createInvoicePdf({ ...sale, items: itemResult.results });
  return new Response(pdf, { headers: {
    "content-type": "application/pdf", "content-disposition": `inline; filename="${sale.invoiceNumber}.pdf"`,
    "cache-control": "private, no-store", "x-content-type-options": "nosniff",
  } });
}
