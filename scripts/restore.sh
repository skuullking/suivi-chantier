#!/usr/bin/env sh
# Restores a backup of the Docker stack (replaces ALL current data).
#   ./scripts/restore.sh backups/chantierlink-20261122-023000.tar.gz
set -eu
cd "$(dirname "$0")/.."
ARCHIVE="${1:?Usage : ./scripts/restore.sh backups/chantierlink-AAAAMMJJ-HHMMSS.tar.gz}"
NAME="$(basename "$ARCHIVE")"
if [ ! -f "backups/$NAME" ]; then
  echo "L'archive doit se trouver dans le dossier backups/ (monté dans le conteneur)." >&2
  exit 1
fi
printf "Toutes les données actuelles vont être remplacées par %s. Continuer ? [oui/non] " "$NAME"
read -r answer
[ "$answer" = "oui" ] || { echo "Annulé."; exit 1; }
docker compose stop worker
docker compose exec -T -u root app tsx scripts/restore.ts "backups/$NAME" --yes
docker compose restart app worker
echo "Restauration terminée."
