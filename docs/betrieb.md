# Betrieb – inhouseticket.com

Fortgeschrieben nach jedem Deploy, der etwas an der Infrastruktur ändert.

## mittwald

| | |
|---|---|
| Projekt | `p-flw0r0` „Ticket“, Host `schmalge` (Space-Server, wie luibui) |
| Stack | `inhouseticket` (`1099f46e-5c61-446a-83bc-60e17ccdf626`), Definition `infra/mittwald-stack.yml` |
| Container | `app` (`928394b5-…`, c-zgfdbf, Next.js, Port 3000, 512m) · `postgres` (`7eb23623-…`, c-ktw3ya, Postgres 16, 512m, Volume `inhouseticket-pgdata`) |
| Image | `ghcr.io/herrlen/inhouseticket:sha-<commit>`, gebaut vom CI-Job `image` für grüne `main`-Commits |
| Registry | GitHub (ghcr.io), Benutzer `herrlen`, Token der GitHub-CLI (Lens Wahl, voller Repo-Zugriff; wird ungültig bei gh-Neuanmeldung → dann neu eintragen) |
| Mail | SMTP `mail.agenturserver.de:465`, Absender `no-reply@inhouseticket.com`, Reply-To `hello@inhouseticket.com` |

| Host | Ziel |
|---|---|
| `inhouseticket.com` | Container `app`, `3000/tcp` |
| `www.inhouseticket.com` | 301 → `https://inhouseticket.com/` |
| `p-flw0r0.project.space` | Standardseite |

TLS: Let's Encrypt über mittwald, automatisch.

## Geheimnisse

Nur in der Stack-Konfiguration bei mittwald, keine lokale Kopie: `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`
(beim ersten Deploy erzeugt), `SMTP_PASSWORD` (setzt Len mit `scripts/set-smtp-password.sh`).
`scripts/deploy.sh` liest sie aus dem laufenden Stack und gibt sie nie aus.

## Ausrollen

```sh
scripts/deploy.sh                                   # HEAD von main, CI muss grün sein
BETA_ALLOWED_DOMAINS=studioluy.de,firma.de scripts/deploy.sh   # Beta-Liste ändern
SUPERADMIN_EMAILS=a@x.de,b@y.de scripts/deploy.sh             # Betreiber-Zugang /admin ändern
scripts/set-smtp-password.sh                        # SMTP-Passwort setzen (fragt verdeckt, nur Len)
```

Beta-Domains (Stand 2026-10-04): `studioluy.de`, `ursalz.com`.

Migrationen laufen beim Start des App-Containers. Prüfung: `https://inhouseticket.com/api/health` meldet
`status`, `database` und `version` (= `sha-<commit>`).

Logs: `mw container logs -p p-flw0r0 app`

⚠ Der vHost zeigt auf die Container-ID von `app`. Wird der Service umbenannt oder der Stack neu angelegt,
muss der vHost neu verbunden werden (`mw domain virtualhost update f3f931a6-… --path-to-container "/:<id>:3000/tcp"`).

## Deploys

### 2026-10-04 — erster Deploy, `908587a` (geschlossene Beta)

- Platzhalter `nginx:alpine` ersetzt; Migrationen 0000–0003 beim Start gelaufen.
- vHost `inhouseticket.com` von Standardseite auf Container `app` umgestellt, `www` → 301 (brauchte ~1 Min.).
- Von außen geprüft: `/api/health` ok (Datenbank ok, Version `sha-908587a…`), `/login` und `/impressum` 200,
  `robots.txt` Disallow, `noindex`, Zertifikat Let's Encrypt bis 31.12.2026, fremde Domain → `BETA_CLOSED`,
  Gmail → `FREEMAIL_NOT_ALLOWED`.
- Offen: `SMTP_PASSWORD` (ohne das scheitert der Versand von Anmeldelinks), Anmeldetest mit `@studioluy.de`.

### 2026-10-04 — `0f6bb00`, Beta-Liste erweitert

- `BETA_ALLOWED_DOMAINS=studioluy.de,ursalz.com`; Impressum ohne EU-OS-Hinweis (Plattform seit 20.07.2025 eingestellt).
- Live nach 20 s. `SMTP_PASSWORD` weiterhin offen → `scripts/set-smtp-password.sh` (Len).

### 2026-10-04 — SMTP gesetzt

- `SMTP_PASSWORD` von Len über `scripts/set-smtp-password.sh` eingetragen; Anmeldelinks werden versendet.

### Stand 2026-10-05 — `b47bc2b` live

- Zwischen `0f6bb00` und `b47bc2b` ausgerollt (einzelne Deploys nicht protokolliert): Kanban (S4),
  Unteraufgaben/Anhänge/Kommentare (S5), Speed-Features (S6), Dashboard/Inbox/Digest (S7), API-Tokens und
  MCP-Server (S8), Betreiber-Übersicht `/admin`.
- Migrationen bis `0006_workspace_lock` beim Start gelaufen.
- Von außen geprüft: `/api/health` ok (Datenbank ok, Version `sha-b47bc2b…`), `/admin` ohne Anmeldung → 307.
