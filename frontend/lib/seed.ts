import { getD1 } from "@/db";

const BRANCHES = [
  ["b1", "TB Permata Keramik — Seyegan", "Seyegan", "Seyegan, Sleman"],
  ["b2", "TB Jatimas 1 — Jl. Wates", "Jl. Wates", "Jalan Wates, Yogyakarta"],
  ["b3", "TB Jatimas 2 — Jl. Bantul", "Jl. Bantul", "Jalan Bantul, Yogyakarta"],
  ["b4", "TB Mutiara 1 — Dekso", "Dekso", "Dekso, Kulon Progo"],
  ["b5", "TB Mutiara 2 — Purworejo", "Purworejo", "Purworejo, Jawa Tengah"],
] as const;

const PRODUCTS = [
  ["p1", "KOB-AND-BEI-3030", "899001000001", "Kobin Andara Beige 30×30", "Kobin", "Keramik", "Andara", "Beige", "30×30", 11, 1, 43000, 44500, 52000, 50000, 48000, 47000, 30],
  ["p2", "KOB-AND-GRY-3030", "899001000002", "Kobin Andara Grey 30×30", "Kobin", "Keramik", "Andara", "Grey", "30×30", 11, 1, 43000, 44500, 52000, 50000, 48000, 47000, 30],
  ["p3", "ACC-ANC-BEI-5050", "899001000003", "Accura Ancona Beige 50×50", "Accura", "Keramik", "Ancona", "Beige", "50×50", 4, 1, 61000, 63500, 74500, 72000, 69500, 68000, 20],
  ["p4", "MIL-MAR-BEI-4040", "899001000004", "Milazo Martapura Beige 40×40", "Milazo", "Keramik", "Martapura", "Beige", "40×40", 6, 0.96, 53000, 55000, 65000, 62500, 60000, 59000, 25],
  ["p5", "JUP-BRI-WHI-4040", "899001000005", "Jupiter Brilliant White 40×40", "Jupiter", "Keramik", "Brilliant", "White", "40×40", 6, 0.96, 49000, 51000, 60000, 58000, 55500, 54500, 40],
  ["p6", "SMN-GRS-40KG", "899001000006", "Semen Gresik 40 kg", "Semen Gresik", "Semen", "Portland", "", "40 kg", 1, null, 54000, 55500, 62500, 61000, 59500, 58500, 50],
  ["p7", "NIP-VIN-WHI-5KG", "899001000007", "Nippon Vinilex Putih 5 kg", "Nippon Paint", "Cat", "Vinilex", "Putih", "5 kg", 1, null, 118000, 121000, 139000, 135000, 131000, 128000, 10],
  ["p8", "WAV-PVC-3IN", "899001000008", "Wavin Pipa PVC 3 inch", "Wavin", "Pipa", "PVC", "Putih", "3 inch", 1, null, 76500, 79000, 92000, 89000, 86000, 84000, 12],
] as const;

export async function ensureSeedData() {
  const d1 = getD1();
  const existing = await d1.prepare("SELECT COUNT(*) AS total FROM branches").first<{ total: number }>();
  if ((existing?.total ?? 0) > 0) return;

  const statements = [];
  for (const [id, name, shortName, address] of BRANCHES) {
    statements.push(d1.prepare("INSERT OR IGNORE INTO branches (id,name,short_name,address,is_active) VALUES (?,?,?,?,1)").bind(id, name, shortName, address));
    statements.push(d1.prepare("INSERT OR IGNORE INTO warehouses (id,branch_id,name) VALUES (?,?,?)").bind(`w${id.slice(1)}`, id, "Gudang Utama"));
  }

  for (const product of PRODUCTS) {
    statements.push(
      d1.prepare(`INSERT OR IGNORE INTO products
        (id,sku,barcode,name,brand,category,series,color,size,unit,pieces_per_box,sqm_per_box,purchase_price,landed_cost,selling_price,wholesale_price,project_price,minimum_price,minimum_stock,is_active)
        VALUES (?,?,?,?,?,?,?,?,?,'dus',?,?,?,?,?,?,?,?,?,1)`).bind(...product),
    );
  }

  const quantities = [
    [150, 80, 200, 20, 0],
    [84, 60, 45, 92, 32],
    [42, 16, 64, 24, 8],
    [75, 110, 20, 55, 30],
    [18, 35, 70, 42, 25],
    [220, 180, 160, 90, 120],
    [14, 7, 22, 10, 6],
    [28, 40, 15, 18, 12],
  ];
  for (let p = 0; p < PRODUCTS.length; p += 1) {
    for (let b = 0; b < BRANCHES.length; b += 1) {
      const physical = quantities[p][b];
      const reserved = p === 0 ? [50, 10, 0, 0, 0][b] : (b === 0 && p === 2 ? 5 : 0);
      statements.push(
        d1.prepare(`INSERT OR IGNORE INTO stocks
          (id,branch_id,warehouse_id,product_id,batch,shade,physical_qty,reserved_qty,damaged_qty)
          VALUES (?,?,?,?,?,?,?, ?,0)`).bind(`s-${p + 1}-${b + 1}`, `b${b + 1}`, `w${b + 1}`, `p${p + 1}`, "BATCH-01", p < 5 ? "A01" : "STD", physical, reserved),
      );
      statements.push(
        d1.prepare(`INSERT OR IGNORE INTO stock_movements
          (id,reference_number,branch_id,warehouse_id,product_id,movement_type,quantity,stock_before,stock_after,reason,user_email)
          VALUES (?,?,?,?,?,'OPENING',?,0,?,'Stok awal data contoh','system@tbpermata.id')`).bind(`m-${p + 1}-${b + 1}`, "OPENING-STOCK", `b${b + 1}`, `w${b + 1}`, `p${p + 1}`, physical, physical),
      );
    }
  }

  statements.push(d1.prepare("INSERT OR IGNORE INTO customers (id,name,whatsapp,type,credit_limit,outstanding,referral_code) VALUES (?,?,?,?,?,?,?)").bind("c1", "PT Griya Jogja", "6281234567001", "Kontraktor", 150000000, 24000000, "REF-ARI"));
  statements.push(d1.prepare("INSERT OR IGNORE INTO customers (id,name,whatsapp,type,credit_limit,outstanding,referral_code) VALUES (?,?,?,?,?,?,?)").bind("c2", "Bapak Andi", "6281234567002", "Mandor", 50000000, 8500000, "REF-DWI"));
  statements.push(d1.prepare("INSERT OR IGNORE INTO customers (id,name,whatsapp,type,credit_limit,outstanding) VALUES (?,?,?,?,?,?)").bind("c3", "Proyek Permata Residence", "6281234567003", "Proyek", 250000000, 42000000));

  const demoSales = [
    ["sale-demo-1", "INV-DEMO-001", "b1", "c1", 15900000, 300000, 15600000, "Transfer", 15600000],
    ["sale-demo-2", "INV-DEMO-002", "b2", "c2", 8450000, 0, 8450000, "QRIS", 8450000],
    ["sale-demo-3", "INV-DEMO-003", "b3", null, 3250000, 0, 3250000, "Cash", 3250000],
  ] as const;
  for (const sale of demoSales) {
    statements.push(d1.prepare(`INSERT OR IGNORE INTO sales
      (id,invoice_number,branch_id,customer_id,subtotal,discount,total,payment_method,paid_amount,status,user_email)
      VALUES (?,?,?,?,?,?,?,?,?,'PAID','demo@tbpermata.id')`).bind(...sale));
  }

  await d1.batch(statements);
}
