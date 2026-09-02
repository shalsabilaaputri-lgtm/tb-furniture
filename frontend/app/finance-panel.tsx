"use client";

import { useState } from "react";
import { Banknote, Boxes, Loader2, Pencil, Plus, TrendingUp, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Branch = { id: string; name: string };
type Item = { quantity: number; costPrice?: number; unitPrice: number };
type Transaction = { branchId: string; createdAt: string; status: string; total: number; items: Item[] };
type Expense = { id: string; branchId: string; branchName: string; category: string; amount: number; paymentMethod: string; description: string; createdAt: string };
type FinanceData = { branches: Branch[]; transactions: Transaction[]; expenses: Expense[] };
const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

async function json(url: string, init?: RequestInit) {
  const response = await fetch(url, init); const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Terjadi kesalahan."); return data;
}

export function FinancePanel({ data, branch, open, reload }: { data: FinanceData; branch: string; open: () => void; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<Expense | null>(null);
  const [saving, setSaving] = useState(false);
  const month = new Date().toISOString().slice(0, 7);
  const sales = data.transactions.filter((item) => (branch === "all" || item.branchId === branch) && item.createdAt.slice(0, 7) === month && item.status !== "VOID");
  const expenses = data.expenses.filter((item) => (branch === "all" || item.branchId === branch) && item.createdAt.slice(0, 7) === month);
  const omzet = sales.reduce((sum, item) => sum + Number(item.total), 0);
  const hpp = sales.reduce((sum, item) => sum + (item.items.length ? item.items.reduce((value, row) => value + Number(row.costPrice ?? row.unitPrice * .82) * Number(row.quantity), 0) : Number(item.total) * .82), 0);
  const expenseTotal = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const gross = omzet - hpp; const net = gross - expenseTotal;

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return; setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      await json("/api/expenses", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({
        id: editing.id, branchId: form.get("branchId"), category: form.get("category"),
        amount: Number(form.get("amount")), paymentMethod: form.get("paymentMethod"), description: form.get("description"),
      }) });
      toast.success("Pengeluaran berhasil diperbarui."); setEditing(null); await reload();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Perubahan gagal."); }
    finally { setSaving(false); }
  }

  const cards = [
    ["Omzet Bulan Ini", omzet, WalletCards, "bg-blue-50 text-blue-700"],
    ["HPP", hpp, Boxes, "bg-amber-50 text-amber-700"],
    ["Laba Kotor", gross, TrendingUp, "bg-emerald-50 text-emerald-700"],
    ["Laba Bersih", net, Banknote, "bg-red-50 text-red-800"],
  ] as const;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-bold text-[#991b1b]">LAPORAN REAL-TIME</p><h1 className="mt-1 text-2xl font-black">Laporan keuangan</h1></div><Button onClick={open} className="bg-[#991b1b] hover:bg-[#7f1d1d]"><Plus/> Catat Pengeluaran</Button></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value, Icon, color]) => <Card key={label} className="gap-2 py-5"><CardContent className="flex items-center justify-between gap-3 px-5"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-xl font-black">{rupiah.format(value)}</p></div><div className={`grid size-11 place-items-center rounded-xl ${color}`}><Icon className="size-5"/></div></CardContent></Card>)}</div>
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="gap-3"><CardHeader><CardTitle>Ringkasan Laba Rugi</CardTitle></CardHeader><CardContent className="space-y-4"><Line label="Penjualan bersih" value={omzet}/><Line label="Harga pokok penjualan" value={-hpp}/><Line label="Laba kotor" value={gross} bold/><Line label="Biaya operasional" value={-expenseTotal}/><Line label="Laba bersih" value={net} bold accent/></CardContent></Card>
      <Card className="gap-3"><CardHeader><CardTitle>Pengeluaran Terbaru</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Kategori</TableHead><TableHead>Cabang</TableHead><TableHead className="text-right">Jumlah</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader><TableBody>{expenses.slice(0, 10).map((item) => <TableRow key={item.id}><TableCell><b>{item.category}</b><p className="text-xs text-slate-400">{item.description}</p></TableCell><TableCell>{item.branchName}</TableCell><TableCell className="text-right font-black text-red-600">{rupiah.format(item.amount)}</TableCell><TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setEditing(item)}><Pencil/> Edit</Button></TableCell></TableRow>)}</TableBody></Table>{!expenses.length && <p className="py-8 text-center text-sm text-slate-500">Belum ada pengeluaran bulan ini.</p>}</CardContent></Card>
    </div>
    <Dialog open={editing !== null} onOpenChange={(value) => !value && setEditing(null)}><DialogContent><DialogHeader><DialogTitle>Edit Pengeluaran</DialogTitle><DialogDescription>Perubahan akan dicatat dalam audit log.</DialogDescription></DialogHeader>{editing && <form onSubmit={saveEdit} className="space-y-4"><Field label="Cabang"><Select name="branchId" defaultValue={editing.branchId}><SelectTrigger className="h-11 w-full"><SelectValue/></SelectTrigger><SelectContent>{data.branches.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></Field><Field label="Kategori"><Select name="category" defaultValue={editing.category}><SelectTrigger className="h-11 w-full"><SelectValue/></SelectTrigger><SelectContent>{["Listrik","BBM","Bongkar","Transport","Perbaikan","Gaji Harian","Konsumsi","ATK","Biaya Lain"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></Field><Field label="Jumlah"><Input name="amount" type="number" min="1" defaultValue={editing.amount} required className="h-11"/></Field><Field label="Metode"><Select name="paymentMethod" defaultValue={editing.paymentMethod}><SelectTrigger className="h-11 w-full"><SelectValue/></SelectTrigger><SelectContent>{["Cash","Transfer","QRIS","Debit"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></Field><Field label="Keterangan"><Input name="description" defaultValue={editing.description} className="h-11"/></Field><DialogFooter><Button type="button" variant="outline" onClick={() => setEditing(null)}>Batal</Button><Button disabled={saving} className="bg-[#991b1b]">{saving && <Loader2 className="animate-spin"/>} Simpan Perubahan</Button></DialogFooter></form>}</DialogContent></Dialog>
  </div>;
}

function Line({ label, value, bold = false, accent = false }: { label: string; value: number; bold?: boolean; accent?: boolean }) {
  return <div className={`flex justify-between border-b pb-3 ${bold ? "font-black" : ""} ${accent ? "text-[#991b1b]" : ""}`}><span>{label}</span><span>{value < 0 ? "−" : ""}{rupiah.format(Math.abs(value))}</span></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="space-y-1.5 text-sm font-semibold text-slate-700"><span>{label}</span>{children}</label>; }
