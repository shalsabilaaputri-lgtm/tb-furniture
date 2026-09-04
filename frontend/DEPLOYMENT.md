# Sites deployment

Frontend di-hosting oleh Sites/Cloudflare dan menyimpan data pada Neon/Postgres.
Set `DATABASE_URL` (atau `POSTGRES_URL`) sebagai secret runtime Sites; jangan
menaruh connection string Neon di source code. `db/postgres-schema.ts` memuat
skema dan migrasi aman yang diterapkan saat aplikasi pertama mengakses database.
