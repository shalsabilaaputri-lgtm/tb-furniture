import { getSessionUser } from "@/lib/session";
import { can, resolveAccessUser, type AccessUser } from "@/lib/access";

export async function requireApiUser(permission?: string): Promise<AccessUser> {
  const session = await getSessionUser();
  const identity = session ? { email: session.email, displayName: session.displayName } : null;
  if (!identity) throw new Response(JSON.stringify({ error: "Silakan masuk terlebih dahulu." }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
  const user = await resolveAccessUser(identity);
  if (!user) throw new Response(JSON.stringify({ error: "Akun Anda belum diberi akses ke software ini." }), {
    status: 403,
    headers: { "content-type": "application/json" },
  });
  if (permission && !can(user, permission)) throw new Response(JSON.stringify({ error: "Anda tidak memiliki izin untuk tindakan ini." }), {
    status: 403,
    headers: { "content-type": "application/json" },
  });
  return user;
}

export function assertBranchAccess(user: AccessUser, branchId: string) {
  if (can(user, "branch.read_all") || !user.branchId || user.branchId === branchId) return;
  throw new Response(JSON.stringify({ error: "Anda tidak memiliki akses ke cabang tersebut." }), {
    status: 403,
    headers: { "content-type": "application/json" },
  });
}

export function apiError(error: unknown) {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "Terjadi kesalahan.";
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  console.error("[api] request failed", {
    message,
    code,
    stack: error instanceof Error ? error.stack : undefined,
  });
  if (code === "40001" || code === "40P01") {
    return Response.json({ error: "Data baru saja berubah oleh pengguna lain. Muat ulang lalu ulangi transaksi." }, { status: 409 });
  }
  if (code === "23505") {
    return Response.json({ error: "Data dengan nomor atau kode yang sama sudah ada. Silakan ulangi." }, { status: 409 });
  }
  const friendly = message.includes("stocks_qty_valid") || message.includes("foreign key constraint")
    ? "Stok atau data terkait baru saja berubah. Muat ulang lalu ulangi transaksi."
    : message;
  return Response.json({ error: friendly }, { status: 400 });
}
