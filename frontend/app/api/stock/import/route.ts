import * as XLSX from "xlsx";
import { generateObject, gateway } from "ai";
import { z } from "zod";
import { getDb } from "@/db";
import { apiError, assertBranchAccess, requireApiUser } from "@/lib/api-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const EXCEL_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
]);
const DOCUMENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

type ImportDirection = "IN" | "OUT" | "ADJUST";

const extractedDocument = z.object({
  direction: z.enum(["IN", "OUT"]).optional(),
  reference: z.string().max(120).optional(),
  lines: z.array(z.object({
    sku: z.string().max(120).optional(),
    barcode: z.string().max(120).optional(),
    name: z.string().min(1).max(240),
    quantity: z.number().positive(),
    unit: z.string().max(30).optional(),
  })).max(200),
});

type ParsedLine = z.infer<typeof extractedDocument>["lines"][number] & {
  brand?: string; series?: string; size?: string; quality?: string;
};

function value(row: Record<string, unknown>, names: string[]) {
  const normalized = new Map(Object.entries(row).map(([key, item]) => [key.toLowerCase().replace(/[^a-z0-9]/g, ""), item]));
  for (const name of names) {
    const item = normalized.get(name);
    if (item !== undefined && String(item).trim()) return String(item).trim();
  }
  return "";
}

function parseQuantity(input: string) {
  const cleaned = input.replace(/[^0-9,.-]/g, "");
  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");
  let normalized = cleaned;
  if (comma >= 0 && dot >= 0) normalized = comma > dot ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  else if (comma >= 0) {
    const fraction = cleaned.slice(comma + 1);
    normalized = fraction.length === 3 ? cleaned.replace(/,/g, "") : cleaned.replace(",", ".");
  } else if (dot >= 0) {
    const fraction = cleaned.slice(dot + 1);
    normalized = fraction.length === 3 ? cleaned.replace(/\./g, "") : cleaned;
  }
  const result = Number(normalized);
  return Number.isFinite(result) && result > 0 ? result : 0;
}

function parseSpreadsheet(bytes: Uint8Array): { lines: ParsedLine[]; direction?: ImportDirection } {
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { lines: [] };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  const headers = Object.keys(rows[0] || {}).map((header) => header.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const stockCount = headers.includes("stok") || headers.includes("stokfisik") || headers.includes("stokakhir");
  const lines = rows.map((row) => {
    const brand = value(row, ["merek", "brand"]);
    const series = value(row, ["serimotif", "seri", "motif", "series"]);
    const size = value(row, ["ukurancm", "ukuran", "size"]);
    const quality = value(row, ["kualitas", "quality", "grade"]);
    const explicitName = value(row, ["namaproduk", "namabarang", "produk", "barang", "product", "item"]);
    const name = explicitName || [brand, series, size, quality].filter(Boolean).join(" ");
    return {
      sku: value(row, ["sku", "kodeproduk", "kodebarang", "productcode"]),
      barcode: value(row, ["barcode", "ean", "kodebarcode"]),
      name,
      brand, series, size, quality,
      quantity: parseQuantity(value(row, stockCount ? ["stokfisik", "stokakhir", "stok"] : ["jumlah", "qty", "quantity", "kuantitas", "banyak"])),
      unit: value(row, ["satuan", "unit"]),
    };
  }).filter((line) => {
    const summary = /^(total|grandtotal|jumlah)/i.test(normalize(line.name || "")) || /^(total|grandtotal|jumlah)/i.test(normalize(line.quality || ""));
    return !summary && (line.name || line.sku || line.barcode || line.quantity);
  });
  return { lines, direction: stockCount ? "ADJUST" : undefined };
}

async function parseDocument(bytes: Uint8Array, mediaType: string) {
  const result = await generateObject({
    model: gateway(process.env.OCR_MODEL || "alibaba/qwen3-235b-a22b-thinking"),
    schema: extractedDocument,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Baca nota ini untuk pencatatan stok toko bangunan. Ambil HANYA setiap item barang yang benar-benar terbaca: SKU/kode atau barcode bila ada, nama, jumlah, dan satuan. Jangan mengarang item atau jumlah. Tentukan direction IN hanya bila dokumen jelas pembelian/penerimaan barang, OUT hanya bila jelas pengeluaran/penjualan; bila tidak pasti, jangan isi direction." },
        { type: "file", data: bytes, mediaType },
      ],
    }],
  });
  return result.object;
}

const normalize = (input: string) => input.toLowerCase().replace(/[^a-z0-9]/g, "");

export async function POST(request: Request) {
  try {
    const user = await requireApiUser("stock.adjust");
    const form = await request.formData();
    const file = form.get("file");
    const branchId = String(form.get("branchId") || "").trim();
    const requestedDirection = String(form.get("direction") || "").toUpperCase();
    if (!branchId || !["IN", "OUT", "ADJUST"].includes(requestedDirection)) return Response.json({ error: "Pilih cabang dan jenis mutasi terlebih dahulu." }, { status: 400 });
    assertBranchAccess(user, branchId);
    if (!(file instanceof File)) return Response.json({ error: "Pilih berkas nota atau Excel terlebih dahulu." }, { status: 400 });
    if (!file.size || file.size > MAX_FILE_BYTES) return Response.json({ error: "Berkas maksimal 8 MB agar diproses aman dan cepat." }, { status: 400 });
    const mediaType = file.type || (file.name.toLowerCase().endsWith(".csv") ? "text/csv" : "");
    if (!EXCEL_TYPES.has(mediaType) && !DOCUMENT_TYPES.has(mediaType)) return Response.json({ error: "Format belum didukung. Gunakan Excel/CSV, PDF, JPG, PNG, atau WEBP." }, { status: 400 });

    // The original upload intentionally exists only in this request's memory.
    // It is never written to Neon, Blob, disk, or an application log.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsed: { lines: ParsedLine[]; direction?: ImportDirection; reference?: string } = EXCEL_TYPES.has(mediaType)
      ? { ...parseSpreadsheet(bytes), reference: undefined }
      : await parseDocument(bytes, mediaType);
    if (!parsed.lines.length) return Response.json({ error: "Tidak ada baris barang yang berhasil dibaca. Coba foto lebih jelas atau gunakan template Excel." }, { status: 422 });

    const db = getDb();
    const products = await db.prepare("SELECT id,sku,barcode,name,brand,series,size,unit FROM products WHERE is_active=1 ORDER BY name").all<{ id: string; sku: string; barcode: string | null; name: string; brand: string; series: string; size: string; unit: string }>();
    const mapped = parsed.lines.slice(0, 200).map((line) => {
      const sku = normalize(line.sku || "");
      const barcode = normalize(line.barcode || "");
      const name = normalize(line.name || "");
      const directMatches = products.results.filter((product) =>
        (sku && normalize(product.sku) === sku) ||
        (barcode && normalize(product.barcode || "") === barcode) ||
        (!sku && !barcode && name && normalize(product.name) === name),
      );
      const series = normalize(line.series || "");
      const brand = normalize(line.brand || "");
      const size = normalize(line.size || "");
      const compositeMatches = !sku && !barcode && brand && series ? products.results.filter((product) => {
        if (normalize(product.brand) !== brand || (size && normalize(product.size) !== size)) return false;
        return [product.series, product.name].some((field) => normalize(field) === series);
      }) : [];
      const matches = directMatches.length ? directMatches : compositeMatches;
      const product = matches.length === 1 ? matches[0] : undefined;
      const overlapping = product ? [] : products.results.filter((candidate) => {
        if (brand && normalize(candidate.brand) !== brand) return false;
        if (size && normalize(candidate.size) !== size) return false;
        const candidateText = [candidate.name, candidate.series].map(normalize).filter(Boolean);
        return [name, series].filter((item) => item.length >= 4).some((item) => candidateText.some((text) => text.includes(item) || item.includes(text)));
      }).slice(0, 5);
      return {
        sourceName: line.name || line.sku || line.barcode || "Baris tanpa nama",
        sku: line.sku || "",
        barcode: line.barcode || "",
        quantity: Number(line.quantity),
        unit: line.unit || product?.unit || "",
        brand: line.brand || "Tanpa merek",
        series: line.series || "",
        size: line.size || "",
        productId: product?.id || null,
        productName: product?.name || null,
        candidates: overlapping.map((candidate) => ({ id: candidate.id, name: candidate.name, sku: candidate.sku })),
        status: product && line.quantity > 0 ? "MATCHED" : overlapping.length ? "OVERLAP" : "NEW",
      };
    }).filter((line) => line.quantity > 0);
    if (!mapped.length) return Response.json({ error: "Jumlah pada dokumen tidak valid. Gunakan kolom Jumlah/Qty untuk mutasi atau Stok untuk stok opname." }, { status: 422 });
    return Response.json({
      ok: true,
      sourceName: file.name,
      direction: parsed.direction || requestedDirection,
      reference: parsed.reference || "",
      rows: mapped,
      privacy: "Berkas asli sudah dibuang setelah diproses; hanya hasil baris ini ada di layar Anda.",
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(request: Request) {
  const opname = new URL(request.url).searchParams.get("mode") === "opname";
  const headers = opname
    ? ["SKU", "Barcode", "Nama Produk", "Merek", "Seri / Motif", "Ukuran (cm)", "Kualitas", "Stok", "Satuan"]
    : ["SKU", "Barcode", "Nama Produk", "Merek", "Seri / Motif", "Ukuran (cm)", "Kualitas", "Jumlah", "Satuan"];
  const sample = opname
    ? ["KR-600-SNOW", "", "Snow Ivory 60x60", "Indogress", "Snow Ivory", "60 x 60", "KW 3", "700", "dus"]
    : ["KR-600-SNOW", "", "Snow Ivory 60x60", "Indogress", "Snow Ivory", "60 x 60", "KW 3", "10", "dus"];
  const csv = `\uFEFF${headers.join(",")}\n${sample.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")}\n`;
  return new Response(csv, { headers: {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="template-${opname ? "stok-opname" : "mutasi-stok"}.csv"`,
    "cache-control": "no-store",
  } });
}
