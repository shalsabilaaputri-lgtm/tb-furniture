"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, KeyRound, Loader2, Pencil, Plus, ShieldCheck, Trash2, UserCog, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Branch = { id: string; name: string };
type AccessUser = { id: string; email: string; name: string; roleId: string; roleCode: string; roleName: string; branchId?: string | null; branchName?: string | null; isActive: number | boolean };
type Role = { id: string; code: string; name: string; description: string; permissionCount: number };
type Permission = { roleCode: string; code: string; module: string; name: string };
type AccessData = { users: AccessUser[]; roles: Role[]; permissions: Permission[] };
type DemoPreview = { products: number; stocks: number; movements: number; sales: number; customers: number };
type BranchStaffAccount = { branchId: string; name: string; email: string; password?: string; status: "CREATED" | "EXISTS" };

async function json(url: string, init?: RequestInit) {
  const response = await fetch(url, init); const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Permintaan gagal."); return data;
}

export function UserAccessPanel({ branches, isOwner }: { branches: Branch[]; isOwner: boolean }) {
  const [data, setData] = useState<AccessData | null>(null);
  const [editing, setEditing] = useState<AccessUser | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [demoPreview, setDemoPreview] = useState<DemoPreview | null>(null);
  const [checkingDemo, setCheckingDemo] = useState(false);
  const [cleaningDemo, setCleaningDemo] = useState(false);
  const [creatingBranchAccounts, setCreatingBranchAccounts] = useState(false);
  const [branchAccounts, setBranchAccounts] = useState<BranchStaffAccount[] | null>(null);
  const load = async () => { try { setError(""); setData(await json("/api/access")); } catch (e) { setError(e instanceof Error ? e.message : "Data akses gagal dimuat."); } };
  useEffect(() => { load(); }, []);
  const modules = useMemo(() => Array.from(new Set(data?.permissions.map((item) => item.module) || [])), [data]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return; setSaving(true);
    const form = new FormData(event.currentTarget); const isNew = editing === "new";
    try {
      await json("/api/access", { method: isNew ? "POST" : "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({
        id: isNew ? undefined : editing.id, name: form.get("name"), email: form.get("email"), roleId: form.get("roleId"),
        branchId: form.get("branchId") === "all" ? null : form.get("branchId"), isActive: form.get("isActive") === "on",
        password: form.get("password") || undefined,
      }) });
      toast.success(isNew ? "Pengguna berhasil ditambahkan." : "Akses pengguna berhasil diperbarui."); setEditing(null); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Akses gagal disimpan."); } finally { setSaving(false); }
  }

  async function inspectDemoData() {
    setCheckingDemo(true);
    try { const result = await json("/api/admin/demo-data"); setDemoPreview(result.preview); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Data contoh tidak dapat diperiksa."); }
    finally { setCheckingDemo(false); }
  }

  async function removeDemoData() {
    if (!demoPreview) return;
    setCleaningDemo(true);
    try {
      const result = await json("/api/admin/demo-data", { method: "DELETE", headers: { "x-confirm-demo-cleanup": "DELETE-DEMO-DATA" } });
      setDemoPreview({ products: 0, stocks: 0, movements: 0, sales: 0, customers: 0 });
      toast.success(`${result.removed.products} produk contoh dan stok terkait berhasil dibersihkan.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Data contoh tidak dapat dibersihkan."); }
    finally { setCleaningDemo(false); }
  }

  async function createBranchAccounts() {
    setCreatingBranchAccounts(true);
    try {
      const result = await json("/api/admin/branch-staff-accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: "CREATE-BRANCH-STAFF-ACCOUNTS" }) });
      setBranchAccounts(result.accounts); await load();
      toast.success("Lima akun cabang siap digunakan. Salin password awal sekarang.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Akun cabang tidak dapat dibuat."); }
    finally { setCreatingBranchAccounts(false); }
  }

  if (!data && !error) return <div className="space-y-4"><Skeleton className="h-12 w-72"/><Skeleton className="h-80 rounded-xl"/></div>;
  if (error) return <Card><CardContent className="py-10 text-center"><p className="font-bold">Manajemen akses belum dapat dibuka</p><p className="text-sm text-slate-500">{error}</p><Button className="mt-4" onClick={load}>Coba Lagi</Button></CardContent></Card>;
  if (!data) return null;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-bold text-[#991b1b]">HAK AKSES BACKEND</p><h1 className="mt-1 text-2xl font-black">Pengguna & peran</h1><p className="mt-1 text-sm text-slate-500">Setiap tindakan diperiksa oleh server, bukan hanya disembunyikan dari menu.</p></div><Button onClick={() => setEditing("new")} className="bg-[#991b1b] hover:bg-[#7f1d1d]"><Plus/> Tambah Pengguna</Button></div>
    <div className="grid gap-4 sm:grid-cols-3"><Summary icon={Users} label="Pengguna aktif" value={String(data.users.filter((item) => Boolean(item.isActive)).length)}/><Summary icon={UserCog} label="Peran sistem" value={String(data.roles.length)}/><Summary icon={ShieldCheck} label="Izin backend" value={String(new Set(data.permissions.map((item) => item.code)).size)}/></div>
    <Card className="gap-0 overflow-hidden py-0"><div className="border-b px-5 py-4"><h2 className="font-black">Daftar Pengguna</h2><p className="text-sm text-slate-500">Data peran dan izin akses per pengguna.</p></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="pl-5">Nama</TableHead><TableHead>Email</TableHead><TableHead>Peran</TableHead><TableHead>Cabang</TableHead><TableHead>Status</TableHead><TableHead className="pr-5 text-right">Aksi</TableHead></TableRow></TableHeader><TableBody>{data.users.map((item) => <TableRow key={item.id}><TableCell className="pl-5 font-bold">{item.name}</TableCell><TableCell>{item.email}</TableCell><TableCell><Badge variant="outline">{item.roleName}</Badge></TableCell><TableCell>{item.branchName || "Semua Cabang"}</TableCell><TableCell><Badge className={item.isActive ? "bg-emerald-600" : "bg-slate-400"}>{item.isActive ? "Aktif" : "Nonaktif"}</Badge></TableCell><TableCell className="pr-5 text-right"><Button size="sm" variant="outline" onClick={() => setEditing(item)}><Pencil/> Edit</Button></TableCell></TableRow>)}</TableBody></Table></div></Card>
    <Card className="gap-3"><CardHeader><CardTitle>Matriks Peran & Izin</CardTitle><p className="text-sm text-slate-500">Centang berarti peran tersebut diizinkan melakukan fungsi pada modul itu.</p></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Modul</TableHead>{data.roles.map((role) => <TableHead key={role.id} className="text-center">{role.name}</TableHead>)}</TableRow></TableHeader><TableBody>{modules.map((module) => <TableRow key={module}><TableCell className="font-bold">{module}</TableCell>{data.roles.map((role) => <TableCell key={role.id} className="text-center">{data.permissions.some((item) => item.module === module && item.roleCode === role.code) ? <Check className="mx-auto size-5 text-emerald-600"/> : <span className="text-slate-300">—</span>}</TableCell>)}</TableRow>)}</TableBody></Table></CardContent></Card>
    {isOwner && <Card className="border-red-200 bg-red-50/40"><CardHeader><CardTitle className="text-[#991b1b]">Pembersihan data contoh</CardTitle><p className="text-sm text-slate-600">Hanya menghapus stok, mutasi, transaksi, dan produk contoh ber-ID p1–p8. Data impor Anda (misalnya IMP-OPN-…) tidak termasuk.</p></CardHeader><CardContent className="flex flex-wrap items-center gap-3"><Button variant="outline" onClick={inspectDemoData} disabled={checkingDemo || cleaningDemo}>{checkingDemo && <Loader2 className="animate-spin"/>} Periksa data contoh</Button>{demoPreview && <p className="text-sm text-slate-600">Target: {demoPreview.products} produk, {demoPreview.stocks} stok, {demoPreview.movements} mutasi, {demoPreview.sales} transaksi, {demoPreview.customers} pelanggan.</p>}<Button variant="destructive" onClick={removeDemoData} disabled={!demoPreview || cleaningDemo || !Object.values(demoPreview).some(Boolean)}>{cleaningDemo ? <Loader2 className="animate-spin"/> : <Trash2/>} Hapus data contoh</Button></CardContent></Card>}
    {isOwner && <Card className="border-blue-200 bg-blue-50/40"><CardHeader><CardTitle className="text-blue-900">Akun karyawan cabang</CardTitle><p className="text-sm text-slate-600">Membuat satu akun POS untuk masing-masing dari lima cabang. Akun hanya dapat bertransaksi pada cabangnya, tetapi bisa melihat stok dan produk seluruh cabang.</p></CardHeader><CardContent className="space-y-3"><Button onClick={createBranchAccounts} disabled={creatingBranchAccounts} className="bg-blue-700 hover:bg-blue-800">{creatingBranchAccounts ? <Loader2 className="animate-spin"/> : <KeyRound/>} Buat 5 akun cabang</Button>{branchAccounts && <div className="overflow-x-auto rounded-lg border bg-white"><Table><TableHeader><TableRow><TableHead>Cabang</TableHead><TableHead>Email login</TableHead><TableHead>Password awal</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{branchAccounts.map((account) => <TableRow key={account.email}><TableCell>{branches.find((branch) => branch.id === account.branchId)?.name || account.branchId}</TableCell><TableCell className="font-mono text-xs">{account.email}</TableCell><TableCell className="font-mono text-xs">{account.password || "Sudah ada — password tidak diubah"}</TableCell><TableCell><Badge className={account.status === "CREATED" ? "bg-emerald-600" : "bg-slate-500"}>{account.status === "CREATED" ? "Dibuat" : "Sudah ada"}</Badge></TableCell></TableRow>)}</TableBody></Table></div>}<p className="text-xs text-slate-500">Password hanya muncul sekali saat akun baru dibuat. Ganti dari menu Edit Pengguna bila diperlukan.</p></CardContent></Card>}
    <Dialog open={editing !== null} onOpenChange={(value) => !value && setEditing(null)}><DialogContent><DialogHeader><DialogTitle>{editing === "new" ? "Tambah Pengguna" : "Edit Pengguna"}</DialogTitle><DialogDescription>{editing === "new" ? "Akun ini bisa langsung dipakai untuk login ke aplikasi." : "Kosongkan password kalau tidak ingin menggantinya."}</DialogDescription></DialogHeader>{editing && <form onSubmit={submit} className="space-y-4"><Field label="Nama"><Input name="name" required defaultValue={editing === "new" ? "" : editing.name} className="h-11"/></Field><Field label="Email"><Input name="email" type="email" required defaultValue={editing === "new" ? "" : editing.email} className="h-11"/></Field><Field label={editing === "new" ? "Password *" : "Password Baru (opsional)"}><Input name="password" type="password" minLength={6} required={editing === "new"} placeholder={editing === "new" ? "Minimal 6 karakter" : "Kosongkan jika tidak diganti"} className="h-11"/></Field><div className="grid grid-cols-2 gap-3"><Field label="Peran"><Select name="roleId" required defaultValue={editing === "new" ? "role-cashier" : editing.roleId}><SelectTrigger className="h-11 w-full"><SelectValue/></SelectTrigger><SelectContent>{data.roles.map((role) => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}</SelectContent></Select></Field><Field label="Cabang"><Select name="branchId" defaultValue={editing === "new" ? branches[0]?.id : editing.branchId || "all"}><SelectTrigger className="h-11 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Semua Cabang</SelectItem>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></Field></div><label className="flex items-center gap-2 text-sm font-semibold"><Checkbox name="isActive" defaultChecked={editing === "new" ? true : Boolean(editing.isActive)}/> Akun aktif</label><DialogFooter><Button type="button" variant="outline" onClick={() => setEditing(null)}>Batal</Button><Button disabled={saving} className="bg-[#991b1b] hover:bg-[#7f1d1d]">{saving && <Loader2 className="animate-spin"/>} Simpan Akses</Button></DialogFooter></form>}</DialogContent></Dialog>
  </div>;
}

function Summary({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) { return <Card className="py-5"><CardContent className="flex items-center justify-between px-5"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div><div className="grid size-11 place-items-center rounded-xl bg-red-50 text-[#991b1b]"><Icon className="size-5"/></div></CardContent></Card>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
