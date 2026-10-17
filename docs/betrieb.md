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
(beim ersten Deploy erzeugt), `SMTP_PASSWORD` (setzt Len mit `scripts/set-smtp-password.sh`), `MATOMO_TOKEN`.
`scripts/deploy.sh` liest sie aus dem laufenden Stack und gibt sie nie aus.

## Ausrollen

```sh
scripts/deploy.sh                                   # HEAD von main, CI muss grün sein
BETA_ALLOWED_DOMAINS=studioluy.de,firma.de scripts/deploy.sh   # Beta-Liste ändern; " " leert sie (Registrierung offen)
SUPERADMIN_EMAILS=a@x.de,b@y.de scripts/deploy.sh             # Betreiber-Zugang /admin ändern
TESTER_EMAILS=a@gmail.com,b@web.de scripts/deploy.sh          # einzelne Tester trotz Freemail/Beta zulassen (ohne /admin); " " leert die Liste
SITE_INDEXABLE=true scripts/deploy.sh                          # zum Launch: Suchmaschinen zulassen (Sitemap, robots)
MATOMO_SITE_ID=4 MATOMO_TOKEN=… scripts/deploy.sh             # Matomo einschalten; MATOMO_TOKEN=" " schaltet aus
scripts/set-smtp-password.sh                        # SMTP-Passwort setzen (fragt verdeckt, nur Len)
```

Seit 2026-10-10 ist die Beta-Liste leer (Registrierung offen) und `SITE_INDEXABLE=true`.

Migrationen laufen beim Start des App-Containers. Prüfung: `https://inhouseticket.com/api/health` meldet
`status`, `database` und `version` (= `sha-<commit>`).

Logs: `mw container logs -p p-flw0r0 app`

⚠ Der vHost zeigt auf die Container-ID von `app`. Wird der Service umbenannt oder der Stack neu angelegt,
muss der vHost neu verbunden werden (`mw domain virtualhost update f3f931a6-… --path-to-container "/:<id>:3000/tcp"`).

## Backups

Zwei Ebenen:

1. **Projekt-Backup von mittwald** – täglich 04:25, 30 Tage aufbewahrt (`mw backup list -p p-flw0r0`). Enthält alle
   Volumes, also auch die Datenbank-Dateien. Eine Dateikopie einer laufenden Datenbank ist aber nicht garantiert
   konsistent – deshalb zusätzlich:
2. **Nächtlicher `pg_dump`** – mittwald-Cronjob im Postgres-Container, täglich 03:30 (Berlin), Format `-Fc`, nach
   `/backups` im Volume `inhouseticket-pgbackup`; 14 Tage dort, über das Projekt-Backup 30 Tage. Angelegt mit
   `scripts/setup-db-backup.sh` (idempotent). Fehler gehen per Mail an hello@inhouseticket.com.
   Cronjob-ID `257ad452-1d55-4df4-b830-f0646b82bbd4`. Läufe prüfen:
   `pnpm dlx @mittwald/cli@1.25.0 cronjob execution list --cronjob-id 257ad452-… -o txt`, Ausgabe eines Laufs:
   `… cronjob execution logs <cronjob-id> <execution-id> --no-pager`.
   ⚠ Cronjob-Läufe bekommen die Umgebung des Containers nicht – Benutzer und Datenbank stehen deshalb im Befehl.

### Wiederherstellen

```bash
# Im Postgres-Container (mStudio → Container → postgres → Terminal, oder mw container ssh):
ls -lt /backups | head                       # neuesten Dump wählen
pg_restore -U inhouseticket -d inhouseticket --clean --if-exists --no-owner /backups/inhouseticket_<datum>.dump
```

Liegt der benötigte Dump nicht mehr im Volume: in mStudio das Projekt-Backup des Tages wiederherstellen
(nur das Volume `inhouseticket-pgbackup` auswählen), danach wie oben. Vor einem Restore die App stoppen
(`mw container stop` für `app`), damit niemand während der Wiederherstellung schreibt.

## Monitoring und E-Mail

- **Health-Check:** mittwald-Cronjob im App-Container alle 5 Minuten (`scripts/setup-monitoring.sh`, ID
  `883c622f-…`). Ruft die öffentliche URL `/api/health` ab (Proxy, TLS, App, Datenbank); bei Fehler Mail an
  hello@. Erkennt **keinen** Komplettausfall von mittwald – dafür zusätzlich einen externen Dienst nutzen
  (z. B. UptimeRobot oder Better Stack, Check auf `https://inhouseticket.com/api/health`, Schlüsselwort `"ok"`).
- **E-Mail-Authentifizierung:** SPF (`include:agenturserver.de`), DKIM von mittwald (Selektoren `agenturserver`,
  `agenturserver2048`), DMARC seit 2026-10-07 `p=none` mit Berichten an hello@ (Zone `_dmarc` per API angelegt).
  Nach einigen Wochen ohne Auffälligkeiten auf `p=quarantine` anheben.
- **Restore-Probe** 2026-10-07: Dump von 03:30 in eine temporäre Datenbank im Postgres-Container zurückgespielt,
  30 Tabellen, Zeilenzahlen wie live (bis auf ein später angelegtes Ticket); Probe-Datenbank danach gelöscht.

## Matomo

Reichweite der öffentlichen Seiten (Startseite, Rechtstexte – nie Workspaces, nie Login) zusätzlich zur
eigenen Zählung in `/admin`. Matomo läuft unter `analytics.klatxt.de` (Projekt `p-mdg6ae`, wie bei
websecureaudit). Der Browser spricht nur mit `/stat` und `/stat.js` auf inhouseticket.com; `src/lib/matomo.ts`
reicht weiter, kürzt die IP vorher (IPv4 /16, IPv6 /48) und setzt `idsite` selbst. Ohne Cookies, mit Do-Not-Track.
Ohne `MATOMO_SITE_ID` und `MATOMO_TOKEN` ist alles aus (kein Schnipsel, `/stat` antwortet 404).

Absicherung (Security-Review 2026-10-17):
- `/stat` nimmt nur Parameter aus einer **Allowlist** an (`src/lib/matomo-params.ts`): Seitenaufruf, Timings,
  Events, Suche, Links, Content, Ziele, Custom Dimensions. `token_auth`, `cip`, `cid`, `uid`, `cdt`, `ua`,
  `country`/`region`/`city`/`lat`/`long`, `idsite`, `rec`, `new_visit`, `lang` und `_*` setzt nie der Browser.
- Body höchstens 16 KB (gezählt gelesen), 120 Treffer pro IP und Minute (im Speicher), `/stat` und `/stat.js`
  laufen nicht durch den Proxy (kein Puffern, kein CSP-Kopf nötig); `proxyClientMaxBodySize` 1 MB.
- **`/stat.js` ist eingecheckt** (`public/stat.js`), nicht mehr live von Matomo geholt: `matomo.js` aus dem
  offiziellen Release **5.13.0** (BSD-3, unverändert, SHA-256 `40c1b9a1c297746e02cd5614390adf6a51e9f0a024c77567a114eceb7a581895`,
  am 2026-10-17 byte-gleich mit dem, was `analytics.klatxt.de` ausliefert). Ein kompromittierter Matomo-Server
  kann so keinen Code auf inhouseticket.com ausführen. Aktualisieren nach einem Matomo-Update (optional, der
  Tracker ist abwärtskompatibel):
  `curl -fsSL https://raw.githubusercontent.com/matomo-org/matomo/<version>/matomo.js -o public/stat.js`,
  Hash und Version hier nachtragen.
- **`MATOMO_TOKEN` muss einem eigenen Benutzer nur mit Recht „Schreiben“ auf diese eine Site gehören** (Schritt 2
  unten) – nie ein Superuser-Token. Das Token wird nur serverseitig gesetzt (für `cip`), der Browser sieht es nie.
  *Len: prüfen, dass das live gesetzte Token so eingeschränkt ist.*

Einrichten in Matomo (Superuser):
1. Website anlegen: `inhouseticket.com`, Zeitzone Europe/Berlin, eigene IP ausschließen.
2. Eigenen Benutzer für den Proxy anlegen (z. B. `iht-proxy`), **kein** Superuser, Recht **Schreiben** nur auf
   diese Site; für ihn ein Token erzeugen (nur HTTPS-POST erlauben).
3. `MATOMO_SITE_ID=<id> MATOMO_TOKEN=<token> scripts/deploy.sh`.
4. Löschung nach 12 Monaten (Zusage in der Datenschutzerklärung) nur für diese Site, wie `cron-wsa-bereinigen.sh`
   (`core:delete-logs-data --idsite=<id>`), nicht über die globale Einstellung.

## Deploys

### 2026-10-06 — `21d5087`, Backups, Export, Lazy-DnD, OAuth

- OAuth-Connector (`a4df15f`) und danach `21d5087` ausgerollt; Migration 0008 beim Start.
- Neues Volume `inhouseticket-pgbackup` am Postgres-Container (Container-IDs unverändert).
- Cronjob „nightly pg_dump“ angelegt; erster Lauf scheiterte (`role "root" does not exist`, Umgebung fehlt im
  Cronjob), nach Korrektur Lauf `Complete`.


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
