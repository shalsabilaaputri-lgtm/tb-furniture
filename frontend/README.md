# TB Permata Keramik — Frontend ERP/PWA

Frontend Next.js + TypeScript untuk kasir dan manajemen multi-cabang TB Permata Keramik. Tampilan asli dipertahankan dan seluruh tombol operasional memakai route API server, bukan data dummy.

## Fitur aktif

- Dashboard, produk dan harga, stok per cabang, stok menipis, dan stock movement.
- Kasir dengan kuantitas yang dapat diketik langsung, diskon nominal, ongkir, nota WhatsApp, dan dialog cetak thermal.
- Transaksi, piutang dan pembayaran, retur, pengeluaran, laporan kinerja, serta audit aktivitas.
- Transfer antar cabang dengan alur permintaan, persetujuan, pengiriman, dan penerimaan.
- Presensi karyawan dengan jadwal masuk, jam masuk, status hadir/terlambat/tidak hadir, dan catatan.
- Login Sign in with ChatGPT, user, role, permission, dan pembatasan cabang.
- PWA untuk laptop, tablet, Android, dan iPhone. Service worker tidak melakukan cache pada API atau halaman login agar data stok tidak stale.

## Menjalankan lokal

Prasyarat: Node.js 22.13 atau lebih baru.

```bash
npm ci
npm run dev
```

Build produksi:

```bash
npm run build
```

## Database dan migrasi

Hosting berjalan di Sites/Cloudflare, tetapi route API frontend memakai Neon/Postgres melalui `DATABASE_URL` (atau `POSTGRES_URL`) yang disimpan sebagai secret runtime. Skema Neon dan migrasi aman berada di `db/postgres-schema.ts`.

Binding D1 yang tercantum di `.openai/hosting.json` tidak digunakan oleh adapter aplikasi ini.

`ALLOW_DEMO_SEED=true` hanya boleh dipakai saat demo lokal. Produksi tidak akan memasukkan stok contoh secara otomatis ketika database kosong.

## PWA dan printer

Manifest tersedia di `public/manifest.webmanifest`; service worker di `public/sw.js`. Printer thermal memakai dialog cetak browser supaya kompatibel dengan perangkat USB, Bluetooth, dan driver POS yang dikenali sistem operasi. Nota WhatsApp dibuka melalui tautan `wa.me` setelah transaksi tersimpan.

## Pengujian

`npm test` membangun project lalu menjalankan pemeriksaan starter Sites. Build produksi menjadi pemeriksaan utama source aplikasi. Uji rendered-HTML memakai loader test yang men-stub binding Cloudflare dan akan gagal bila halaman yang dirender mencoba memakai database tanpa binding yang valid.
