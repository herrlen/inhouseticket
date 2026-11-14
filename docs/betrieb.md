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
| `app.inhouseticket.com` | Container `app`, `3000/tcp` – die App (`APP_URL`) |
| `inhouseticket.com` | Container `app`, `3000/tcp` – Landingpage und Rechtstexte (`SITE_URL`) |
| `www.inhouseticket.com` | 301 → `https://inhouseticket.com/` |

**Zwei Hosts, ein Container (2026-10-24, `src/lib/hosts.ts`):** Auf `inhouseticket.com` beantwortet die App
nur `/`, `/umziehen`, die Rechtstexte, robots/sitemap, Icons, `/landing/*`, `/opengraph-image`, `/stat` und
`/.well-known/*`; alle anderen Seiten und `GET /api/auth/*` leiten per 301 (andere Methoden 308) auf
`app.inhouseticket.com` weiter. `/mcp` und API-Aufrufe ohne GET bleiben auf beiden Hosts erreichbar, damit
Connectors mit der alten Adresse weiterlaufen (Tokens für `https://inhouseticket.com/mcp` gelten weiter).
Sitzungs-, Sprach- und Opt-out-Cookie tragen `Domain=inhouseticket.com` (gilt für beide Hosts).
| `p-flw0r0.project.space` | Standardseite |

TLS: Let's Encrypt über mittwald, automatisch.

## Geheimnisse

Nur in der Stack-Konfiguration bei mittwald, keine lokale Kopie: `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`
(beim ersten Deploy erzeugt), `SMTP_PASSWORD` (setzt Len mit `scripts/set-smtp-password.sh`), `MATOMO_TOKEN`,
`INTEGRATION_SECRET` (Schlüssel für die gespeicherten Integrations-Tokens, ADR 008).
`scripts/deploy.sh` liest sie aus dem laufenden Stack und gibt sie nie aus.

`INTEGRATION_SECRET` erzeugt `scripts/deploy.sh` einmalig, wenn der Stack noch keinen hat, und übernimmt ihn danach
immer. **Nie ändern:** Mit einem neuen Wert sind alle gespeicherten ClickUp-Tokens unlesbar – jede Verbindung zeigt
dann einen Fehler und braucht einen neuen Token. Ohne den Wert zeigt „Integrationen“ nur „nicht eingerichtet“.

## Integrationen (ClickUp)

Lesender Abgleich, Einrichtung unter Einstellungen → Integrationen (nur Admins). Der Abgleich läuft im App-Container
(`src/instrumentation.ts` → `startIntegrationPolling()`): jede Minute werden fällige Verbindungen abgearbeitet, je
Verbindung alle 5 Minuten bzw. sofort nach „Jetzt abgleichen“. Ein Lease (`integration.locked_until`) sorgt dafür, dass
pro Verbindung nur ein Lauf gleichzeitig läuft – auch bei mehreren Containern. Ein abgebrochener Lauf (Neustart) wird
beim nächsten Mal an seiner Seite fortgesetzt (`sync_run.cursor`). Kommentare holt jeder Lauf höchstens 4 Minuten lang
(ein Aufruf pro Aufgabe), der Rest folgt in den nächsten Läufen. Logs enthalten nur IDs und Fehlercodes:
`mw container logs -p p-flw0r0 app | grep "integration sync"`.

### Echtzeit (ClickUp-Webhooks, ADR 008 Nachtrag)

Nur in Produktion mit `APP_URL` auf https (keine neue Variable, kein neuer Schlüssel – das Webhook-Geheimnis liegt
mit `INTEGRATION_SECRET` versiegelt in `integration.webhook`). Nach der Einrichtung, nach „Auswahl ändern“ und
„Token ersetzen“ registriert die App einen Webhook je Verbindung bei ClickUp; „Trennen“ entfernt ihn dort. Endpunkt:
`POST https://app.inhouseticket.com/api/integrations/clickup/webhook/<integration-id>` (ohne Sitzung, nur mit
gültiger Signatur `X-Signature`; muss von außen erreichbar sein – keine IP-Sperre davor, ClickUp hat keine festen
Absender-IPs). Solange der Webhook gesund ist, läuft das Polling nur noch alle 30 Minuten als Sicherheitsnetz.

- **Zustand ansehen:** Einstellungen → Integrationen → ClickUp zeigt „Echtzeit: aktiv“ bzw. „… – Polling alle 5 Min.“
  und „Letztes Ereignis“. In der Datenbank:
  `select id, webhook_status, webhook_event_at, webhook_checked_at, last_sync_at from integration;` und die
  Warteschlange `select integration_id, count(*) from integration_event group by 1;` (sollte fast immer leer sein).
- **Gesundheit:** Nach jedem geplanten Lauf fragt die App `GET /team/{id}/webhook` ab. ClickUp meldet `failing`
  (Antwort kein 2xx oder > 7 s; jedes Ereignis wird 5-mal versucht, dann verworfen) → Status `failing`, Polling wieder
  alle 5 Minuten. `suspended` (100 Fehlschläge oder einmal 401/410), gelöscht oder andere Adresse → die App
  registriert neu. Schlägt die Registrierung fehl (`failed`), versucht der Poller es stündlich erneut.
- **Was bei Ausfall passiert:** nichts geht verloren, was das Polling sieht – Änderungen kommen spätestens mit dem
  nächsten Abgleich. Nur Löschungen sieht allein der Webhook (Label „In ClickUp gelöscht“, das Ticket bleibt).
- **Ereignisse:** werden in `integration_event` eingereiht (eine Zeile je Aufgabe und Art) und unter dem Lease der
  Verbindung abgearbeitet – nie parallel zu einem Abgleich; was wartet, holt der Poller jede Minute nach. Mehr als
  600 Ereignisse pro Minute oder 5 000 offene Zeilen werden zu einem Delta-Abgleich zusammengefasst.
- **Logs:** `mw container logs -p p-flw0r0 app | grep "integration webhook"`.
- **Adresse geändert** (`APP_URL`): der nächste geplante Lauf registriert den Webhook mit der neuen Adresse.

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

Migrationen laufen beim Start des App-Containers. Prüfung: `https://app.inhouseticket.com/api/health` meldet
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
  (z. B. UptimeRobot oder Better Stack, Check auf `https://app.inhouseticket.com/api/health`, Schlüsselwort `"ok"`).
- **E-Mail-Authentifizierung:** SPF (`include:agenturserver.de`), DKIM von mittwald (Selektoren `agenturserver`,
  `agenturserver2048`), DMARC seit 2026-10-07 `p=none` mit Berichten an hello@ (Zone `_dmarc` per API angelegt).
  Nach einigen Wochen ohne Auffälligkeiten auf `p=quarantine` anheben.
- **Restore-Probe** 2026-10-07: Dump von 03:30 in eine temporäre Datenbank im Postgres-Container zurückgespielt,
  30 Tabellen, Zeilenzahlen wie live (bis auf ein später angelegtes Ticket); Probe-Datenbank danach gelöscht.

## Matomo

Reichweite und Funnel – öffentliche Seiten, Anmeldung/Registrierung und App (seit 2026-10-18) – zusätzlich
zur eigenen Zählung in `/admin`. Matomo läuft unter `analytics.klatxt.de` (Projekt `p-mdg6ae`, wie bei
websecureaudit). Der Browser spricht nur mit `/stat` und `/stat.js` auf inhouseticket.com; `src/lib/matomo.ts`
reicht weiter, kürzt die IP vorher (IPv4 /16, IPv6 /48) und setzt `idsite` selbst. Ohne Cookies, ohne Auslesen von
Geräteinformationen, mit Do-Not-Track, Global Privacy Control und Widerspruchs-Schalter (unten).
Ohne `MATOMO_SITE_ID` und `MATOMO_TOKEN` ist alles aus (kein Schnipsel, `/stat` antwortet 404).

Kein Cookie-Banner (2026-10-18, *Entwurf, anwaltlich prüfen*): Es gibt nur technisch notwendige Cookies
(§ 25 Abs. 2 Nr. 2 TDDDG), keinen Local/Session Storage, kein IndexedDB und keine Anfragen an fremde Hosts; Matomo
speichert und liest nichts auf dem Gerät und läuft auf berechtigtem Interesse mit Widerspruch. Festgehalten und
geprüft von `e2e/storage-inventory.spec.ts` (öffentliche Seiten, Anmeldung, App, Einstellungen, OAuth-Zustimmung,
anonym und angemeldet) – ein neues Cookie oder ein neuer Speicherschlüssel lässt den Test scheitern, bis er in
`ALLOWED_COOKIES` und in der Tabelle in `/datenschutz` (Abschnitt 7) steht. Stand der Inventur:

| Cookie | Zweck | Dauer | HttpOnly |
|---|---|---|---|
| `better-auth.session_token` (live `__Secure-…`) | Sitzung | 30 Tage, gleitend | ja |
| `better-auth.session_data` (live `__Secure-…`) | Sitzungs-Cache | 5 Min. | ja |
| `better-auth.session_token.oauth_logout_confirmation` | nur bei Abmeldung über eine verbundene App | 5 Min. | ja |
| `lang` | Sprache, nur nach Klick auf DE/EN | 1 Jahr | ja |
| `iht_optout` | Widerspruch gegen die Messung, nur nach Klick | 1 Jahr | nein (Tracker prüft es) |

Im Dev-Server legt Next.js eine IndexedDB `__next_debug_channel` an (Dev-Tools, nicht im Production-Build).

Widerspruch (`src/lib/optout.ts`): Schalter „Messung auf diesem Gerät deaktivieren/aktivieren“ in `/datenschutz`
(`src/components/measurement-toggle.tsx`, Server Action `src/app/actions/measurement.ts`, funktioniert ohne JS) setzt
bzw. löscht `iht_optout=1`. Mit dem Cookie, `DNT: 1` oder `Sec-GPC: 1`: kein Schnipsel im Root-Layout, der Bootstrap
bricht im Browser ab (auch bei `navigator.globalPrivacyControl`), `trackPage`/`trackEvent` sind No-ops, `/stat`
antwortet 204 und leitet nichts weiter, `trackServerEvent()` sendet nichts. Mit dem Cookie zählt auch die eigene
Seitenaufruf-Zählung (`src/proxy.ts`) nicht.

Was gemessen wird (Funnel, 2026-10-18):
- **Ein Tracker für alles**: `src/components/matomo-tracker.tsx` im Root-Layout (Inline-Bootstrap mit Nonce, lädt
  `/stat.js`), Seitenaufrufe aus `src/components/analytics-tracker.tsx` bei jedem Routenwechsel (auch reine
  Query-Wechsel wie Liste/Board oder geöffnetes Ticket). Zentrale Client-Funktionen: `src/lib/analytics.ts`
  (`initMatomo`, `trackPage`, `trackEvent`). `disableCookies`, `disableBrowserFeatureDetection` (keine Auflösung,
  Plugins, Client Hints), `disablePerformanceTracking`; kein `enableLinkTracking` (Links in Tickets könnten fremde
  URLs mit Tokens enthalten), kein Heartbeat, kein `setCookieDomain`.
- **URLs normalisiert** (`src/lib/analytics-url.ts`): Workspace-Slug, Projekt-Key, Ticket-Key, Token, IDs → `:id`
  (`/acme/p/MKT?t=MKT-12` → `/:id/p/:id`). Query nur `view=board` (Projektseite) und `utm_*` (nur öffentliche
  Seiten, nur einfache Werte); alles andere – `q`, `token`, `email`, `next`, `code` … – fällt weg. Titel generisch:
  `inhouseticket.com/Liste`, `…/Board`, `…/Ticket Detail`, `…/Dashboard`, `…/Einstellungen/Mitglieder` usw.
- **Ereignisse** (Kategorie/Aktion/Name): `Marketing/CTA Click/<header|hero|bottom|umziehen>` (Links mit
  `data-cta`), `Account/Signup completed`, `Account/Login/password`, `Workspace/Created`*,
  `Team/Member invited/<settings|onboarding>` (Wert = Anzahl, Onboarding*), `Ticket/Created`,
  `Ticket/Status changed/<open|active|done>`, `View/Kanban`, `View/List`, `Integration/MCP connected/<oauth*|token>`.
  \* = vom Server gesendet (`trackServerEvent()` in `src/lib/matomo.ts`, Server Action endet in einem Redirect):
  gleiche Allowlist, IP gekürzt, `DNT: 1` respektiert; Matomo zählt diese Treffer als eigenen Besuch.
  Magic-Link-Login wird nicht gezählt (Erfolg im Browser nicht erkennbar), API- und MCP-Aufrufe nie.

Absicherung (Security-Review 2026-10-17):
- `/stat` nimmt nur Parameter aus einer **Allowlist** an (`src/lib/matomo-params.ts`): Seitenaufruf, Events,
  Suche, Links, Content, Ziele, Custom Dimensions. Was vom Gerät stammt (`res`, `cookie`, `uadata`, Plugin-Flags,
  Ortszeit `h`/`m`/`s`, Timings `pf_*`/`gt_ms`) und `ping` fällt seit 2026-10-18 auch serverseitig weg. `token_auth`, `cip`, `cid`, `uid`, `cdt`, `ua`,
  `country`/`region`/`city`/`lat`/`long`, `idsite`, `rec`, `new_visit`, `lang` und `_*` setzt nie der Browser.
- Body höchstens 16 KB (gezählt gelesen), 120 Treffer pro IP und Minute (im Speicher), `/stat` und `/stat.js`
  laufen nicht durch den Proxy (kein Puffern, kein CSP-Kopf nötig); `proxyClientMaxBodySize` 1 MB.
- **`/stat.js` ist eingecheckt** (`public/stat.js`), nicht mehr live von Matomo geholt: `matomo.js` aus dem
  offiziellen Release **5.14.1** (BSD-3, unverändert, SHA-256 `cf75a64173bf9134e5013b1d6c5e00a63c5d5239cc952e3a0a99529facd0b344`,
  am 2026-10-17 byte-gleich mit dem, was `analytics.klatxt.de` ausliefert). Ein kompromittierter Matomo-Server
  kann so keinen Code auf inhouseticket.com ausführen. Aktualisieren nach einem Matomo-Update (optional, der
  Tracker ist abwärtskompatibel):
  `curl -fsSL https://raw.githubusercontent.com/matomo-org/matomo/<version>/matomo.js -o public/stat.js`,
  Hash und Version hier nachtragen.
- **`MATOMO_TOKEN` muss einem eigenen Benutzer nur mit Recht „Schreiben“ auf diese eine Site gehören** (Schritt 2
  unten) – nie ein Superuser-Token. Das Token wird nur serverseitig gesetzt (für `cip`), der Browser sieht es nie.
  *Len: prüfen, dass das live gesetzte Token so eingeschränkt ist.*

Einrichten in Matomo (Superuser):
1. Website anlegen: `inhouseticket.com` (Alias-URL `app.inhouseticket.com`), Zeitzone Europe/Berlin, eigene IP ausschließen.
2. Eigenen Benutzer für den Proxy anlegen (z. B. `iht-proxy`), **kein** Superuser, Recht **Schreiben** nur auf
   diese Site; für ihn ein Token erzeugen (nur HTTPS-POST erlauben).
3. `MATOMO_SITE_ID=<id> MATOMO_TOKEN=<token> scripts/deploy.sh`.
4. Löschung nach 12 Monaten (Zusage in der Datenschutzerklärung) nur für diese Site, wie `cron-wsa-bereinigen.sh`
   (`core:delete-logs-data --idsite=<id>`), nicht über die globale Einstellung.

## Suchmaschinen

- `X-Robots-Tag: noindex, nofollow` auf allem außer `/`, `/umziehen`, `/impressum`, `/datenschutz`, `/agb`, `/avv`
  und statischen Dateien: Seiten über `src/proxy.ts` (`needsNoindex()` in `src/lib/indexing.ts`), `/api/*` und
  `/mcp` über `next.config.ts` (laufen nicht durch den Proxy). Zusätzlich `<meta name="robots" content="noindex, nofollow">`
  in den Layouts von Auth, Workspace und `/admin`.
- `robots.txt` sperrt nach dem Launch (`SITE_INDEXABLE=true`) nichts mehr – Google muss die Seiten abrufen dürfen,
  um das `noindex` zu sehen. Nur der `Sitemap:`-Verweis bleibt; die Sitemap enthält nur die öffentlichen Seiten.
- Canonicals (`https://inhouseticket.com/…` über `APP_URL`) auf allen öffentlichen Seiten.
- `www.inhouseticket.com` → `inhouseticket.com` (301) macht der mittwald-vHost, nicht die App.

Prüfen nach einem Deploy:

```bash
curl -sI https://app.inhouseticket.com/login | grep -i x-robots-tag    # noindex, nofollow
curl -sI https://inhouseticket.com/login | grep -i -E "^(HTTP|location)" # 301 → https://app.inhouseticket.com/login
curl -sI https://app.inhouseticket.com/api/health | grep -i x-robots-tag # noindex, nofollow
curl -sI https://inhouseticket.com/ | grep -i x-robots-tag             # (leer)
curl -s https://inhouseticket.com/robots.txt                           # Allow: / + Sitemap
curl -s https://inhouseticket.com/sitemap.xml                          # nur öffentliche Seiten
curl -sI https://www.inhouseticket.com/ | grep -i -E "^(HTTP|location)" # 301 → https://inhouseticket.com/
dig +short TXT inhouseticket.com                                       # Search-Console-Verifizierung
```

## Deploys

### 2026-11-14 — Weiterleitung auf emuchat entfernt, `3ab9519` (Export v2 #5, Ticket-Hierarchie #7)

- Vom 10.11. bis 14.11.2026 leiteten alle vHosts per 301 auf emuchat weiter (`inhouseticket.com` →
  `emuchat.de/funktionen/tickets`, `app.` → `app.emuchat.de`). Entfernt, weil inhouseticket eigenständig
  bleibt (Konzept „Shared Core“, Self-Hosting). Daten aus der Zeit liegen nur in emuchat.
- Sicherung `cron-iqf97w` vorher (Complete). vHosts `inhouseticket.com` und `app.` wieder auf Container `app`
  (`928394b5-…`, `3000/tcp`), `www` → 301 `https://inhouseticket.com/`.
- Dann `scripts/deploy.sh` (unter Windows aus Git Bash, `jq` per `winget install jqlang.jq`); Migrationen
  0014/0015 (Hierarchie) beim Start. Container-ID unverändert.
- Direkt nach dem Start kurz 500 auf `/` und `/login`, nach wenigen Sekunden weg.
- Prüfung: `/api/health` ok (`sha-3ab9519`), `/`, `/login`, Rechtstexte 200, `inhouseticket.com/login` → 301
  auf `app.`, `www` → 301, `X-Robots-Tag` auf `/login`. Health-Cronjob `cron-nqnfmb` läuft wieder grün.

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
