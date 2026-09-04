import { getDb } from "@/db";
import { apiError, assertBranchAccess, requireApiUser } from "@/lib/api-auth";

type EmployeeInput = {
  id?: string;
  branchId?: string;
  name?: string;
  position?: string;
  phone?: string;
  scheduledStart?: string;
};

function validTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser("attendance.manage");
    const body = await request.json() as EmployeeInput;
    const name = body.name?.trim() || "";
    const scheduledStart = body.scheduledStart?.trim() || "08:00";
    if (!body.branchId || !name || !validTime(scheduledStart)) {
      return Response.json({ error: "Nama, cabang, dan jam masuk wajib diisi." }, { status: 400 });
    }
    assertBranchAccess(user, body.branchId);
    const id = crypto.randomUUID();
    const d1 = getDb();
    await d1.batch([
      d1.prepare(`INSERT INTO employees (id,branch_id,name,position,phone,scheduled_start)
        VALUES (?,?,?,?,?,?)`).bind(id, body.branchId, name, body.position?.trim() || "Karyawan Toko", body.phone?.trim() || "", scheduledStart),
      d1.prepare(`INSERT INTO audit_logs (id,user_email,branch_id,module,action,reference_number,details)
        VALUES (?,?,?,'Attendance','Tambah karyawan',?,?)`).bind(crypto.randomUUID(), user.email, body.branchId, id, `${name} • jam ${scheduledStart}`),
    ]);
    return Response.json({ ok: true, id }, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireApiUser("attendance.manage");
    const body = await request.json() as EmployeeInput;
    const name = body.name?.trim() || "";
    const scheduledStart = body.scheduledStart?.trim() || "";
    if (!body.id || !body.branchId || !name || !validTime(scheduledStart)) {
      return Response.json({ error: "Data karyawan belum lengkap." }, { status: 400 });
    }
    const d1 = getDb();
    const current = await d1.prepare("SELECT id,branch_id AS branchId FROM employees WHERE id=? AND is_active=1").bind(body.id).first<{ id: string; branchId: string }>();
    if (!current) return Response.json({ error: "Karyawan tidak ditemukan." }, { status: 404 });
    // Check both locations. Otherwise a branch-scoped manager could move an
    // employee from a branch they cannot access by submitting their own branch
    // as the new value.
    assertBranchAccess(user, current.branchId);
    assertBranchAccess(user, body.branchId);
    await d1.batch([
      d1.prepare(`UPDATE employees SET branch_id=?,name=?,position=?,phone=?,scheduled_start=? WHERE id=?`)
        .bind(body.branchId, name, body.position?.trim() || "Karyawan Toko", body.phone?.trim() || "", scheduledStart, body.id),
      d1.prepare(`INSERT INTO audit_logs (id,user_email,branch_id,module,action,reference_number,details)
        VALUES (?,?,?,'Attendance','Edit karyawan',?,?)`).bind(crypto.randomUUID(), user.email, body.branchId, body.id, `${name} • jam ${scheduledStart}`),
    ]);
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
