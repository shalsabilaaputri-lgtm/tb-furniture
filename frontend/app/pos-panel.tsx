"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, CreditCard, Loader2, MessageCircle, Minus, Plus, Printer, ReceiptText, Search, ShoppingCart, Store, Users, Warehouse, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Branch = { id: string; shortName: string };
type Stock = { branchId: string; available: number };
type Product = { id: string; sku: string; barcode: string; name: string; brand: string; unit: string; sellingPrice: number; minimumStock: number; stocks: Stock[] };
type Customer = { id: string; name: string; whatsapp: string };
type PosData = { branches: Branch[]; products: Product[]; customers: Customer[] };
type CartItem = { product: Product; quantity: number; unitPrice: number };
type ReceiptTransaction = {
  id: string; invoiceNumber: string; branchId: string; branchName: string; customerId?: string;
  customerName: string; customerPhone?: string; subtotal: number; discount: number;
  deliveryDistance?: number; deliveryFee?: number; deliveryApproval?: string; total: number;
  paymentMethod: string; paidAmount: number; status: string; createdAt: string;
  items: Array<{ saleId: string; productId: string; productName: string; quantity: number; unit: string; unitPrice: number; lineTotal: number }>;
};

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const qty = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const availableAt = (product: Product, branchId: string) => product.stocks.find((stock) => stock.branchId === branchId)?.available ?? 0;

async function json(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Terjadi kesalahan.");
  return data;
}

function normalizePhone(value: string) {
  let phone = value.replace(/\D/g, "");
  if (phone.startsWith("0")) phone = `62${phone.slice(1)}`;
  return phone;
}

function whatsappUrl(transaction: ReceiptTransaction) {
  const lines = transaction.items.map((item) => `• ${item.productName}\n  ${qty.format(item.quantity)} ${item.unit} × ${rupiah.format(item.unitPrice)} = ${rupiah.format(item.lineTotal)}`).join("\n");
  const message = [
    "*TB PERMATA KERAMIK*", transaction.branchName, "",
    `Nota: ${transaction.invoiceNumber}`, `Customer: ${transaction.customerName}`, "",
    lines, "", `Subtotal: ${rupiah.format(transaction.subtotal)}`,
    `Diskon: ${rupiah.format(transaction.discount)}`,
    `Ongkir: ${rupiah.format(transaction.deliveryFee || 0)}`,
    `*TOTAL: ${rupiah.format(transaction.total)}*`,
    `Pembayaran: ${transaction.paymentMethod}`, "", "Terima kasih sudah berbelanja.",
  ].join("\n");
  return `https://wa.me/${normalizePhone(transaction.customerPhone || "")}?text=${encodeURIComponent(message)}`;
}

export function PosPanel({ data, initialBranch, reload, printReceipt, canApproveDelivery }: {
  data: PosData; initialBranch: string; reload: () => Promise<void>;
  printReceipt: (transaction: ReceiptTransaction) => void;
  canApproveDelivery: boolean;
}) {
  const [branchId, setBranchId] = useState(initialBranch);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState("walk-in");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [method, setMethod] = useState("Cash");
  const [discount, setDiscount] = useState(0);
  const [distance, setDistance] = useState(0);
  const [manualFee, setManualFee] = useState(0);
  const [ownerApproval, setOwnerApproval] = useState(false);
  const [saving, setSaving] = useState(false);

  const customer = data.customers.find((item) => item.id === customerId);
  const customerPhone = customerId === "walk-in" ? walkInPhone : customer?.whatsapp ?? "";
  const products = useMemo(() => data.products.filter((product) =>
    [product.name, product.sku, product.barcode, product.brand].some((value) => value?.toLowerCase().includes(search.toLowerCase()))
  ), [data.products, search]);
  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const safeDiscount = Math.min(Math.max(0, discount), subtotal);
  const deliveryFee = distance <= 0 ? 0 : distance <= 5 ? 25000 : distance <= 10 ? 50000 : distance <= 20 ? 75000 : Math.max(0, manualFee);
  const total = subtotal - safeDiscount + deliveryFee;

  function addProduct(product: Product) {
    const available = availableAt(product, branchId);
    if (available <= 0) return toast.error("Stok produk kosong di cabang ini.");
    setCart((current) => {
      const found = current.find((item) => item.product.id === product.id);
      if (found) return current.map((item) => item.product.id === product.id ? { ...item, quantity: Math.min(item.quantity + 1, available) } : item);
      return [...current, { product, quantity: 1, unitPrice: product.sellingPrice }];
    });
  }

  function changeQuantity(productId: string, value: number) {
    setCart((current) => current.map((item) => {
      if (item.product.id !== productId) return item;
      const available = availableAt(item.product, branchId);
      return { ...item, quantity: Math.min(available, Math.max(0.01, Number.isFinite(value) ? value : 0.01)) };
    }));
  }

  async function submit(mode: "save" | "print" | "whatsapp") {
    if (!cart.length) return toast.error("Keranjang masih kosong.");
    if (distance > 20 && !ownerApproval) return toast.error("Ongkir lebih dari 20 km harus disetujui owner.");
    if (mode === "whatsapp" && !normalizePhone(customerPhone)) return toast.error("Nomor WhatsApp pelanggan belum diisi.");
    const waWindow = mode === "whatsapp" ? window.open("about:blank", "_blank") : null;
    setSaving(true);
    try {
      const result = await json("/api/sales", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          branchId, customerId: customerId === "walk-in" ? null : customerId, customerPhone,
          items: cart.map((item) => ({ productId: item.product.id, quantity: item.quantity, unitPrice: item.unitPrice })),
          discount: safeDiscount, deliveryDistance: distance, deliveryFee,
          ownerDeliveryApproval: ownerApproval, paymentMethod: method, paidAmount: method === "Piutang" ? 0 : total,
        }),
      });
      const transaction: ReceiptTransaction = {
        id: result.invoiceNumber, invoiceNumber: result.invoiceNumber, branchId,
        branchName: data.branches.find((branch) => branch.id === branchId)?.shortName ?? "",
        customerId: customerId === "walk-in" ? undefined : customerId,
        customerName: customerId === "walk-in" ? "Customer Umum" : customer?.name ?? "Customer",
        customerPhone, subtotal, discount: safeDiscount, deliveryDistance: distance,
        deliveryFee: result.deliveryFee, deliveryApproval: result.deliveryApproval, total: result.total,
        paymentMethod: method, paidAmount: result.paidAmount,
        status: method === "Piutang" ? "PARTIAL" : "PAID", createdAt: new Date().toISOString(),
        items: cart.map((item) => ({
          saleId: result.invoiceNumber, productId: item.product.id, productName: item.product.name,
          quantity: item.quantity, unit: item.product.unit, unitPrice: item.unitPrice,
          lineTotal: item.quantity * item.unitPrice,
        })),
      };
      toast.success(`Transaksi ${result.invoiceNumber} berhasil disimpan.`);
      if (mode === "print") printReceipt(transaction);
      if (mode === "whatsapp" && waWindow) waWindow.location.href = whatsappUrl(transaction);
      setCart([]); setDiscount(0); setDistance(0); setManualFee(0); setOwnerApproval(false);
      await reload();
    } catch (error) {
      waWindow?.close();
      toast.error(error instanceof Error ? error.message : "Transaksi gagal.");
    } finally { setSaving(false); }
  }

  return <div className="grid min-h-[calc(100vh-9rem)] gap-4 xl:grid-cols-[1fr_440px]">
    <Card className="min-w-0 gap-4 py-4">
      <CardHeader className="gap-4 px-4 md:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><CardTitle>Pilih Barang</CardTitle><p className="text-sm text-slate-500">Jumlah besar dapat langsung diketik di keranjang</p></div>
          <Select value={branchId} onValueChange={(value) => { setBranchId(value); setCart([]); }}>
            <SelectTrigger className="h-11 w-[180px]"><Warehouse className="size-4"/><SelectValue/></SelectTrigger>
            <SelectContent>{data.branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.shortName}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="relative"><Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400"/><Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-12 bg-white pl-12 text-base" placeholder="Cari nama, SKU, atau scan barcode…"/></div>
      </CardHeader>
      <CardContent className="grid max-h-[calc(100vh-15rem)] gap-3 overflow-y-auto px-4 sm:grid-cols-2 2xl:grid-cols-3">
        {products.map((product) => { const stock = availableAt(product, branchId); return <button key={product.id} onClick={() => addProduct(product)} disabled={stock <= 0} className="flex min-h-28 flex-col justify-between rounded-xl border bg-white p-4 text-left transition hover:border-[#991b1b] hover:shadow-md disabled:opacity-50">
          <div><div className="flex justify-between gap-2"><Badge variant="secondary">{product.brand}</Badge><b className={`text-xs ${stock <= product.minimumStock ? "text-red-600" : "text-emerald-700"}`}>{qty.format(stock)} {product.unit}</b></div><p className="mt-3 line-clamp-2 text-sm font-bold">{product.name}</p></div>
          <div className="mt-3 flex justify-between gap-2"><span className="text-xs text-slate-400">{product.sku}</span><b className="text-[#991b1b]">{rupiah.format(product.sellingPrice)}</b></div>
        </button>; })}
      </CardContent>
    </Card>

    <Card className="sticky top-20 h-fit gap-0 overflow-hidden py-0">
      <div className="flex items-center justify-between bg-slate-950 px-5 py-4 text-white"><b className="flex gap-2"><ReceiptText className="size-5"/> Keranjang</b><Badge className="bg-white/15">{cart.length} item</Badge></div>
      <div className="max-h-[33vh] min-h-32 space-y-3 overflow-y-auto p-4">
        {!cart.length ? <div className="grid min-h-32 place-items-center text-center text-sm text-slate-400"><div><ShoppingCart className="mx-auto mb-2 size-8"/>Belum ada barang</div></div> :
          cart.map((item) => <div key={item.product.id} className="rounded-xl border p-3">
            <div className="flex justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-bold">{item.product.name}</p><p className="text-xs text-slate-500">{rupiah.format(item.unitPrice)} / {item.product.unit}</p></div><button onClick={() => setCart((current) => current.filter((row) => row.product.id !== item.product.id))}><X className="size-4 text-slate-400"/></button></div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex items-center rounded-lg border bg-white">
                <button className="grid size-10 place-items-center" onClick={() => changeQuantity(item.product.id, item.quantity - 1)}><Minus className="size-4"/></button>
                <Input aria-label={`Jumlah ${item.product.name}`} type="number" min=".01" max={availableAt(item.product, branchId)} step=".01" value={item.quantity} onChange={(event) => changeQuantity(item.product.id, Number(event.target.value))} className="h-10 w-24 rounded-none border-y-0 text-center font-black"/>
                <button className="grid size-10 place-items-center" onClick={() => changeQuantity(item.product.id, item.quantity + 1)}><Plus className="size-4"/></button>
              </div>
              <b>{rupiah.format(item.quantity * item.unitPrice)}</b>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Maksimal tersedia {qty.format(availableAt(item.product, branchId))} {item.product.unit}</p>
          </div>)}
      </div>

      <div className="space-y-3 border-t bg-slate-50 p-4">
        <div className="grid grid-cols-2 gap-2">
          <Select value={customerId} onValueChange={setCustomerId}><SelectTrigger className="h-11 w-full bg-white"><Users className="size-4"/><SelectValue/></SelectTrigger><SelectContent><SelectItem value="walk-in">Customer Umum</SelectItem>{data.customers.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
          <Select value={method} onValueChange={setMethod}><SelectTrigger className="h-11 w-full bg-white"><CreditCard className="size-4"/><SelectValue/></SelectTrigger><SelectContent>{["Cash","Transfer","QRIS","Debit","Piutang"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
        </div>
        <Input value={customerPhone} onChange={(event) => customerId === "walk-in" && setWalkInPhone(event.target.value)} readOnly={customerId !== "walk-in"} className="h-10 bg-white" placeholder="Nomor WhatsApp pelanggan, contoh 0812…"/>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Diskon Nominal (Rp)</span><Input type="number" min="0" max={subtotal} value={discount || ""} onChange={(event) => setDiscount(Math.max(0, Number(event.target.value)))} className="h-10 bg-white"/></label>
          <label className="space-y-1 text-xs font-semibold text-slate-600"><span>Jarak Kirim (km)</span><Input type="number" min="0" step=".1" value={distance || ""} onChange={(event) => { setDistance(Math.max(0, Number(event.target.value))); setOwnerApproval(false); }} className="h-10 bg-white"/></label>
        </div>
        <div className="rounded-xl border bg-white p-3 text-sm">
          <div className="flex items-center justify-between"><span>Ongkir</span><b>{rupiah.format(deliveryFee)}</b></div>
          <p className="mt-1 text-xs text-slate-500">0–5 km Rp25.000 • 5–10 km Rp50.000 • 10–20 km Rp75.000</p>
          {distance > 20 && <div className="mt-3 space-y-2 rounded-lg bg-amber-50 p-3 text-amber-900"><b className="text-xs">Lebih dari 20 km — wajib tanya owner</b><Input type="number" min="0" value={manualFee || ""} onChange={(event) => setManualFee(Math.max(0, Number(event.target.value)))} className="h-10 bg-white" placeholder="Masukkan ongkir dari owner" disabled={!canApproveDelivery}/><label className="flex items-center gap-2 text-xs font-semibold"><Checkbox checked={ownerApproval} onCheckedChange={(checked) => setOwnerApproval(checked === true)} disabled={!canApproveDelivery}/> {canApproveDelivery ? "Sudah disetujui owner" : "Minta owner/manager menyelesaikan transaksi ini"}</label></div>}
        </div>
        <div className="space-y-1 border-t pt-3 text-sm"><div className="flex justify-between"><span>Subtotal</span><b>{rupiah.format(subtotal)}</b></div><div className="flex justify-between text-emerald-700"><span>Diskon</span><b>−{rupiah.format(safeDiscount)}</b></div><div className="flex justify-between"><span>Ongkir</span><b>{rupiah.format(deliveryFee)}</b></div></div>
        <div className="flex items-end justify-between"><b>TOTAL</b><b className="text-2xl text-[#991b1b]">{rupiah.format(total)}</b></div>
        <div className="grid grid-cols-3 gap-2">
          <Button onClick={() => submit("save")} disabled={saving || !cart.length} variant="outline" className="h-12 px-2 font-bold">{saving ? <Loader2 className="animate-spin"/> : <CheckCircle2/>}<span className="hidden sm:inline">Simpan</span></Button>
          <Button onClick={() => submit("print")} disabled={saving || !cart.length} variant="outline" className="h-12 px-2 font-bold"><Printer/> Cetak</Button>
          <Button onClick={() => submit("whatsapp")} disabled={saving || !cart.length} className="h-12 bg-emerald-600 px-2 font-bold hover:bg-emerald-700"><MessageCircle/> WhatsApp</Button>
        </div>
      </div>
    </Card>
  </div>;
}
