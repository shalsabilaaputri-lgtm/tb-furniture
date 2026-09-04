import { getDb } from "@/db";
import { apiError, assertBranchAccess, requireApiUser } from "@/lib/api-auth";
import { createReference } from "@/lib/reference";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser("receivable.manage");
    const body = await request.json() as { saleId?: string; amount?: number; method?: string };
    const amount = Math.round(Number(body.amount));
    if (!body.saleId || !body.method || !Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: "Data pembayaran piutang belum lengkap." }, { status: 400 });
    }
    const d1 = getDb();
    const sale = await d1.prepare(`SELECT s.id,s.invoice_number AS invoiceNumber,s.branch_id AS branchId,s.customer_id AS customerId,
      s.total,s.paid_amount AS paidAmount,c.outstanding FROM sales s JOIN customers c ON c.id=s.customer_id
      WHERE s.id=? AND s.payment_method='Piutang'`).bind(body.saleId).first<any>();
    if (!sale) return Response.json({ error: "Invoice piutang tidak ditemukan." }, { status: 404 });
    assertBranchAccess(user, sale.branchId);
    const remaining = Number(sale.total) - Number(sale.paidAmount);
    if (remaining <= 0 || amount > remaining) return Response.json({ error: "Pembayaran melebihi sisa invoice piutang." }, { status: 409 });
    const before = Number(sale.outstanding);
    const after = Math.max(0, before - amount);
    const paidAfter = Number(sale.paidAmount) + amount;
    const reference = createReference("ARP");
    const results = await d1.batch([
      d1.prepare("UPDATE customers SET outstanding=? WHERE id=? AND outstanding=?").bind(after, sale.customerId, before),
      d1.prepare("UPDATE sales SET paid_amount=?,status=? WHERE id=? AND paid_amount=?")
        .bind(paidAfter, paidAfter >= Number(sale.total) ? "PAID" : "PARTIAL", sale.id, sale.paidAmount),
      d1.prepare(`INSERT INTO receivable_payments (id,customer_id,branch_id,amount,method,reference_number,user_email)
        SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM customers WHERE id=? AND outstanding=?)`)
        .bind(crypto.randomUUID(), sale.customerId, sale.branchId, amount, body.method, reference, user.email, sale.customerId, after),
      d1.prepare(`INSERT INTO audit_logs (id,user_email,branch_id,module,action,reference_number,details)
        SELECT ?,?,?,'Receivable','Pembayaran piutang',?,? WHERE EXISTS (SELECT 1 FROM customers WHERE id=? AND outstanding=?)`)
        .bind(crypto.randomUUID(), user.email, sale.branchId, reference, `${sale.invoiceNumber}: ${before} → ${after}`, sale.customerId, after),
    ]);
    if (Number((results[0] as any).meta?.changes ?? 0) !== 1 || Number((results[1] as any).meta?.changes ?? 0) !== 1) return Response.json({ error: "Piutang baru saja berubah. Silakan ulangi." }, { status: 409 });
    return Response.json({ ok: true, reference, outstanding: after, remaining: remaining - amount }, { status: 201 });
  } catch (error) { return apiError(error); }
}
