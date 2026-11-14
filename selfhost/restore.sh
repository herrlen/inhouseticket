#!/usr/bin/env bash
# Stellt die Datenbank aus einer Sicherung von backup.sh wieder her (docs/selbst-hosten.md, Schritt 12).
#   ./restore.sh /var/backups/inhouseticket/inhouseticket_2026-11-14_033000.dump
#
# Ersetzt den kompletten Datenbestand durch den Stand der Sicherung. Vorher sichert das Skript den
# aktuellen Stand (falls möglich) – ein Irrtum lässt sich so rückgängig machen.
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"
file="${1:-}"
[[ -n "$file" && -f "$file" ]] || { echo "Aufruf: ./restore.sh <datei.dump>  (Sicherungen: ls -lh ${BACKUP_DIR:-/var/backups/inhouseticket})" >&2; exit 1; }
file="$(readlink -f "$file")"

docker compose exec -T postgres pg_restore --list < "$file" > /dev/null || { echo "Keine gültige Sicherung: $file" >&2; exit 1; }

if [[ "${CONFIRM:-}" != "WIEDERHERSTELLEN" ]]; then
  echo "Achtung: Alle aktuellen Daten werden durch den Stand aus $(basename "$file") ersetzt."
  read -r -p "Zum Fortfahren WIEDERHERSTELLEN eintippen: " answer
  [[ "$answer" == "WIEDERHERSTELLEN" ]] || { echo "Abgebrochen."; exit 1; }
fi

echo "Sichere den aktuellen Stand …"
./backup.sh || echo "(Sicherung des aktuellen Stands nicht möglich – weiter)"

echo "Stoppe die App …"
docker compose stop app

echo "Lege die Datenbank neu an und spiele die Sicherung ein …"
docker compose exec -T postgres psql -U inhouseticket -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS inhouseticket WITH (FORCE);" \
  -c "CREATE DATABASE inhouseticket OWNER inhouseticket;" > /dev/null
docker compose exec -T postgres pg_restore -U inhouseticket -d inhouseticket --no-owner --exit-on-error < "$file"

echo "Starte die App …"
docker compose start app
status=starting
for _ in $(seq 1 60); do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q app)" 2>/dev/null || echo starting)"
  [[ "$status" == "healthy" ]] && break
  sleep 5
done
[[ "$status" == "healthy" ]] || { echo "Die App wurde nicht bereit. Logs: docker compose logs --tail=100 app" >&2; exit 1; }
echo "Wiederhergestellt aus $(basename "$file"): $(docker compose exec -T app wget -qO- http://127.0.0.1:3000/api/health)"
