#!/usr/bin/env bash
# Restores a backup produced by backup.sh into the `db` compose service.
# WARNING: this drops and recreates all data in the target database.
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <path-to-backup.sql.gz>" >&2
  exit 1
fi

cd "$(dirname "$0")/.."
BACKUP_FILE="$1"

: "${POSTGRES_USER:=school}"
: "${POSTGRES_DB:=school_attendance}"

echo "This will REPLACE all data in database '$POSTGRES_DB'. Press Ctrl+C to cancel, or Enter to continue."
read -r _

gunzip -c "$BACKUP_FILE" | docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo "Restore complete."
