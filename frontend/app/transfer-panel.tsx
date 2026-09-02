"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, PackageCheck, Plus, RefreshCw, Truck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Branch = { id: string; name: string; shortName: string };
type Product = { id: string; name: string; sku: string; unit: string };
type Transfer = {
  id: string; transferNumber: string; sourceBranchId: string; sourceBranchName: string;
  destinationBranchId: string; destinationBranchName: string; status: string; note: string;
  requestedBy: string; createdAt: string;
  items: Array<{ productId: string; productName: string; unit: string; quantity: number }>;
};

async function json(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Permintaan gagal.");
  return payload;
}

const statusTone: Record<string, string> = {
  REQUESTED: "bg-amber-50 text-amber-800",
  APPROVED: "bg-blue-50 text-blue-800",
  IN_TRANSIT: "bg-violet-50 text-violet-800",
  RECEIVED: "bg-emerald-50 text-emerald-800",
};

export function TransferPanel({ branches, products, selectedBranch, roleCode, permissions, reload }: {
  branches: Branch[]; products: Product[]; selectedBranch: string; roleCode: string; permissions: string[]; reload: () => Promise<void>;
}) {
  const [rows, setRows] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const all = roleCode === "OWNER";
  const can = (permission: string) => all || permissions.includes(permission);

  const load = async () => {
    setLoading(true);
    try { setRows(await json(`/api/transfers?branchId=${selectedBranch}`)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Transfer gagal dimuat."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [selectedBranch]);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await json("/api/transfers", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceBranchId: form.get("sourceBranchId"), destinationBranchId: form.get("destinationBranchId"),
          note: form.get("note"), items: [{ productId: form.get("productId"), quantity: Number(form.get("quantity")) }],
        }),
      });
      toast.success(`Transfer ${result.transferNumber} dibuat.`);
      setOpen(false); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Transfer gagal dibuat."); }
    finally { setSaving(false); }
  };

  const action = async (id: string, next: "APPROVE" | "DISPATCH" | "RECEIVE") => {
    setSaving(true);
    try {
      const result = await json("/api/transfers", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action: next }) });
      toast.success(`${result.transferNumber} sekarang ${result.status}.`);
      await Promise.all([load(), reload()]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Transfer gagal diproses."); }
    finally { setSaving(false); }
  };

  const defaultSource = selectedBranch === "all" ? branches[0]?.id : selectedBranch;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-black">Transfer Antar Cabang</h1><p className="text-sm text-slate-500">Stok asal berkurang saat dikirim dan stok tujuan bertambah saat diterima.</p></div>
      <div className="flex gap-2"><Button variant="outline" onClick={load}><RefreshCw/> Perbarui</Button>{can("transfer.request") && <Button onClick={() => setOpen(true)} className="bg-[#991b1b] hover:bg-[#7f1d1d]"><Plus/> Buat Transfer</Button>}</div>
    </div>
    <Card><CardHeader><CardTitle>Riwayat Transfer</CardTitle></CardHeader><CardContent>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Nomor</TableHead><TableHead>Rute</TableHead><TableHead>Barang</TableHead><TableHead>Status</TableHead><TableHead>Tanggal</TableHead><TableHead className="text-right">Tindakan</TableHead></TableRow></TableHeader><TableBody>
        {loading ? <TableRow><TableCell colSpan={6} className="py-12 text-center"><Loader2 className="mx-auto animate-spin"/></TableCell></TableRow> : !rows.length ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-slate-500">Belum ada transfer.</TableCell></TableRow> : rows.map((row) => <TableRow key={row.id}>
          <TableCell><b>{row.transferNumber}</b><p className="text-xs text-slate-500">{row.requestedBy}</p></TableCell>
          <TableCell><div className="flex items-center gap-2"><span>{row.sourceBranchName}</span><ArrowRight className="size-4 text-slate-400"/><span>{row.destinationBranchName}</span></div></TableCell>
          <TableCell>{row.items.map((item) => <div key={item.productId}><b className="text-sm">{item.productName}</b><p className="text-xs text-slate-500">{item.quantity} {item.unit}</p></div>)}</TableCell>
          <TableCell><Badge className={statusTone[row.status] || ""}>{row.status.replace("_", " ")}</Badge></TableCell>
          <TableCell>{new Date(row.createdAt).toLocaleString("id-ID")}</TableCell>
          <TableCell><div className="flex justify-end gap-2">
            {row.status === "REQUESTED" && can("transfer.approve") && <Button size="sm" variant="outline" disabled={saving} onClick={() => action(row.id, "APPROVE")}><CheckCircle2/> Setujui</Button>}
            {row.status === "APPROVED" && can("transfer.dispatch") && <Button size="sm" variant="outline" disabled={saving} onClick={() => action(row.id, "DISPATCH")}><Truck/> Kirim</Button>}
            {row.status === "IN_TRANSIT" && can("transfer.receive") && <Button size="sm" disabled={saving} onClick={() => action(row.id, "RECEIVE")} className="bg-emerald-600 hover:bg-emerald-700"><PackageCheck/> Terima</Button>}
          </div></TableCell>
        </TableRow>)}
      </TableBody></Table></div>
    </CardContent></Card>

    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Buat Transfer Stok</DialogTitle><DialogDescription>Transfer harus disetujui sebelum barang dapat dikirim.</DialogDescription></DialogHeader>
      <form onSubmit={create} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Cabang Asal</Label><Select name="sourceBranchId" defaultValue={defaultSource} required><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Cabang Tujuan</Label><Select name="destinationBranchId" required><SelectTrigger className="w-full"><SelectValue placeholder="Pilih tujuan"/></SelectTrigger><SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></div></div>
        <div className="space-y-2"><Label>Produk</Label><Select name="productId" required><SelectTrigger className="w-full"><SelectValue placeholder="Pilih produk"/></SelectTrigger><SelectContent>{products.map((product) => <SelectItem key={product.id} value={product.id}>{product.name} — {product.sku}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Jumlah</Label><Input name="quantity" type="number" min=".01" step=".01" required/></div>
        <div className="space-y-2"><Label>Catatan</Label><Input name="note" placeholder="Tujuan atau keterangan transfer"/></div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button disabled={saving} className="bg-[#991b1b]">{saving && <Loader2 className="animate-spin"/>} Simpan</Button></DialogFooter>
      </form>
    </DialogContent></Dialog></div>;
}
