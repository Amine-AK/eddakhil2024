#!/usr/bin/env bash
# Dumps the Postgres database running in the `db` compose service to a
# timestamped, gzip-compressed SQL file under ./backups.
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p backups

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT="backups/school_attendance-${TIMESTAMP}.sql.gz"

: "${POSTGRES_USER:=school}"
: "${POSTGRES_DB:=school_attendance}"

docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$OUT"

echo "Backup written to $OUT"
