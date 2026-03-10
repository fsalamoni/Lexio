#!/bin/sh
# Lexio — PostgreSQL restore script
# Restores the latest backup (or a specific one if FILE= is set).
#
# Usage:
#   make backup-restore              → restore latest
#   FILE=backups/lexio_20260301.sql.gz make backup-restore   → restore specific

set -e

BACKUP_DIR="/backups"
PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-lexio}"
PGDATABASE="${PGDATABASE:-lexio}"

# Determine which file to restore
if [ -n "${FILE}" ]; then
  RESTORE_FILE="${FILE}"
else
  RESTORE_FILE=$(find "${BACKUP_DIR}" -name "lexio_*.sql.gz" | sort | tail -n1)
fi

if [ -z "${RESTORE_FILE}" ] || [ ! -f "${RESTORE_FILE}" ]; then
  echo "ERROR: No backup file found in ${BACKUP_DIR}" >&2
  exit 1
fi

echo "[$(date -Iseconds)] Restoring from: ${RESTORE_FILE}"
echo "[$(date -Iseconds)] Target: ${PGDATABASE} on ${PGHOST}:${PGPORT}"

# Decompress and apply
gunzip -c "${RESTORE_FILE}" | psql \
  -h "${PGHOST}" \
  -p "${PGPORT}" \
  -U "${PGUSER}" \
  -d "${PGDATABASE}" \
  --set ON_ERROR_STOP=on

echo "[$(date -Iseconds)] Restore complete."
