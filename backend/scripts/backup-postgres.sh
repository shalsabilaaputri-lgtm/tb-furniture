#!/usr/bin/env bash
set -Eeuo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

if [[ ! -f .env ]]; then
  echo "File .env belum ada. Salin .env.example menjadi .env terlebih dahulu." >&2
  exit 1
fi

set -a
source ./.env
set +a

backup_dir="$project_dir/backups"
mkdir -p "$backup_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$backup_dir/tb_permata_${timestamp}.dump"
retention_days="${BACKUP_RETENTION_DAYS:-14}"

docker compose exec -T postgres pg_dump \
  --username="${POSTGRES_USER}" \
  --dbname="${POSTGRES_DB}" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges > "$backup_file"

if [[ ! -s "$backup_file" ]]; then
  echo "Backup gagal atau file kosong: $backup_file" >&2
  exit 1
fi

sha256sum "$backup_file" > "${backup_file}.sha256"
find "$backup_dir" -maxdepth 1 -type f \( -name '*.dump' -o -name '*.dump.sha256' \) -mtime "+${retention_days}" -delete
echo "Backup selesai: $backup_file"
