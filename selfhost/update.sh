#!/usr/bin/env bash
# Spielt eine neue Version ein (docs/selbst-hosten.md, Schritt 11):
#   ./update.sh                 neueste Version von "main"
#   ./update.sh sha-<commit>    genau diesen Stand (auch zum Zurückgehen auf einen älteren)
#
# Ablauf: Sicherung → Image laden → Dateien dieses Ordners aus dem Image erneuern (.env bleibt)
# → IMAGE_TAG in .env setzen → neu starten (Migrationen laufen beim Start) → Health-Check.
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"
[[ -f .env ]] || { echo "Keine .env – erst ./install.sh ausführen." >&2; exit 1; }

env_value() { sed -n "s/^$1=['\"]\{0,1\}\([^'\"]*\)['\"]\{0,1\}$/\1/p" .env | tail -n1; }

OLD_TAG="$(env_value IMAGE_TAG)"
IMAGE="$(env_value IMAGE)"; IMAGE="${IMAGE:-ghcr.io/herrlen/inhouseticket}"
TAG="${1:-main}"
[[ "$TAG" =~ ^[A-Za-z0-9._-]{1,128}$ ]] || { echo "Ungültiger Tag: $TAG" >&2; exit 1; }

echo "Version jetzt: $(docker compose exec -T app wget -qO- http://127.0.0.1:3000/api/health 2>/dev/null || echo 'unbekannt') (Tag $OLD_TAG)"

echo "1/5 Sicherung vor dem Update …"
./backup.sh

echo "2/5 Lade $IMAGE:$TAG …"
if ! docker pull --quiet "$IMAGE:$TAG" >/dev/null; then
  # Offline oder Registry gestört: ein lokal vorhandenes Image reicht.
  docker image inspect "$IMAGE:$TAG" >/dev/null 2>&1 || { echo "Image nicht ladbar – docker login ghcr.io prüfen." >&2; exit 1; }
  echo "   (Registry nicht erreichbar – nutze das lokale Image)"
fi

echo "3/5 Erneuere die Dateien dieses Ordners aus dem Image …"
tmp="$(mktemp -d)"
cid="$(docker create "$IMAGE:$TAG")"
trap 'docker rm -f "$cid" >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT
if docker cp "$cid:/selfhost/." "$tmp/" 2>/dev/null && [[ -f "$tmp/docker-compose.yml" ]]; then
  for f in "$tmp"/* "$tmp"/.env.example; do
    [[ -f "$f" ]] || continue
    name="$(basename "$f")"
    [[ "$name" == ".env" ]] && continue
    # Neue Datei daneben schreiben und umbenennen: ein laufendes Skript (auch dieses) liest weiter die alte.
    cp "$f" "./$name.new"
    [[ "$name" == *.sh ]] && chmod 755 "./$name.new"
    mv "./$name.new" "./$name"
  done
else
  echo "   (Image ohne /selfhost – Dateien bleiben wie sie sind)"
fi

echo "4/5 Starte mit $TAG …"
if grep -q '^IMAGE_TAG=' .env; then
  sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG='$TAG'/" .env
else
  printf "IMAGE_TAG='%s'\n" "$TAG" >> .env
fi
docker compose up -d --remove-orphans

echo "5/5 Warte auf die App …"
status=starting
for _ in $(seq 1 60); do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q app)" 2>/dev/null || echo starting)"
  [[ "$status" == "healthy" ]] && break
  sleep 5
done
if [[ "$status" != "healthy" ]]; then
  echo "Die App wurde nicht bereit. Logs: docker compose logs --tail=100 app" >&2
  echo "Zurück zur alten Version: ./update.sh $OLD_TAG (bei fehlgeschlagener Migration vorher ./restore.sh mit der Sicherung von eben)" >&2
  exit 1
fi
echo "Fertig: $(docker compose exec -T app wget -qO- http://127.0.0.1:3000/api/health)"
docker image prune -f >/dev/null
