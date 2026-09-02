import { cookies } from "next/headers";

export type SessionUser = {
  email: string;
  displayName: string;
  roleCode: "OWNER" | "ADMIN" | "CASHIER" | "WAREHOUSE" | "ACCOUNTING";
};

const COOKIE_NAME = "tb_permata_session";
const MAX_AGE = 60 * 60 * 12;
const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

function base64UrlToText(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

async function signingKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET belum dikonfigurasi.");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function signature(payload: string) {
  const result = await crypto.subtle.sign("HMAC", await signingKey(), encoder.encode(payload));
  return bytesToBase64Url(new Uint8Array(result));
}

export async function createSession(user: SessionUser) {
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify({ ...user, exp: Date.now() + MAX_AGE * 1000 })));
  const token = `${payload}.${await signature(payload)}`;
  const store = await cookies();
  store.set(COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const [payload, suppliedSignature] = token.split(".");
  if (!payload || !suppliedSignature) return null;
  const valid = await crypto.subtle.verify("HMAC", await signingKey(), Buffer.from(suppliedSignature, "base64url"), encoder.encode(payload));
  if (!valid) return null;
  try {
    const value = JSON.parse(base64UrlToText(payload)) as SessionUser & { exp: number };
    if (!value.email || !value.exp || value.exp < Date.now()) return null;
    return { email: value.email, displayName: value.displayName, roleCode: value.roleCode };
  } catch {
    return null;
  }
}

export async function deleteSession() {
  (await cookies()).delete(COOKIE_NAME);
}

export function configuredOwner() {
  return {
    email: (process.env.AUTH_OWNER_EMAIL || "owner@tbpermatagroup.id").trim().toLowerCase(),
    password: process.env.AUTH_OWNER_PASSWORD || "",
    displayName: process.env.AUTH_OWNER_NAME || "Owner TB Permata",
  };
}
