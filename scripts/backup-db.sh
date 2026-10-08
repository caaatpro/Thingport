#!/bin/sh
# Daily database dump for a Thingport stack run from this directory's docker compose project.
#   backup-db.sh [backup-dir]      default: ./backups/auto
# Keeps KEEP_DAYS (default 14) days of gzipped dumps and refuses to leave an empty or truncated file behind.
# Model files live in the storage volume and are not part of this dump.
set -eu
cd "$(dirname "$0")"
DIR="${1:-./backups/auto}"
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$DIR"
OUT="$DIR/thingport-$(date +%Y%m%d-%H%M%S).sql.gz"
TMP="$OUT.partial"
if docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip -9 > "$TMP" \
  && gzip -dc "$TMP" | grep -q "PostgreSQL database dump complete"; then
  mv "$TMP" "$OUT"
  echo "backup ok: $OUT ($(du -h "$OUT" | cut -f1))"
else
  rm -f "$TMP"
  echo "backup FAILED" >&2
  exit 1
fi
find "$DIR" -name 'thingport-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
