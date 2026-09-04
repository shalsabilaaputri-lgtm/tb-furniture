import { getDb } from "@/db";
import { apiError, requireApiUser } from "@/lib/api-auth";
import { hashPassword } from "@/lib/password";

const accounts = [
  ["b1", "Karyawan Cabang Seyegan", "operator.seyegan@tbpermatagroup.id"],
  ["b2", "Karyawan Cabang Jl. Wates", "operator.wates@tbpermatagroup.id"],
  ["b3", "Karyawan Cabang Jl. Bantul", "operator.bantul@tbpermatagroup.id"],
  ["b4", "Karyawan Cabang Dekso", "operator.dekso@tbpermatagroup.id"],
  ["b5", "Karyawan Cabang Purworejo", "operator.purworejo@tbpermatagroup.id"],
] as const;

function initialPassword() {
  return `TBP-${Array.from(crypto.getRandomValues(new Uint8Array(5)), (value) => value.toString(16).padStart(2, "0")).join("")}-26`;
}

export async function POST(request: Request) {
  try {
    const actor = await requireApiUser("user.manage");
    if (actor.roleCode !== "OWNER") return Response.json({ error: "Hanya Owner yang dapat membuat akun cabang." }, { status: 403 });
    const body = await request.json() as { confirm?: string };
    if (body.confirm !== "CREATE-BRANCH-STAFF-ACCOUNTS") return Response.json({ error: "Konfirmasi pembuatan akun cabang diperlukan." }, { status: 400 });
    const d1 = getDb();
    const role = await d1.prepare("SELECT id FROM roles WHERE code='BRANCH_STAFF' AND is_active=1").first<{ id: string }>();
    if (!role) return Response.json({ error: "Peran Karyawan Cabang belum tersedia. Muat ulang lalu ulangi." }, { status: 409 });
    const result: Array<{ branchId: string; name: string; email: string; password?: string; status: "CREATED" | "EXISTS" }> = [];
    for (const [branchId, name, email] of accounts) {
      const existing = await d1.prepare("SELECT id FROM app_users WHERE LOWER(email)=LOWER(?)").bind(email).first();
      if (existing) { result.push({ branchId, name, email, status: "EXISTS" }); continue; }
      const password = initialPassword();
      await d1.batch([
        d1.prepare("INSERT INTO app_users (id,email,name,role_id,branch_id,password_hash,is_active) VALUES (?,?,?,?,?,?,1)")
          .bind(crypto.randomUUID(), email, name, role.id, branchId, await hashPassword(password)),
        d1.prepare("INSERT INTO audit_logs (id,user_email,branch_id,module,action,reference_number,details) VALUES (?,?,'','Access','Tambah akun karyawan cabang',?,?)")
          .bind(crypto.randomUUID(), actor.email, email, `${name} • ${branchId}`),
      ]);
      result.push({ branchId, name, email, password, status: "CREATED" });
    }
    return Response.json({ accounts: result }, { status: 201 });
  } catch (error) { return apiError(error); }
}
