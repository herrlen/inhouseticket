#!/usr/bin/env bash
# Richtet inhouseticket in diesem Ordner ein (docs/selbst-hosten.md, Schritt 6):
#   1. prüft Docker und den Zugang zur Registry
#   2. fragt Adresse, Firma und SMTP-Daten ab (Enter übernimmt den Wert in Klammern)
#   3. erzeugt die Geheimnisse – vorhandene bleiben unverändert
#   4. schreibt .env (Rechte 600) und startet alles
#
# Mehrfach ausführbar: Ein zweiter Lauf zeigt die gespeicherten Werte als Vorschlag und überschreibt
# keine Geheimnisse. Ohne Rückfragen (z. B. für Tests): NONINTERACTIVE=1 und die Werte als
# Umgebungsvariablen (DOMAIN, ADMIN_EMAIL, BETA_ALLOWED_DOMAINS, SMTP_HOST …) übergeben.
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"
ENV_FILE=.env
NONINTERACTIVE="${NONINTERACTIVE:-0}"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mFehler:\033[0m %s\n' "$*" >&2; exit 1; }

# ── 1. Voraussetzungen ───────────────────────────────────────────────────────────────────────────
command -v docker >/dev/null || fail "Docker fehlt. Erst Schritt 4 der Anleitung (Docker installieren)."
docker compose version >/dev/null 2>&1 || fail "Das Docker-Compose-Plugin fehlt (Paket docker-compose-plugin)."
docker info >/dev/null 2>&1 || fail "Docker läuft nicht oder dieser Benutzer darf es nicht nutzen (als root ausführen)."
command -v openssl >/dev/null || fail "openssl fehlt (apt install openssl)."
[[ -f docker-compose.yml && -f Caddyfile ]] || fail "docker-compose.yml oder Caddyfile fehlen in $(pwd)."

# ── 2. Vorhandene Werte lesen (nie ausführen – nur KEY='wert'-Zeilen) ────────────────────────────
declare -A CUR=()
if [[ -f "$ENV_FILE" ]]; then
  while IFS= read -r line; do
    [[ "$line" =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]] || continue
    key="${BASH_REMATCH[1]}"
    val="${BASH_REMATCH[2]}"
    val="${val#\'}"; val="${val%\'}"
    val="${val#\"}"; val="${val%\"}"
    CUR[$key]="$val"
  done < "$ENV_FILE"
  say "Vorhandene .env gefunden – Werte werden als Vorschlag übernommen, Geheimnisse bleiben."
fi

# Wert: Umgebungsvariable > vorhandene .env > Vorgabe
current() { local k="$1" d="${2:-}"; local v="${!k:-}"; [[ -n "$v" ]] || v="${CUR[$k]:-}"; [[ -n "$v" ]] || v="$d"; printf '%s' "$v"; }

# ask VAR "Frage" [Vorgabe] [secret] [optional]
ask() {
  local var="$1" prompt="$2" def secret="${4:-}" optional="${5:-}" input
  def="$(current "$var" "${3:-}")"
  while true; do
    if [[ "$NONINTERACTIVE" == "1" ]]; then
      input="$def"
    elif [[ "$secret" == "secret" ]]; then
      local hint=""; [[ -n "$def" ]] && hint=" [gespeichert – Enter behält es]"
      read -r -s -p "$prompt$hint: " input; echo
      [[ -n "$input" ]] || input="$def"
    else
      local hint=""; [[ -n "$def" ]] && hint=" [$def]"
      read -r -p "$prompt$hint: " input
      [[ -n "$input" ]] || input="$def"
    fi
    if [[ "$input" == *"'"* || "$input" == *$'\n'* ]]; then
      echo "Bitte ohne einfache Anführungszeichen ('). "; [[ "$NONINTERACTIVE" == "1" ]] && fail "$var enthält ein '."; continue
    fi
    if [[ -z "$input" && "$optional" != "optional" ]]; then
      [[ "$NONINTERACTIVE" == "1" ]] && fail "$var fehlt."
      echo "Bitte einen Wert eingeben."; continue
    fi
    printf -v "$var" '%s' "$input"
    return
  done
}

valid_domain() { [[ "$1" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ || "$1" == "localhost" ]]; }
valid_email() { [[ "$1" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; }

say "Adresse"
while true; do
  ask DOMAIN "Subdomain für inhouseticket (z. B. tickets.firma.de, ohne https://)"
  DOMAIN="${DOMAIN,,}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"
  valid_domain "$DOMAIN" && break
  [[ "$NONINTERACTIVE" == "1" ]] && fail "DOMAIN ist keine gültige Domain."
  echo "Das sieht nicht nach einer Domain aus."
done

say "Firma"
while true; do
  ask ADMIN_EMAIL "Deine E-Mail-Adresse (Betreiber, Let's Encrypt)" "$(current SUPERADMIN_EMAILS | cut -d, -f1)"
  valid_email "$ADMIN_EMAIL" && break
  [[ "$NONINTERACTIVE" == "1" ]] && fail "ADMIN_EMAIL ist keine gültige Adresse."
  echo "Bitte eine gültige E-Mail-Adresse eingeben."
done
ADMIN_EMAIL="${ADMIN_EMAIL,,}"
ask BETA_ALLOWED_DOMAINS "Firmen-Domain(s), die sich registrieren dürfen (Komma-getrennt)" "${ADMIN_EMAIL#*@}"
BETA_ALLOWED_DOMAINS="$(printf '%s' "${BETA_ALLOWED_DOMAINS,,}" | tr -d ' @')"
ask INSTANCE_NAME "Name der Firma (für den Hinweis im Impressum, optional)" "" "" optional
ask IMPRINT_URL "Link zum Impressum der Firma (optional)" "" "" optional
ask PRIVACY_URL "Link zur Datenschutzerklärung der Firma (optional)" "" "" optional
for u in "$IMPRINT_URL" "$PRIVACY_URL"; do
  [[ -z "$u" || "$u" =~ ^https?:// ]] || fail "Links müssen mit https:// beginnen: $u"
done

say "E-Mail-Versand (SMTP-Postfach der Firma)"
ask SMTP_HOST "SMTP-Server (z. B. smtp.firma.de)"
ask SMTP_PORT "SMTP-Port (587 = STARTTLS, 465 = TLS)" "587"
[[ "$SMTP_PORT" =~ ^[0-9]+$ ]] || fail "SMTP_PORT muss eine Zahl sein."
ask SMTP_USER "SMTP-Benutzer (meist die Postfach-Adresse)" "" "" optional
ask SMTP_PASSWORD "SMTP-Passwort" "" secret optional
ask MAIL_FROM "Absender" "inhouseticket <${SMTP_USER:-$ADMIN_EMAIL}>"
ask MAIL_REPLY_TO "Antworten gehen an (optional)" "$ADMIN_EMAIL" "" optional

IMAGE_TAG="$(current IMAGE_TAG main)"
IMAGE="$(current IMAGE ghcr.io/herrlen/inhouseticket)"
TESTER_EMAILS="$(current TESTER_EMAILS)"
# Weitere Betreiber aus einer vorhandenen .env bleiben erhalten.
SUPERADMIN_EMAILS="$(current SUPERADMIN_EMAILS "$ADMIN_EMAIL")"
[[ ",$SUPERADMIN_EMAILS," == *",$ADMIN_EMAIL,"* ]] || SUPERADMIN_EMAILS="$ADMIN_EMAIL,$SUPERADMIN_EMAILS"
ACME_EMAIL="$(current ACME_EMAIL "$ADMIN_EMAIL")"

# ── 3. Geheimnisse: nur erzeugen, was fehlt ──────────────────────────────────────────────────────
secret() { local k="$1" gen="$2"; local v="${CUR[$k]:-}"; [[ -n "$v" ]] || v="$($gen)"; printf '%s' "$v"; }
POSTGRES_PASSWORD="$(secret POSTGRES_PASSWORD 'openssl rand -hex 32')"
BETTER_AUTH_SECRET="$(secret BETTER_AUTH_SECRET 'openssl rand -hex 32')"
INTEGRATION_SECRET="$(secret INTEGRATION_SECRET 'openssl rand -hex 32')"

# ── 4. .env schreiben (erst in eine Temp-Datei mit 600, dann umbenennen) ─────────────────────────
umask 077
TMP="$(mktemp "$ENV_FILE.XXXXXX")"
trap 'rm -f "$TMP"' EXIT
{
  echo "# inhouseticket – geschrieben von install.sh am $(date '+%F %T'). Erklärung: .env.example"
  echo "# Geheim: nie weitergeben. Kopie in den Passwort-Manager."
  for k in DOMAIN ACME_EMAIL IMAGE IMAGE_TAG BETA_ALLOWED_DOMAINS SUPERADMIN_EMAILS TESTER_EMAILS INSTANCE_NAME IMPRINT_URL PRIVACY_URL \
           SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASSWORD MAIL_FROM MAIL_REPLY_TO POSTGRES_PASSWORD BETTER_AUTH_SECRET INTEGRATION_SECRET; do
    printf "%s='%s'\n" "$k" "${!k}"
  done
} > "$TMP"
chmod 600 "$TMP"
[[ -f "$ENV_FILE" ]] && cp -p "$ENV_FILE" "$ENV_FILE.bak"
mv "$TMP" "$ENV_FILE"
trap - EXIT
say ".env geschrieben ($(pwd)/$ENV_FILE, nur für root lesbar)."
[[ -f "$ENV_FILE.bak" ]] && chmod 600 "$ENV_FILE.bak"

docker compose config --quiet || fail "docker compose config meldet einen Fehler in .env."

# ── 5. Starten ───────────────────────────────────────────────────────────────────────────────────
if [[ "${SKIP_START:-0}" == "1" ]]; then
  say "Fertig (ohne Start). Starten mit: docker compose up -d"
  exit 0
fi
say "Lade die Images und starte (beim ersten Mal 1–3 Minuten) …"
# Fehlende Images holt up selbst; neue Versionen holt erst update.sh.
docker compose up -d --remove-orphans || fail "Start fehlgeschlagen. Ist 'docker login ghcr.io' erledigt (Schritt 5)?"

say "Warte, bis die App bereit ist (Migrationen beim ersten Start) …"
for _ in $(seq 1 60); do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q app)" 2>/dev/null || echo starting)"
  [[ "$status" == "healthy" ]] && break
  sleep 5
done
[[ "${status:-}" == "healthy" ]] || fail "Die App wurde nicht bereit. Logs: docker compose logs --tail=100 app"
echo "App läuft: $(docker compose exec -T app wget -qO- http://127.0.0.1:3000/api/health)"

if command -v curl >/dev/null && [[ "$DOMAIN" != "localhost" ]]; then
  say "Prüfe https://$DOMAIN (das Zertifikat kann beim ersten Start bis zu einer Minute dauern) …"
  for _ in $(seq 1 24); do
    curl -fsS --max-time 10 "https://$DOMAIN/api/health" >/dev/null 2>&1 && { echo "https://$DOMAIN antwortet mit gültigem Zertifikat."; break; }
    sleep 5
  done || true
  curl -fsS --max-time 10 "https://$DOMAIN/api/health" >/dev/null 2>&1 \
    || echo "Noch keine Antwort über https – DNS und Firewall prüfen, dann: docker compose logs caddy"
fi

say "Fertig. Öffne https://$DOMAIN/register und registriere dich mit $ADMIN_EMAIL."
echo "Backups einrichten: ./backup.sh --install-timer"
