# TB Permata Keramik — Backend ERP Lengkap

Backend PostgreSQL untuk website kasir dan ERP multi-cabang TB Permata Keramik. Dibangun dengan NestJS, TypeScript, Prisma, PostgreSQL 16, JWT, Argon2id, Docker, audit log, dan backup terjadwal.

## Modul

- Login, refresh/logout, role dan permission backend.
- User, cabang, gudang, kategori, satuan, SKU, barcode, dan harga per cabang.
- Harga bertingkat menurut jumlah pembelian serta harga modal dengan permission terpisah.
- Stok per gudang/cabang, stok minimum, stok rusak, dan stock movement.
- Barang masuk, barang keluar, stok opname/koreksi, dan audit perubahan.
- Kasir dengan kuantitas yang dapat diketik langsung, diskon nominal, harga override berizin, dan beberapa metode pembayaran.
- Ongkir otomatis 0–20 km; di atas 20 km wajib ditetapkan dan disetujui owner/manager.
- Transaksi, pembayaran, piutang dan cicilan, retur, transfer antar cabang bertahap, serta pengeluaran.
- Presensi karyawan: jadwal masuk, hadir/terlambat/tidak hadir, jam masuk, dan jam pulang.
- Laporan penjualan, laba kotor/bersih, piutang, cabang, produk terlaris, stok menipis, transfer, dan presensi.
- Audit log, backup/restore dengan checksum, serta generator data dan uji concurrency.

## Perlindungan stok

Penjualan, retur, koreksi, pengiriman transfer, dan penerimaan transfer dijalankan dalam transaksi PostgreSQL `SERIALIZABLE`. Pengurangan stok menggunakan satu perintah atomik dengan syarat stok tersedia masih cukup. Konflik transaksi dicoba ulang sampai tiga kali. Database juga memiliki `CHECK CONSTRAINT` agar stok, nilai pembayaran, retur, dan piutang tidak dapat menjadi tidak valid walaupun data ditulis di luar API.

## Menjalankan

Prasyarat: Docker Desktop atau Docker Engine + Compose.

```bash
cp .env.example .env
# Ganti password dan secret pada .env
docker compose up --build -d
docker compose exec api npm run db:seed
curl http://localhost:4000/api/v1/health
```

Akun owner awal mengikuti `SEED_OWNER_EMAIL` dan `SEED_OWNER_PASSWORD` pada `.env`. Password seed minimal 12 karakter dan JWT secret minimal 32 karakter.

## Endpoint utama

| Area | Endpoint |
|---|---|
| Login | `POST /api/v1/auth/login`, `refresh`, `logout`, `GET me` |
| User dan cabang | `/api/v1/users`, `/api/v1/branches`, `/api/v1/audit-logs` |
| Produk | `/api/v1/products`, `/product-categories`, `/units` |
| Harga | `PUT /products/:id/prices/:branchId`, `PUT /products/:id/costs/:branchId` |
| Stok | `GET /stock`, `POST /stock/adjustments`, `GET /stock/movements` |
| Kasir/transaksi | `POST /sales`, `GET /sales`, `GET /sales/:id` |
| Pelanggan | `GET/POST /customers` |
| Piutang | `GET /receivables`, `POST /receivables/:id/payments` |
| Retur | `GET/POST /returns` |
| Transfer | `GET/POST /stock-transfers`, `PATCH approve/dispatch/receive` |
| Pengeluaran | `GET/POST /expenses` |
| Presensi | `/employees`, `/attendance`, `/attendance/check-in`, `/attendance/check-out` |
| Laporan | `GET /reports/summary` |

Contoh request produk dan login tersedia di `docs/api-examples.http`.

## Backup dan restore

```bash
./scripts/backup-postgres.sh
./scripts/restore-postgres.sh backups/tb_permata_YYYYMMDDTHHMMSSZ.dump --yes
```

Backup memakai format custom PostgreSQL terkompresi, checksum SHA-256, dan retensi `BACKUP_RETENTION_DAYS`. Pada produksi, jadwalkan backup harian dan salin hasilnya ke penyimpanan terenkripsi di lokasi berbeda.

## Uji data besar

Setelah database development kosong disiapkan:

```bash
npm run db:seed
LARGE_PRODUCT_COUNT=50000 LARGE_SALE_COUNT=200000 npm run test:seed-large
```

Uji penjualan bersamaan pada produk yang sama:

```bash
API_URL=http://localhost:4000/api/v1 \
LOGIN_EMAIL=owner@tbpermata.local LOGIN_PASSWORD='password-owner' \
BRANCH_ID='uuid-cabang' WAREHOUSE_ID='uuid-gudang' PRODUCT_UNIT_ID='uuid-unit-produk' \
CONCURRENT_REQUESTS=100 npm run test:concurrency
```

Uji beban berkelanjutan tersedia di `scripts/load-test/k6-sales.js`. Target bawaan: 50 virtual user, error di bawah 2%, dan respons p95 di bawah 1 detik. Jalankan pengujian besar hanya pada development/staging, bukan database produksi.

## Deployment

`Dockerfile`, `docker-compose.yml`, dan `deploy/render.yaml` sudah tersedia. Urutan produksi:

1. Buat PostgreSQL terkelola dan private network.
2. Pasang API dari Dockerfile.
3. Isi secret environment, jalankan migrasi, lalu seed owner sekali.
4. Pasang HTTPS dan batasi akses database hanya dari API.
5. Arahkan frontend ke URL HTTPS API.
6. Aktifkan backup off-site dan monitoring.

Source dapat dipasang di Render, Railway, Fly.io, VPS Docker, AWS, Google Cloud, atau Azure. Deployment aktual membutuhkan akun cloud dan kredensial PostgreSQL milik toko.

Jika frontend dijalankan pada platform serverless terpisah, backend juga menerima identitas server-ke-server melalui header `x-site-user-email` dan `x-site-secret`. Nilai secret harus identik dengan `SITE_PROXY_SECRET`, minimal 32 karakter, disimpan hanya sebagai environment secret, dan tidak pernah dikirim ke browser.

## Frontend/PWA

Frontend yang menyertai project menyediakan tampilan laptop/tablet/mobile, printer thermal melalui dialog cetak browser, nota WhatsApp, input jumlah manual, presensi, transfer cabang, dan manifest/service worker PWA. Data transaksi tidak disimpan sebagai cache offline agar stok antar perangkat tidak bertabrakan.

## Catatan keamanan

- Jangan commit `.env` atau backup database.
- Gunakan HTTPS, secret manager, serta database development/staging/production terpisah.
- Kasir tidak menerima permission harga modal, laporan laba, atau manajemen user.
- Setelah password/role/status user berubah, semua refresh session user tersebut dicabut.
- Uji restore backup berkala; backup yang tidak pernah diuji belum dapat dianggap aman.
