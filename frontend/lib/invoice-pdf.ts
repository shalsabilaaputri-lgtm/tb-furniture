type LineItem = { name: string; quantity: number; unit: string; unitPrice: number; lineTotal: number };

export type InvoicePdfData = {
  invoiceNumber: string; issuedAt: string; branchName: string; customerName: string; customerPhone: string;
  subtotal: number; discount: number; deliveryFee: number; total: number; paidAmount: number;
  paymentMethod: string; dueRule?: string | null; dueDate?: string | null; items: LineItem[];
};

const money = (value: number) => `Rp${Math.round(Number(value) || 0).toLocaleString("id-ID")}`;
const ascii = (value: unknown) => String(value ?? "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "?");
const escapePdf = (value: string) => ascii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const wrap = (value: string, width = 76) => {
  const words = ascii(value).split(/\s+/).filter(Boolean); const lines: string[] = []; let line = "";
  for (const word of words) { if (`${line} ${word}`.trim().length > width && line) { lines.push(line); line = word; } else line = `${line} ${word}`.trim(); }
  return line ? [...lines, line] : [""];
};
const dueLabel = (rule?: string | null, date?: string | null) => rule === "BEFORE_DELIVERY" ? "Sebelum barang dikirim" : rule === "AFTER_DELIVERY" ? "Setelah barang dikirim" : date ? `Tanggal ${date}` : "-";

/** Minimal, dependency-free A4 invoice PDF suitable for download and WhatsApp links. */
export function createInvoicePdf(data: InvoicePdfData) {
  const lines = [
    "TB PERMATA KERAMIK", `INVOICE PEMBAYARAN: ${data.invoiceNumber}`, `Tanggal: ${new Date(data.issuedAt).toLocaleString("id-ID")}`,
    `Cabang: ${data.branchName}`, "", `Customer: ${data.customerName}`, `WhatsApp: ${data.customerPhone || "-"}`, "",
    "RINCIAN BARANG",
    ...data.items.flatMap((item) => [...wrap(item.name), `  ${item.quantity} ${item.unit} x ${money(item.unitPrice)} = ${money(item.lineTotal)}`]),
    "", `Subtotal: ${money(data.subtotal)}`, `Diskon: ${money(data.discount)}`, `Ongkir: ${money(data.deliveryFee)}`,
    `TOTAL: ${money(data.total)}`, `Metode pembayaran: ${data.paymentMethod}`,
    data.paymentMethod === "Piutang" ? `DP / sudah dibayar: ${money(data.paidAmount)}` : `Sudah dibayar: ${money(data.paidAmount)}`,
    data.paymentMethod === "Piutang" ? `Sisa piutang: ${money(data.total - data.paidAmount)}` : "",
    data.paymentMethod === "Piutang" ? `Batas pembayaran: ${dueLabel(data.dueRule, data.dueDate)}` : "",
    "", "Terima kasih sudah berbelanja.", "Simpan invoice ini sebagai bukti pembayaran.",
  ].filter(Boolean);
  const perPage = 44; const pages = Array.from({ length: Math.max(1, Math.ceil(lines.length / perPage)) }, (_, index) => lines.slice(index * perPage, (index + 1) * perPage));
  const objects: string[] = []; const pageIds = pages.map((_, index) => 4 + index * 2); const contentIds = pages.map((_, index) => 5 + index * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pages.forEach((page, index) => {
    const content = ["BT", "/F1 10 Tf", "50 795 Td", "14 TL", ...page.map((line) => `(${escapePdf(line)}) Tj T*`), "ET"].join("\n");
    objects[pageIds[index]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentIds[index]} 0 R >>`;
    objects[contentIds[index]] = `<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}\nendstream`;
  });
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) { offsets[id] = new TextEncoder().encode(pdf).length; pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`; }
  const xref = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
