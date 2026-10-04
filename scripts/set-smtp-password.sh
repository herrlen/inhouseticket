#!/usr/bin/env bash
# Sets the SMTP password of no-reply@inhouseticket.com on the running stack.
# Run it yourself – the password is read hidden and never stored or printed:
#
#   scripts/set-smtp-password.sh
#
# Internally it re-runs scripts/deploy.sh with SMTP_PASSWORD set; all other settings (database
# password, auth secret, beta domains) are taken over from the running stack.
set -euo pipefail
cd "$(dirname "$0")/.."

printf 'Passwort für no-reply@inhouseticket.com (Eingabe bleibt unsichtbar): '
IFS= read -rs PASSWORD
printf '\n'
[[ -n "$PASSWORD" ]] || { echo "Abgebrochen: leeres Passwort." >&2; exit 1; }

SMTP_PASSWORD="$PASSWORD" scripts/deploy.sh
unset PASSWORD
echo "SMTP-Passwort gesetzt. Test: auf https://inhouseticket.com/login einen Anmeldelink anfordern."
