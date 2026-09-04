import { getDb } from "@/db";
import { apiError, assertBranchAccess, requireApiUser } from "@/lib/api-auth";

function jakartaNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${value.year}-${value.month}-${value.day}`, time: `${value.hour}:${value.minute}` };
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser("attendance.manage");
    const body = await request.json() as { employeeId?: string; action?: "CHECK_IN" | "ABSENT"; note?: string };
    if (!body.employeeId || !["CHECK_IN", "ABSENT"].includes(body.action || "")) {
      return Response.json({ error: "Karyawan dan status presensi wajib dipilih." }, { status: 400 });
    }
    const d1 = getDb();
    const employee = await d1.prepare(`SELECT id,branch_id AS branchId,name,scheduled_start AS scheduledStart
      FROM employees WHERE id=? AND is_active=1`).bind(body.employeeId).first<any>();
    if (!employee) return Response.json({ error: "Karyawan tidak ditemukan." }, { status: 404 });
    assertBranchAccess(user, employee.branchId);

    const now = jakartaNow();
    const existing = await d1.prepare("SELECT status FROM attendance WHERE employee_id=? AND attendance_date=?")
      .bind(employee.id, now.date).first<any>();
    if (body.action === "ABSENT" && existing && existing.status !== "ABSENT") {
      return Response.json({ error: "Karyawan sudah presensi masuk hari ini." }, { status: 409 });
    }
    if (body.action === "CHECK_IN" && existing && existing.status !== "ABSENT") {
      return Response.json({ error: "Jam masuk karyawan ini sudah tercatat hari ini." }, { status: 409 });
    }

    const status = body.action === "ABSENT" ? "ABSENT" : now.time > employee.scheduledStart ? "LATE" : "PRESENT";
    const checkInTime = body.action === "CHECK_IN" ? now.time : null;
    const id = crypto.randomUUID();
    await d1.batch([
      d1.prepare(`INSERT INTO attendance
        (id,employee_id,branch_id,attendance_date,scheduled_start,check_in_time,status,note,recorded_by)
        VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(employee_id,attendance_date) DO UPDATE SET
          branch_id=excluded.branch_id,scheduled_start=excluded.scheduled_start,
          check_in_time=excluded.check_in_time,status=excluded.status,note=excluded.note,recorded_by=excluded.recorded_by`)
        .bind(id, employee.id, employee.branchId, now.date, employee.scheduledStart, checkInTime, status, body.note?.trim() || "", user.email),
      d1.prepare(`INSERT INTO audit_logs (id,user_email,branch_id,module,action,reference_number,details)
        VALUES (?,?,?,'Attendance',?,?,?)`).bind(crypto.randomUUID(), user.email, employee.branchId, body.action === "CHECK_IN" ? "Presensi masuk" : "Tidak masuk", employee.id, `${employee.name} • ${now.date} • ${checkInTime || "Tidak masuk"}`),
    ]);
    return Response.json({ ok: true, status, checkInTime, date: now.date });
  } catch (error) { return apiError(error); }
}
