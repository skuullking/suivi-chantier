#!/usr/bin/env sh
# Daily backup of the Docker stack (database + files) into ./backups, with rotation.
#   ./scripts/backup.sh                 (BACKUP_KEEP=14 by default)
# Cron example (every night at 2:30):
#   30 2 * * * cd /opt/chantierlink && ./scripts/backup.sh >> backups/backup.log 2>&1
set -eu
cd "$(dirname "$0")/.."
mkdir -p backups
docker compose exec -T -u root -e BACKUP_DIR=/app/backups -e "BACKUP_KEEP=${BACKUP_KEEP:-14}" app tsx scripts/backup.ts
