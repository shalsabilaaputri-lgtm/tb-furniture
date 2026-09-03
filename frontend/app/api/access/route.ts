import { getD1 } from "@/db";
import { apiError, requireApiUser } from "@/lib/api-auth";
import { hashPassword } from "@/lib/password";

type UserInput = { id?: string; email?: string; name?: string; roleId?: string; branchId?: string | null; isActive?: boolean; password?: string };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function validateInput(body: UserInput) {
  const email = body.email?.trim().toLowerCase() || "";
  const name = body.name?.trim() || "";
  if (!emailPattern.test(email) || !name || !body.roleId) return { error: "Nama, email, dan peran wajib diisi dengan benar." } as const;
  const d1 = getD1();
  const role = await d1.prepare("SELECT id,code FROM roles WHERE id=? AND is_active=1").bind(body.roleId).first<any>();
  if (!role) return { error: "Peran tidak ditemukan." } as const;
  const branchId = body.branchId || null;
  if (!["OWNER", "ADMIN"].includes(role.code) && !branchId) return { error: "Peran ini wajib memiliki cabang kerja." } as const;
  if (branchId) {
    const branch = await d1.prepare("SELECT id FROM branches WHERE id=? AND is_active=1").bind(branchId).first();
    if (!branch) return { error: "Cabang tidak ditemukan." } as const;
  }
  return { email, name, role, branchId } as const;
}

export async function GET() {
  try {
    await requireApiUser("user.manage");
    const d1 = getD1();
    const [users, roles, permissions] = await d1.batch([
      d1.prepare(`SELECT u.id,u.email,u.name,u.role_id AS roleId,r.code AS roleCode,r.name AS roleName,
        u.branch_id AS branchId,b.short_name AS branchName,u.is_active AS isActive,u.created_at AS createdAt
        FROM app_users u JOIN roles r ON r.id=u.role_id LEFT JOIN branches b ON b.id=u.branch_id
        ORDER BY u.is_active DESC,r.code,u.name`),
      d1.prepare(`SELECT r.id,r.code,r.name,r.description,COUNT(rp.permission_id) AS permissionCount
        FROM roles r LEFT JOIN role_permissions rp ON rp.role_id=r.id WHERE r.is_active=1 GROUP BY r.id ORDER BY r.rowid`),
      d1.prepare(`SELECT r.code AS roleCode,p.code,p.module,p.name FROM role_permissions rp
        JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id
        ORDER BY p.module,p.code,r.rowid`),
    ]);
    return Response.json({ users: users.results, roles: roles.results, permissions: permissions.results });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireApiUser("user.manage");
    const body = await request.json() as UserInput;
    const valid = await validateInput(body);
    if ("error" in valid) return Response.json({ error: valid.error }, { status: 400 });
    const password = body.password || "";
    if (password.length < 6) return Response.json({ error: "Password minimal 6 karakter." }, { status: 400 });
    const passwordHash = await hashPassword(password);
    const d1 = getD1(); const id = crypto.randomUUID();
    await d1.batch([
      d1.prepare("INSERT INTO app_users (id,email,name,role_id,branch_id,password_hash,is_active) VALUES (?,?,?,?,?,?,1)")
        .bind(id, valid.email, valid.name, valid.role.id, valid.branchId, passwordHash),
      d1.prepare("INSERT INTO audit_logs (id,user_email,module,action,reference_number,details) VALUES (?,?,'Access','Tambah pengguna',?,?)")
        .bind(crypto.randomUUID(), actor.email, id, `${valid.email} • ${valid.role.code}`),
    ]);
    return Response.json({ ok: true, id }, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireApiUser("user.manage");
    const body = await request.json() as UserInput;
    if (!body.id) return Response.json({ error: "Pengguna tidak ditemukan." }, { status: 400 });
    const valid = await validateInput(body);
    if ("error" in valid) return Response.json({ error: valid.error }, { status: 400 });
    if (body.id === actor.id && body.isActive === false) return Response.json({ error: "Akun sendiri tidak dapat dinonaktifkan." }, { status: 409 });
    if (body.id === actor.id && valid.role.code !== "OWNER") return Response.json({ error: "Owner tidak dapat menurunkan peran akunnya sendiri." }, { status: 409 });
    const d1 = getD1();
    const current = await d1.prepare("SELECT id FROM app_users WHERE id=?").bind(body.id).first();
    if (!current) return Response.json({ error: "Pengguna tidak ditemukan." }, { status: 404 });
    const newPassword = (body.password || "").trim();
    if (newPassword && newPassword.length < 6) return Response.json({ error: "Password minimal 6 karakter." }, { status: 400 });
    const passwordHash = newPassword ? await hashPassword(newPassword) : null;
    await d1.batch([
      passwordHash
        ? d1.prepare("UPDATE app_users SET email=?,name=?,role_id=?,branch_id=?,is_active=?,password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
            .bind(valid.email, valid.name, valid.role.id, valid.branchId, body.isActive === false ? 0 : 1, passwordHash, body.id)
        : d1.prepare("UPDATE app_users SET email=?,name=?,role_id=?,branch_id=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
            .bind(valid.email, valid.name, valid.role.id, valid.branchId, body.isActive === false ? 0 : 1, body.id),
      d1.prepare("INSERT INTO audit_logs (id,user_email,module,action,reference_number,details) VALUES (?,?,'Access','Edit pengguna',?,?)")
        .bind(crypto.randomUUID(), actor.email, body.id, `${valid.email} • ${valid.role.code} • ${body.isActive === false ? "nonaktif" : "aktif"}`),
    ]);
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
