import { getD1 } from "@/db";
import { apiError, assertBranchAccess, requireApiUser } from "@/lib/api-auth";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser("finance.manage");
    const body = await request.json() as { branchId?: string; category?: string; amount?: number; paymentMethod?: string; description?: string };
    const amount = Math.round(Number(body.amount));
    if (!body.branchId || !body.category?.trim() || !body.paymentMethod || !Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: "Data pengeluaran belum lengkap." }, { status: 400 });
    }
    assertBranchAccess(user, body.branchId);
    const d1 = getD1();
    const reference = `EXP-${Date.now().toString().slice(-9)}`;
    await d1.batch([
      d1.prepare("INSERT INTO expenses (id,branch_id,category,amount,payment_method,description,user_email) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), body.branchId, body.category.trim(), amount, body.paymentMethod, body.description?.trim() || "", user.email),
      d1.prepare("INSERT INTO audit_logs (id,user_email,branch_id,module,action,reference_number,details) VALUES (?,?,?,'Finance','Catat pengeluaran',?,?)")
        .bind(crypto.randomUUID(), user.email, body.branchId, reference, `${body.category}: ${amount}`),
    ]);
    return Response.json({ ok: true, reference }, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireApiUser("finance.manage");
    const body = await request.json() as { id?: string; branchId?: string; category?: string; amount?: number; paymentMethod?: string; description?: string };
    const amount = Math.round(Number(body.amount));
    if (!body.id || !body.branchId || !body.category?.trim() || !body.paymentMethod || !Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: "Data pengeluaran belum lengkap." }, { status: 400 });
    }
    assertBranchAccess(user, body.branchId);
    const d1 = getD1();
    const current = await d1.prepare("SELECT branch_id AS branchId,category,amount,payment_method AS paymentMethod,description FROM expenses WHERE id=?").bind(body.id).first<any>();
    if (!current) return Response.json({ error: "Pengeluaran tidak ditemukan." }, { status: 404 });
    await d1.batch([
      d1.prepare("UPDATE expenses SET branch_id=?,category=?,amount=?,payment_method=?,description=? WHERE id=?")
        .bind(body.branchId, body.category.trim(), amount, body.paymentMethod, body.description?.trim() || "", body.id),
      d1.prepare("INSERT INTO audit_logs (id,user_email,branch_id,module,action,reference_number,details) VALUES (?,?,?,'Finance','Edit pengeluaran',?,?)")
        .bind(crypto.randomUUID(), user.email, body.branchId, body.id, `${current.category} ${current.amount} → ${body.category} ${amount}`),
    ]);
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
