import { redirect } from "next/navigation";
import { Building2, LockKeyhole, Mail } from "lucide-react";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSessionUser()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="grid min-h-svh place-items-center bg-gradient-to-br from-red-950 via-[#991b1b] to-red-800 p-4">
      <section className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl sm:p-9">
        <div className="mb-7 flex items-center gap-4">
          <div className="grid size-14 place-items-center rounded-2xl bg-[#991b1b] text-white"><Building2 className="size-7" /></div>
          <div><h1 className="text-xl font-black text-slate-950">TB PERMATA</h1><p className="text-sm text-slate-500">KERAMIK • ERP</p></div>
        </div>
        <h2 className="text-2xl font-bold text-slate-950">Masuk ke aplikasi</h2>
        <p className="mt-1 text-sm text-slate-500">Gunakan akun yang diberikan oleh owner.</p>
        {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{error === "config" ? "Login belum dikonfigurasi oleh administrator." : "Email atau kata sandi salah."}</div>}
        <form action="/api/auth/login" method="post" className="mt-6 space-y-4">
          <label className="block text-sm font-semibold text-slate-700">Email<div className="relative mt-2"><Mail className="absolute left-3 top-3.5 size-4 text-slate-400"/><input name="email" type="email" autoComplete="username" required className="h-11 w-full rounded-xl border border-slate-300 pl-10 pr-3 outline-none focus:border-red-700 focus:ring-2 focus:ring-red-100" placeholder="owner@tbpermatagroup.id"/></div></label>
          <label className="block text-sm font-semibold text-slate-700">Kata sandi<div className="relative mt-2"><LockKeyhole className="absolute left-3 top-3.5 size-4 text-slate-400"/><input name="password" type="password" autoComplete="current-password" required className="h-11 w-full rounded-xl border border-slate-300 pl-10 pr-3 outline-none focus:border-red-700 focus:ring-2 focus:ring-red-100" placeholder="Masukkan kata sandi"/></div></label>
          <button className="h-12 w-full rounded-xl bg-[#991b1b] font-bold text-white transition hover:bg-[#7f1d1d]">Masuk</button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-400">Akses aman untuk sistem operasional TB Permata</p>
      </section>
    </main>
  );
}
