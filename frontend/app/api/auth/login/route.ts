import { NextRequest, NextResponse } from "next/server";
import { configuredOwner, createSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const owner = configuredOwner();
  if (email !== owner.email || password !== owner.password) return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
  await createSession({ email: owner.email, displayName: owner.displayName, roleCode: "OWNER" });
  return NextResponse.redirect(new URL("/", request.url), 303);
}
