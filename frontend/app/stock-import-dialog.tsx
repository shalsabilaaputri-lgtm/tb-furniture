"use client";

import { useState } from "react";
import { FileScan, Loader2, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type Branch = { id: string; name: string };
type Product = { id: string; sku: string; name: string; unit: string };
type DraftRow = { sourceName: string; sku: string; barcode: string; quantity: number; unit: string; productId: string | null; productName: string | null; status: "MATCHED" | "REVIEW" };
type Draft = { sourceName: string; direction: "IN" | "OUT"; reference: string; rows: DraftRow[]; privacy: string };

export function StockImportDialog({
  open, close, branches, products, defaultBranch, reload,
}: {
  open: boolean; close: () => void; branches: Branch[]; products: Product[]; defaultBranch: string; reload: () => Promise<void>;
}) {
  const [branchId, setBranchId] = useState(defaultBranch === "all" ? branches[0]?.id || "" : defaultBranch);
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => { setDraft(null); setParsing(false); setSaving(false); };
  const closeDialog = () => { reset(); close(); };

  const parse = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!(form.get("file") instanceof File) || !(form.get("file") as File).size) return toast.error("Pilih berkas terlebih dahulu.");
    form.set("branchId", branchId); form.set("direction", direction);
    setParsing(true);
    try {
      const response = await fetch("/api/stock/import", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Berkas tidak dapat diproses.");
      setDirection(result.direction === "OUT" ? "OUT" : "IN");
      setDraft(result);
      toast.success(`${result.rows.length} baris berhasil dibaca. Periksa sebelum diterapkan.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Berkas tidak dapat diproses."); }
    finally { setParsing(false); }
  };

  const setProduct = (index: number, productId: string) => setDraft((current) => current && {
    ...current,
    rows: current.rows.map((row, rowIndex) => rowIndex === index ? {
      ...row,
      productId: productId || null,
      productName: products.find((product) => product.id === productId)?.name || null,
      status: productId ? "MATCHED" : "REVIEW",
    } : row),
  });
  const setQuantity = (index: number, quantity: string) => setDraft((current) => current && {
    ...current,
    rows: current.rows.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: Number(quantity) } : row),
  });
  const unresolved = draft?.rows.some((row) => !row.productId || !Number.isFinite(row.quantity) || row.quantity <= 0) ?? false;

  const apply = async () => {
    if (!draft || unresolved) return;
    setSaving(true);
    try {
      const response = await fetch("/api/stock/import/apply", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ branchId, direction, sourceName: draft.sourceName, reference: draft.reference, items: draft.rows }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Stok tidak dapat diperbarui.");
      toast.success(`${result.itemCount} produk diterapkan ke stok: ${result.reference}`);
      closeDialog(); await reload();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Stok tidak dapat diperbarui."); }
    finally { setSaving(false); }
  };

  return <Dialog open={open} onOpenChange={(value) => !value && closeDialog()}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><FileScan className="size-5 text-[#991b1b]" /> Impor nota atau Excel</DialogTitle>
        <DialogDescription>Excel/CSV dibaca langsung; PDF dan foto dibaca dengan OCR. Stok hanya berubah setelah Anda menerapkan hasilnya.</DialogDescription>
      </DialogHeader>
      {!draft ? <form onSubmit={parse} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label>Cabang</Label><Select value={branchId} onValueChange={setBranchId}><SelectTrigger className="w-full"><SelectValue placeholder="Pilih cabang" /></SelectTrigger><SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Jenis mutasi</Label><Select value={direction} onValueChange={(value: "IN" | "OUT") => setDirection(value)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="IN">Barang masuk</SelectItem><SelectItem value="OUT">Barang keluar</SelectItem></SelectContent></Select></div>
        </div>
        <div className="rounded-xl border border-dashed bg-slate-50 p-5"><Label htmlFor="stock-import-file" className="flex cursor-pointer flex-col items-center gap-2 text-center"><Upload className="size-7 text-[#991b1b]" /><b>Pilih PDF, foto, Excel, atau CSV</b><span className="text-xs font-normal text-slate-500">JPG, PNG, WEBP, PDF, XLSX, XLS, CSV • maksimum 8 MB</span></Label><Input id="stock-import-file" name="file" type="file" required accept=".xlsx,.xls,.csv,.pdf,image/jpeg,image/png,image/webp" className="sr-only" /></div>
        <div className="flex gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800"><ShieldCheck className="size-4 shrink-0" />Berkas asli diproses hanya di memori, tidak disimpan ke Neon, dan langsung dibuang setelah pembacaan selesai.</div>
        <DialogFooter><Button type="button" variant="outline" onClick={closeDialog}>Batal</Button><Button disabled={parsing || !branchId} className="bg-[#991b1b] hover:bg-[#7f1d1d]">{parsing ? <Loader2 className="animate-spin" /> : <FileScan />} Baca berkas</Button></DialogFooter>
      </form> : <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm"><div><b>{draft.sourceName}</b><p className="text-xs text-slate-500">{draft.privacy}</p></div><Badge className={direction === "IN" ? "bg-emerald-600" : "bg-red-600"}>{direction === "IN" ? "Barang masuk" : "Barang keluar"}</Badge></div>
        <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[680px] text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="p-3">Tertulis di dokumen</th><th className="p-3">Produk sistem</th><th className="p-3">Jumlah</th><th className="p-3">Status</th></tr></thead><tbody>{draft.rows.map((row, index) => <tr key={`${row.sourceName}-${index}`} className="border-t align-top"><td className="p-3"><b>{row.sourceName}</b><p className="text-xs text-slate-500">{row.sku || row.barcode || "tanpa SKU/barcode"}</p></td><td className="p-3"><Select value={row.productId || "unmatched"} onValueChange={(value) => setProduct(index, value === "unmatched" ? "" : value)}><SelectTrigger className="w-[280px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unmatched">Pilih produk…</SelectItem>{products.map((product) => <SelectItem key={product.id} value={product.id}>{product.sku} — {product.name}</SelectItem>)}</SelectContent></Select></td><td className="p-3"><Input value={Number.isFinite(row.quantity) ? row.quantity : ""} onChange={(event) => setQuantity(index, event.target.value)} type="number" min=".01" step=".01" className="w-28" /><span className="ml-2 text-xs text-slate-500">{row.unit}</span></td><td className="p-3"><Badge variant="secondary" className={row.productId ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}>{row.productId ? "Cocok" : "Perlu pilih"}</Badge></td></tr>)}</tbody></table></div>
        {unresolved && <p className="text-sm text-amber-700">Pilih produk dan pastikan jumlah pada semua baris sebelum menerapkan stok.</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={() => setDraft(null)}>Unggah ulang</Button><Button disabled={saving || unresolved} onClick={apply} className="bg-[#991b1b] hover:bg-[#7f1d1d]">{saving && <Loader2 className="animate-spin" />} Terapkan ke stok</Button></DialogFooter>
      </div>}
    </DialogContent>
  </Dialog>;
}
