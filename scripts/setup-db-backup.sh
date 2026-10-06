#!/usr/bin/env bash
# Creates (or updates) the nightly PostgreSQL dump as a mittwald cronjob in the postgres container.
# Dumps land in the volume inhouseticket-pgbackup (/backups), which the project backup at 04:25
# picks up (30 days). Kept 14 days in the volume itself. Restore: docs/betrieb.md → Backups.
set -euo pipefail

PROJECT=p-flw0r0
CONTAINER=7eb23623-0c27-428b-98c3-bf2b4bc9c2b4   # postgres
DESCRIPTION="inhouseticket – nightly pg_dump"
MW=(pnpm dlx @mittwald/cli@1.25.0)   # needs --container-id (mw >= 1.25)

# Custom format (-Fc): compressed, restorable per table; written to .tmp first so a broken dump
# never looks like a valid one. User and database are spelled out: cronjob runs do not get the
# container's environment (POSTGRES_USER would be empty → "role root does not exist").
read -r -d '' COMMAND <<'SH' || true
sh -c 'set -e; d=/backups; f="$d/inhouseticket_$(date +%F_%H%M%S).dump"; pg_dump -U inhouseticket -d inhouseticket -Fc -f "$f.tmp"; mv "$f.tmp" "$f"; find "$d" -name "inhouseticket_*.dump" -mtime +14 -delete'
SH

EXISTING="$("${MW[@]}" cronjob list -p "$PROJECT" -o json 2>/dev/null | jq -r --arg d "$DESCRIPTION" '.[] | select(.description==$d) | .id')"
if [[ -n "$EXISTING" ]]; then
  "${MW[@]}" cronjob update "$EXISTING" --command "$COMMAND" --quiet
  echo "Cronjob aktualisiert: $EXISTING"
  exit 0
fi

"${MW[@]}" cronjob create -p "$PROJECT" \
  --container-id "$CONTAINER" \
  --description "$DESCRIPTION" \
  --interval "30 3 * * *" \
  --timezone "Europe/Berlin" \
  --timeout 30m \
  --email hello@inhouseticket.com \
  --command "$COMMAND"
echo "Angelegt: täglich 03:30 (Berlin), vor dem Projekt-Backup um 04:25."
