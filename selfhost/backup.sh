#!/usr/bin/env bash
# Sichert die Datenbank (der einzige Zustand – Anhänge liegen darin) als pg_dump im Custom-Format
# nach $BACKUP_DIR (Standard /var/backups/inhouseticket) und löscht Sicherungen älter als
# $KEEP_DAYS Tage (Standard 14). Erst als .tmp geschrieben – ein abgebrochener Dump sieht nie wie
# ein gültiger aus.
#
#   ./backup.sh                  eine Sicherung jetzt
#   ./backup.sh --install-timer  täglich 03:30 per systemd-Timer (einmal als root ausführen)
#
# Wiederherstellen: ./restore.sh <datei.dump> (docs/selbst-hosten.md, Schritt 12).
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/inhouseticket}"
KEEP_DAYS="${KEEP_DAYS:-14}"

if [[ "${1:-}" == "--install-timer" ]]; then
  [[ "$(id -u)" == "0" ]] || { echo "Bitte als root ausführen." >&2; exit 1; }
  script="$(pwd)/backup.sh"
  cat > /etc/systemd/system/inhouseticket-backup.service <<EOF
[Unit]
Description=inhouseticket – Datenbank-Sicherung
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
Environment=BACKUP_DIR=$BACKUP_DIR KEEP_DAYS=$KEEP_DAYS
ExecStart=$script
EOF
  cat > /etc/systemd/system/inhouseticket-backup.timer <<'EOF'
[Unit]
Description=inhouseticket – tägliche Datenbank-Sicherung

[Timer]
OnCalendar=*-*-* 03:30:00
RandomizedDelaySec=10min
Persistent=true

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now inhouseticket-backup.timer
  echo "Timer aktiv. Nächster Lauf:"
  systemctl list-timers inhouseticket-backup.timer --no-pager
  exit 0
fi

umask 077
mkdir -p "$BACKUP_DIR"
file="$BACKUP_DIR/inhouseticket_$(date +%F_%H%M%S).dump"
docker compose exec -T postgres pg_dump -U inhouseticket -d inhouseticket -Fc > "$file.tmp"
# Ein leerer oder kaputter Dump zählt nicht: pg_restore muss das Inhaltsverzeichnis lesen können.
docker compose exec -T postgres pg_restore --list < "$file.tmp" > /dev/null
mv "$file.tmp" "$file"
find "$BACKUP_DIR" -maxdepth 1 -name 'inhouseticket_*.dump' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'inhouseticket_*.dump.tmp' -mmin +120 -delete
echo "Gesichert: $file ($(du -h "$file" | cut -f1))"
