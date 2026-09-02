"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type StockMode = "IN" | "OUT" | "ADJUST";

type StockData = {
  branches: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string }>;
};

async function json(url: string, options: RequestInit) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Permintaan gagal.");
  return payload;
}

export function StockAdjustmentDialog({
  open,
  close,
  data,
  defaultBranch,
  reload,
}: {
  open: StockMode | null;
  close: () => void;
  data: StockData;
  defaultBranch: string;
  reload: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const adjustment = open === "ADJUST";

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await json("/api/stock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: open,
          branchId: form.get("branchId"),
          productId: form.get("productId"),
          quantity: Number(form.get("quantity")),
          reason: form.get("reason"),
        }),
      });
      toast.success(`Tersimpan: ${result.reference}`);
      close();
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  };

  const title = open === "IN" ? "Catat Barang Masuk" : open === "OUT" ? "Catat Barang Keluar" : "Penyesuaian Stok";

  return (
    <Dialog open={open !== null} onOpenChange={(value) => !value && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {adjustment
              ? "Masukkan jumlah stok fisik terbaru. Selisihnya dicatat otomatis di kartu stok dan audit log."
              : "Stok dan kartu stok akan diperbarui otomatis."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Cabang</Label>
            <Select name="branchId" defaultValue={defaultBranch === "all" ? data.branches[0]?.id : defaultBranch} required>
              <SelectTrigger className="h-11 w-full"><SelectValue placeholder="Pilih cabang" /></SelectTrigger>
              <SelectContent>{data.branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Produk</Label>
            <Select name="productId" required>
              <SelectTrigger className="h-11 w-full"><SelectValue placeholder="Pilih produk" /></SelectTrigger>
              <SelectContent>{data.products.map((product) => <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{adjustment ? "Stok Fisik Terbaru" : "Jumlah"}</Label>
            <Input name="quantity" type="number" min={adjustment ? "0" : ".01"} step=".01" required className="h-11" />
          </div>
          <div className="space-y-2">
            <Label>Alasan / sumber</Label>
            <Input
              name="reason"
              required
              className="h-11"
              placeholder={adjustment ? "Contoh: hasil stok opname" : open === "IN" ? "Pembelian supplier" : "Pemakaian internal"}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>Batal</Button>
            <Button disabled={saving} className="bg-[#991b1b] hover:bg-[#7f1d1d]">
              {saving && <Loader2 className="animate-spin" />} Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
