# TB Permata Keramik — Project Full-stack

Project ini berisi dua aplikasi:

- `frontend/`: Next.js + TypeScript, route API Sites/D1, PWA, kasir, laporan, presensi, dan transfer antar cabang.
- `backend/`: NestJS + TypeScript + Prisma + PostgreSQL untuk deployment produksi terpisah.

Tampilan frontend asli dipertahankan. Fitur operasional yang diminta sudah tersedia: produk/harga, stok per cabang, kasir, transaksi, piutang, retur, transfer, pengeluaran, laporan, audit, presensi, nota WhatsApp, printer thermal, diskon nominal, kuantitas manual, dan persetujuan ongkir di atas 20 km.

## Urutan pemasangan produksi

1. Deploy PostgreSQL dan folder `backend/`; ikuti `backend/README.md`.
2. Jalankan migrasi Prisma dan seed owner.
3. Isi HTTPS origin, JWT secret, dan `SITE_PROXY_SECRET` pada secret manager.
4. Deploy folder `frontend/`; ikuti `frontend/README.md`.
5. Jalankan seed besar dan uji concurrency di staging.
6. Jadwalkan backup harian dan uji restore berkala.

## Status verifikasi paket

- TypeScript backend, lint backend, dan build NestJS berhasil.
- Build produksi frontend berhasil.
- Enam migrasi D1 dapat diterapkan berurutan; foreign key check bersih.
- Manifest, service worker, dan ikon PWA tersedia pada hasil build.
- Generator 50.000 produk, 200.000 transaksi, serta uji 100 request penjualan bersamaan tersedia di `backend/scripts/load-test/`.

Eksekusi benchmark PostgreSQL besar dan deployment backend/database cloud memerlukan instance staging serta kredensial cloud milik toko; keduanya sengaja tidak disimulasikan sebagai hasil lulus. Deployment frontend Sites dapat dilakukan terpisah setelah persetujuan publikasi.
