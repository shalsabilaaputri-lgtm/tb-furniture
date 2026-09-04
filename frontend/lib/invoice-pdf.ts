type LineItem = { name: string; quantity: number; unit: string; unitPrice: number; lineTotal: number };

export type InvoicePdfData = {
  invoiceNumber: string; issuedAt: string; branchName: string; branchAddress?: string; customerName: string; customerPhone: string;
  subtotal: number; discount: number; deliveryFee: number; total: number; paidAmount: number;
  paymentMethod: string; dueRule?: string | null; dueDate?: string | null; items: LineItem[];
};

const W = 595, H = 842, M = 42;
const dark = [31, 41, 55], muted = [91, 109, 118], red = [153, 27, 27], pale = [247, 247, 246], line = [211, 220, 222], white = [255, 255, 255];
const encoder = new TextEncoder();
const money = (value: number) => `Rp${Math.round(Number(value) || 0).toLocaleString("id-ID")}`;
const clean = (value: unknown) => String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[\u2013\u2014]/g, "-").replace(/[^\x20-\x7e]/g, "?");
const esc = (value: unknown) => clean(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const colour = (rgb: number[]) => rgb.map((value) => (value / 255).toFixed(3)).join(" ");
const width = (value: string, size: number) => clean(value).length * size * .52;
const wrap = (value: string, max: number, size = 9) => { const words = clean(value).split(/\s+/).filter(Boolean), lines: string[] = []; let current = ""; for (const word of words) { const test = `${current} ${word}`.trim(); if (current && width(test, size) > max) { lines.push(current); current = word; } else current = test; } return current ? [...lines, current] : [""]; };
const date = (value?: string | null, time = false) => { if (!value) return "-"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? clean(value).slice(0, 10) : new Intl.DateTimeFormat("id-ID", time ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "long", year: "numeric" }).format(parsed); };
const due = (rule?: string | null, dueDate?: string | null) => rule === "BEFORE_DELIVERY" ? "Sebelum barang dikirim" : rule === "AFTER_DELIVERY" ? "Setelah barang dikirim" : `Tanggal ${date(dueDate)}`;

class InvoiceCanvas {
  private pages: string[][] = [[]]; private index = 0; private y = 0; private first = true;
  constructor(private readonly data: InvoicePdfData) { this.newPage(); }
  private out(value: string) { this.pages[this.index].push(value); }
  private rect(x: number, y: number, w: number, h: number, fill: number[], stroke?: number[]) { this.out(`q ${colour(fill)} rg ${stroke ? `${colour(stroke)} RG ` : ""}${x} ${y} ${w} ${h} re ${stroke ? "B" : "f"} Q`); }
  private rule(x1: number, y1: number, x2: number, y2: number, stroke = line, size = 1) { this.out(`q ${colour(stroke)} RG ${size} w ${x1} ${y1} m ${x2} ${y2} l S Q`); }
  private text(x: number, y: number, value: unknown, size = 10, bold = false, fill = dark, right = false) { const label = clean(value); this.out(`BT /F${bold ? 2 : 1} ${size} Tf ${colour(fill)} rg 1 0 0 1 ${(right ? x - width(label, size) : x).toFixed(2)} ${y.toFixed(2)} Tm (${esc(label)}) Tj ET`); }
  private newPage() {
    if (!this.first) { this.pages.push([]); this.index += 1; }
    this.rect(0, 0, W, H, white); this.rect(0, 760, W, 82, red);
    this.text(M, 804, "TB PERMATA KERAMIK", 19, true, white); this.text(M, 781, "KERAMIK | GRANIT | SEMEN | BAHAN BANGUNAN", 8.4, false, [254, 226, 226]);
    this.text(W - M, 800, "INVOICE", 26, true, white, true); this.text(W - M, 780, this.first ? "TAGIHAN PENJUALAN" : `LANJUTAN ${this.data.invoiceNumber}`, 8.5, false, [254, 226, 226], true);
    this.y = 728; this.first = false;
  }
  private room(height: number) { if (this.y - height < 74) this.newPage(); }
  private header() {
    this.text(M, this.y, "INVOICE NO.", 8, true, muted); this.text(204, this.y, this.data.invoiceNumber, 11, true); this.text(360, this.y, "TANGGAL", 8, true, muted); this.text(W - M, this.y, date(this.data.issuedAt, true), 10, true, dark, true); this.rule(M, this.y - 14, W - M, this.y - 14); this.y -= 39;
    this.rect(M, this.y - 84, 238, 84, pale); this.rect(315, this.y - 84, 238, 84, pale);
    this.text(M + 14, this.y - 21, "KEPADA", 8, true, muted); this.text(M + 14, this.y - 42, this.data.customerName, 12, true); this.text(M + 14, this.y - 62, this.data.customerPhone ? `WhatsApp: ${this.data.customerPhone}` : "WhatsApp: -", 8.5, false, muted);
    this.text(329, this.y - 21, "DARI", 8, true, muted); this.text(329, this.y - 42, this.data.branchName, 12, true); this.text(329, this.y - 62, this.data.branchAddress || "TB Permata Keramik", 8.5, false, muted); this.y -= 112;
  }
  private tableHead() { this.rect(M, this.y - 25, W - M * 2, 25, dark); this.text(M + 10, this.y - 16, "NO", 8, true, white); this.text(M + 38, this.y - 16, "NAMA BARANG", 8, true, white); this.text(358, this.y - 16, "QTY", 8, true, white); this.text(422, this.y - 16, "HARGA", 8, true, white); this.text(W - M - 10, this.y - 16, "SUBTOTAL", 8, true, white, true); this.y -= 25; }
  private items() {
    this.tableHead();
    this.data.items.forEach((item, number) => { const names = wrap(item.name, 238), height = Math.max(29, names.length * 12 + 14); this.room(height + 6); if (this.y > 700) this.tableHead(); const base = this.y - 17; this.text(M + 10, base, number + 1, 9, true); names.forEach((name, row) => this.text(M + 38, base - row * 12, name, 9, row === 0)); this.text(390, base, `${item.quantity} ${item.unit}`, 8.6, false, dark, true); this.text(468, base, money(item.unitPrice), 8.6, false, dark, true); this.text(W - M - 10, base, money(item.lineTotal), 9, true, dark, true); this.rule(M, this.y - height, W - M, this.y - height, line, .7); this.y -= height; }); this.y -= 18;
  }
  private summary() {
    this.room(190); const left = 329, right = W - M, row = (label: string, value: number, y: number, strong = false) => { this.text(left, y, label, strong ? 11 : 9.5, strong); this.text(right, y, money(value), strong ? 13 : 9.5, strong, strong ? red : dark, true); };
    this.text(M, this.y - 8, "RINGKASAN PEMBAYARAN", 9, true, muted); this.text(M, this.y - 28, `Metode: ${this.data.paymentMethod}`, 10, true); if (this.data.paymentMethod === "Piutang") this.text(M, this.y - 48, `Batas bayar: ${due(this.data.dueRule, this.data.dueDate)}`, 8.7, false, muted);
    row("Subtotal", this.data.subtotal, this.y - 10); row("Diskon", -this.data.discount, this.y - 31); row("Ongkir", this.data.deliveryFee, this.y - 52); this.rule(left, this.y - 64, right, this.y - 64, dark, 1.2); row("TOTAL", this.data.total, this.y - 85, true);
    if (this.data.paymentMethod === "Piutang") { row("DP diterima", this.data.paidAmount, this.y - 109); row("SISA PIUTANG", this.data.total - this.data.paidAmount, this.y - 132, true); }
  }
  private footer() { this.rule(M, 56, W - M, 56); this.text(M, 38, "Terima kasih atas kepercayaan Anda.", 8.5, false, muted); this.text(W - M, 38, `Dokumen digital - ${this.data.invoiceNumber}`, 8.5, false, muted, true); }
  render() { this.header(); this.items(); this.summary(); this.pages.forEach((_, page) => { this.index = page; this.footer(); }); return this.pages; }
}

/** Polished, dependency-free A4 PDF using built-in fonts for safe Vercel execution. */
export function createInvoicePdf(data: InvoicePdfData) {
  const pages = new InvoiceCanvas(data).render(), objects: string[] = [], pageIds = pages.map((_, index) => 5 + index * 2), contentIds = pages.map((_, index) => 6 + index * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>"; objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`; objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"; objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  pages.forEach((page, index) => { const content = page.join("\n"); objects[pageIds[index]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentIds[index]} 0 R >>`; objects[contentIds[index]] = `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`; });
  let pdf = "%PDF-1.4\n"; const offsets = [0]; for (let id = 1; id < objects.length; id += 1) { offsets[id] = encoder.encode(pdf).length; pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`; } const xref = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return encoder.encode(pdf);
}
