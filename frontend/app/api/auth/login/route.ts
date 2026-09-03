import { NextRequest, NextResponse } from "next/server";
import { configuredOwner, createSession } from "@/lib/session";
import { verifyPassword } from "@/lib/password";
import { getD1 } from "@/db";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const owner = configuredOwner();
  if (!owner.password || !process.env.AUTH_SECRET) return NextResponse.redirect(new URL("/login?error=config", request.url), 303);

  const d1 = getD1();

  if (email === owner.email && password === owner.password) {
    // AUTH_OWNER_EMAIL may have been changed in Vercel after the original
    // owner row was seeded in app_users with the old address — without this,
    // env-var login would succeed but every subsequent request would 403
    // with "belum diberi akses" because no active row matches the new email.
    // Keep the owner row in sync instead of requiring a manual DB fix.
    try {
      const activeMatch = await d1.prepare("SELECT id FROM app_users WHERE LOWER(email)=LOWER(?) AND is_active=1").bind(owner.email).first();
      if (!activeMatch) {
        const ownerRow = await d1.prepare("SELECT id FROM app_users WHERE role_id='role-owner' ORDER BY created_at LIMIT 1").first<{ id: string }>();
        if (ownerRow) await d1.prepare("UPDATE app_users SET email=?,name=?,is_active=1,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(owner.email, owner.displayName, ownerRow.id).run();
        else await d1.prepare("INSERT INTO app_users (id,email,name,role_id,branch_id,is_active) VALUES (?,?,?,'role-owner',NULL,1)").bind(crypto.randomUUID(), owner.email, owner.displayName).run();
      }
    } catch {
      // Fresh install with roles not seeded yet — resolveAccessUser() handles
      // that bootstrap path on the next request, so it's safe to ignore here.
    }
    await createSession({ email: owner.email, displayName: owner.displayName, roleCode: "OWNER" });
    return NextResponse.redirect(new URL("/", request.url), 303);
  }

  const account = await d1.prepare(`SELECT u.email,u.name,u.password_hash AS passwordHash,r.code AS roleCode
    FROM app_users u JOIN roles r ON r.id=u.role_id WHERE LOWER(u.email)=? AND u.is_active=1 AND r.is_active=1`)
    .bind(email).first<{ email: string; name: string; passwordHash: string | null; roleCode: string }>();
  if (account?.passwordHash && (await verifyPassword(password, account.passwordHash))) {
    await createSession({ email: account.email, displayName: account.name, roleCode: account.roleCode as "OWNER" | "ADMIN" | "MANAGER" | "CASHIER" | "WAREHOUSE" | "ACCOUNTING" });
    return NextResponse.redirect(new URL("/", request.url), 303);
  }

  return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
}
