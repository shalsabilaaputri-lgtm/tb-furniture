import { getDb } from "@/db";
import { apiError, assertBranchAccess, requireApiUser } from "@/lib/api-auth";
import { createReference } from "@/lib/reference";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser("finance.manage");
    const body = await request.json() as { customerId?: string; branchId?: string; amount?: number; method?: string };
    const amount = Math.round(Number(body.amount));
    if (!body.customerId || !body.branchId || !body.method || !Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: "Data pembayaran piutang belum lengkap." }, { status: 400 });
    }
    assertBranchAccess(user, body.branchId);
    const d1 = getDb();
    const customer = await d1.prepare("SELECT outstanding FROM customers WHERE id=?").bind(body.customerId).first<any>();
    if (!customer || amount > Number(customer.outstanding)) return Response.json({ error: "Pembayaran melebihi sisa piutang." }, { status: 409 });
    const before = Number(customer.outstanding);
    const after = before - amount;
    const reference = createReference("ARP");
    const results = await d1.batch([
      d1.prepare("UPDATE customers SET outstanding=? WHERE id=? AND outstanding=?").bind(after, body.customerId, before),
      d1.prepare(`INSERT INTO receivable_payments (id,customer_id,branch_id,amount,method,reference_number,user_email)
        SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM customers WHERE id=? AND outstanding=?)`)
        .bind(crypto.randomUUID(), body.customerId, body.branchId, amount, body.method, reference, user.email, body.customerId, after),
      d1.prepare(`INSERT INTO audit_logs (id,user_email,branch_id,module,action,reference_number,details)
        SELECT ?,?,?,'Receivable','Pembayaran piutang',?,? WHERE EXISTS (SELECT 1 FROM customers WHERE id=? AND outstanding=?)`)
        .bind(crypto.randomUUID(), user.email, body.branchId, reference, `${before} → ${after}`, body.customerId, after),
    ]);
    if (Number((results[0] as any).meta?.changes ?? 0) !== 1) return Response.json({ error: "Piutang baru saja berubah. Silakan ulangi." }, { status: 409 });
    return Response.json({ ok: true, reference, outstanding: after }, { status: 201 });
  } catch (error) { return apiError(error); }
}
