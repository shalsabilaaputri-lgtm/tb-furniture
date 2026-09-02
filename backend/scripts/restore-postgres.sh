#!/usr/bin/env bash
set -Eeuo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

backup_file="${1:-}"
confirmation="${2:-}"
if [[ -z "$backup_file" || ! -f "$backup_file" ]]; then
  echo "Pemakaian: ./scripts/restore-postgres.sh backups/nama-file.dump --yes" >&2
  exit 1
fi
if [[ "$confirmation" != "--yes" ]]; then
  echo "Restore akan mengganti isi database. Jalankan kembali dengan --yes bila target sudah benar." >&2
  exit 1
fi
if [[ ! -f .env ]]; then
  echo "File .env belum ada." >&2
  exit 1
fi

set -a
source ./.env
set +a

if [[ -f "${backup_file}.sha256" ]]; then
  sha256sum --check "${backup_file}.sha256"
fi

docker compose exec -T postgres pg_restore \
  --username="${POSTGRES_USER}" \
  --dbname="${POSTGRES_DB}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges < "$backup_file"

echo "Restore selesai dari: $backup_file"
