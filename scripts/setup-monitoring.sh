#!/usr/bin/env bash
# Health check every 5 minutes as a mittwald cronjob in the app container (idempotent).
# It calls the public URL, so ingress, TLS, app and database are covered; a failed run sends a
# mail to hello@inhouseticket.com. A full mittwald outage is not detected – add an external
# uptime check for that (docs/betrieb.md → Monitoring).
set -euo pipefail

PROJECT=p-flw0r0
CONTAINER=928394b5-e15d-4a0f-a57a-a63cf97e64b6   # app
DESCRIPTION="inhouseticket – health check"
MW=(pnpm dlx @mittwald/cli@1.25.0)

read -r -d '' COMMAND <<'SH' || true
node -e 'fetch("https://inhouseticket.com/api/health",{signal:AbortSignal.timeout(15000)}).then(r=>r.json()).then(j=>{if(j.status!=="ok"||j.database!=="ok"){console.error("unhealthy",JSON.stringify(j));process.exit(1)}}).catch(e=>{console.error("unreachable",e.message);process.exit(1)})'
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
  --interval "*/5 * * * *" \
  --timezone "Europe/Berlin" \
  --timeout 1m \
  --email hello@inhouseticket.com \
  --command "$COMMAND"
echo "Angelegt: alle 5 Minuten, Fehler per Mail an hello@inhouseticket.com."
