#!/bin/sh
# Lexio — PostgreSQL backup script
# Runs inside the `backup` Docker Compose service (postgres:16-alpine image)
# or can be called directly on the host with pg_dump available.
#
# Usage (via Makefile):
#   make backup           → runs once, stores in ./backups/
#   make backup-restore   → restore latest backup
#
# Cron (host, daily at 02:00):
#   0 2 * * * cd /path/to/lexio && make backup >> /var/log/lexio-backup.log 2>&1

set -e

BACKUP_DIR="/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="${BACKUP_DIR}/lexio_${TIMESTAMP}.sql.gz"
KEEP_DAYS=7

PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-lexio}"
PGDATABASE="${PGDATABASE:-lexio}"

echo "[$(date -Iseconds)] Starting backup of database '${PGDATABASE}' on ${PGHOST}:${PGPORT}"

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

# Run pg_dump and compress
pg_dump \
  -h "${PGHOST}" \
  -p "${PGPORT}" \
  -U "${PGUSER}" \
  -d "${PGDATABASE}" \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  | gzip > "${FILENAME}"

SIZE=$(du -sh "${FILENAME}" | cut -f1)
echo "[$(date -Iseconds)] Backup complete: ${FILENAME} (${SIZE})"

# Rotate old backups — keep only the last KEEP_DAYS days
echo "[$(date -Iseconds)] Rotating backups older than ${KEEP_DAYS} days..."
find "${BACKUP_DIR}" -name "lexio_*.sql.gz" -mtime "+${KEEP_DAYS}" -delete
REMAINING=$(find "${BACKUP_DIR}" -name "lexio_*.sql.gz" | wc -l)
echo "[$(date -Iseconds)] Done. ${REMAINING} backup(s) retained."
