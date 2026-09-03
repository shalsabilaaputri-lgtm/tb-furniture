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

  if (email === owner.email && password === owner.password) {
    await createSession({ email: owner.email, displayName: owner.displayName, roleCode: "OWNER" });
    return NextResponse.redirect(new URL("/", request.url), 303);
  }

  const d1 = getD1();
  const account = await d1.prepare(`SELECT u.email,u.name,u.password_hash AS passwordHash,r.code AS roleCode
    FROM app_users u JOIN roles r ON r.id=u.role_id WHERE LOWER(u.email)=? AND u.is_active=1 AND r.is_active=1`)
    .bind(email).first<{ email: string; name: string; passwordHash: string | null; roleCode: string }>();
  if (account?.passwordHash && (await verifyPassword(password, account.passwordHash))) {
    await createSession({ email: account.email, displayName: account.name, roleCode: account.roleCode as "OWNER" | "ADMIN" | "MANAGER" | "CASHIER" | "WAREHOUSE" | "ACCOUNTING" });
    return NextResponse.redirect(new URL("/", request.url), 303);
  }

  return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
}
