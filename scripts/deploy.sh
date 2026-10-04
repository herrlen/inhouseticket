#!/usr/bin/env bash
# Rolls out a green main commit to mittwald (project p-flw0r0 "Ticket").
#
#   scripts/deploy.sh            deploys HEAD of main (image built by CI: sha-<commit>)
#
# Preconditions: on main, clean tree, CI green for HEAD (the CI job "image" pushed the image).
# Secrets are read from the running stack and handed to `mw` in a mode-600 temp file that is
# deleted afterwards; nothing is printed. On the very first deploy POSTGRES_PASSWORD and
# BETTER_AUTH_SECRET are generated once; afterwards they always come from the running stack.
# SMTP_PASSWORD and BETA_ALLOWED_DOMAINS keep their deployed values unless set in the environment
# (BETA_ALLOWED_DOMAINS=studioluy.de,firma.de scripts/deploy.sh).
#
# Needs: gh, mw, jq, curl, openssl.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PROJECT=p-flw0r0
URL=https://inhouseticket.com

schritt() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
fehler() { printf '\033[31mFEHLER: %s\033[0m\n' "$*" >&2; exit 1; }

schritt "Stand"
[[ "$(git rev-parse --abbrev-ref HEAD)" == "main" ]] || fehler "nicht auf main"
git diff --quiet HEAD -- || fehler "nicht committete Änderungen"
git fetch -q origin main
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || fehler "HEAD ist nicht origin/main – erst pushen"
SHA="$(git rev-parse HEAD)"
TAG="sha-$SHA"
echo "Commit $(git log --oneline -1)"

CI="$(gh run list --commit "$SHA" --workflow CI --json conclusion,status -q '.[0] | "\(.status) \(.conclusion)"')"
[[ "$CI" == "completed success" ]] || fehler "CI für $SHA nicht grün (${CI:-kein Lauf})"

schritt "Stack"
STATE="$(mw stack list -p "$PROJECT" -o json 2>/dev/null)"
STACK="$(jq -r '.[0].id // empty' <<<"$STATE")"
[[ -n "$STACK" ]] || fehler "kein Container-Stack im Projekt – in mStudio unter Container einmal anlegen"
env_of() { jq -r --arg s "$1" --arg k "$2" '.[0].services[]? | select(.serviceName==$s) | .deployedState.envs[$k] // empty' <<<"$STATE"; }

ENVFILE="$(mktemp)"
chmod 600 "$ENVFILE"
trap 'rm -f "$ENVFILE"' EXIT

PG="$(env_of postgres POSTGRES_PASSWORD)"
AUTH="$(env_of app BETTER_AUTH_SECRET)"
SERVICES="$(jq -r '[.[0].services[]?.serviceName] | join(" ")' <<<"$STATE")"
FORCE=()
if [[ -z "$PG" || -z "$AUTH" ]]; then
  # Never regenerate secrets while our database exists – that would lock the app out of its data.
  [[ " $SERVICES " != *" postgres "* ]] || fehler "postgres läuft, aber Secrets nicht lesbar – Abbruch"
  echo "Erster Deploy: Datenbank-Passwort und Auth-Secret werden erzeugt (nicht ausgegeben)."
  PG="$(openssl rand -hex 24)"
  AUTH="$(openssl rand -base64 32)"
  # mStudio needs a first container to create the stack (e.g. nginx:alpine); it gets replaced.
  if [[ -n "$SERVICES" ]]; then
    echo "Platzhalter im Stack wird ersetzt: $SERVICES"
    FORCE=(-f)
  fi
fi
SMTP="${SMTP_PASSWORD:-$(env_of app SMTP_PASSWORD)}"
BETA="${BETA_ALLOWED_DOMAINS:-$(env_of app BETA_ALLOWED_DOMAINS)}"
[[ -n "$SMTP" ]] || echo "Hinweis: SMTP_PASSWORD fehlt – Anmeldelinks können nicht verschickt werden. In mStudio (Container app, Umgebung) eintragen."
[[ -n "$BETA" ]] && echo "Beta-Domains: $BETA" || echo "Hinweis: BETA_ALLOWED_DOMAINS leer – Registrierung ist OFFEN."

{
  printf 'IMAGE_TAG=%s\n' "$TAG"
  printf 'POSTGRES_PASSWORD=%s\n' "$PG"
  printf 'BETTER_AUTH_SECRET=%s\n' "$AUTH"
  printf 'SMTP_HOST=%s\n' "mail.agenturserver.de"
  printf 'SMTP_PORT=%s\n' "465"
  printf 'SMTP_PASSWORD=%s\n' "$SMTP"
  printf 'BETA_ALLOWED_DOMAINS=%s\n' "$BETA"
} >"$ENVFILE"

schritt "Ausrollen ($TAG)"
mw stack deploy -s "$STACK" -c infra/mittwald-stack.yml --env-file "$ENVFILE" -q "${FORCE[@]}" >/dev/null
rm -f "$ENVFILE"

schritt "Prüfen"
for i in $(seq 1 60); do
  V="$(curl -sf -m 5 "$URL/api/health" | jq -r '.version // empty' 2>/dev/null || true)"
  [[ "$V" == "$TAG" ]] && { echo "Live: $URL ($TAG) nach ${i}×5 s"; exit 0; }
  sleep 5
done
fehler "Neue Version nach 5 Minuten nicht erreichbar – Logs: mw container logs -p $PROJECT app"
