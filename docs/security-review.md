# Security-Review – Sprint 9 (2026-10-05)

Geprüft: Mandantentrennung (alle Server Actions, Route-Handler, Queries, MCP-Tools), Auth (Better Auth,
Magic Link, Freemail/Beta, Superadmin), Rate-Limits, XSS/Markdown, Anhänge, HTTP-Header/CSP, Secrets,
Eingabelimits.

## Ergebnis

**Mandantentrennung: kein Leck zwischen Workspaces gefunden.** Jede Query filtert nach `workspaceId`,
zusätzlich sichern zusammengesetzte Fremdschlüssel `(id, workspace_id)` ab. Markdown erzeugt nie rohes
HTML, Anhänge werden per Magic-Bytes geprüft und mit `nosniff` + `sandbox` ausgeliefert, Tokens nur
gehasht gespeichert.

## Behoben

| Befund | Schwere | Fix |
|---|---|---|
| Entferntes Mitglied bekam beim erneuten Beitritt seine alte Rolle (z. B. Admin) und alte API-Tokens zurück | mittel | Rolle der neuen Einladung/des Beitritts gilt; Tokens werden beim Entfernen widerrufen |
| Admin konnte Admin-Einladungen des Owners widerrufen | niedrig | nur der Owner widerruft Admin-Einladungen |
| Keine CSP und keine Security-Header | mittel | Nonce-CSP pro Anfrage (`src/proxy.ts`), `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP |
| Upload-Größe per Chunked-Request ohne `Content-Length` umgehbar (Speicher des 512-MB-Containers) | mittel | Body wird gezählt gelesen und über dem Limit abgebrochen; JSON-Bodies max. 64 KB |
| `/api/auth/update-user` offen: fremde Avatar-URLs (Tracking), Namen ohne Längenlimit | mittel | Endpunkt abgeschaltet, Namen auf 100 Zeichen begrenzt, `img-src 'self'` |
| Login-Mails nur pro IP begrenzt | mittel | zusätzlich 5 Links pro Adresse / 15 min |
| Einladungsmails unbegrenzt | mittel | 100 Mails pro Workspace / Stunde |
| API ohne Limit pro Person, MCP-Batches zählten als eine Anfrage | mittel | 300 API-Anfragen/min pro Person, 30 Uploads/min; MCP zählt jede Nachricht, plus Budget pro Person |
| Upload ohne Same-Origin-Prüfung | niedrig | `requireSameOrigin()` |
| SMTP ohne TLS-Pflicht bei STARTTLS | niedrig | `requireTLS` (außer Port 465 und lokalem Mailpit) |

## Offen

- ~~**Client-IP hinter mittwald**~~ – erledigt (2026-10-05): Gefälschte `X-Forwarded-For`/`X-Real-IP` umgehen
  die Begrenzung nicht (der Proxy überschreibt), und `/admin` zeigt Len seine echte IP – die Zähler laufen also
  pro tatsächlichem Client.
- ~~**Server Actions** ohne Limit pro Person~~ – erledigt: `requireMember` begrenzt Seitenaufrufe und Server
  Actions auf 600 pro Minute und Person (gilt damit für alle heutigen und künftigen Actions).
- ~~**Anhänge löschen**~~ – entschieden (Len): Hochladende, Autor des Tickets und Admins; serverseitig erzwungen,
  der Knopf erscheint nur für Berechtigte.
- ~~**API-Tokens ohne Ablauf**~~ – entschieden (Len): Ablauf wählt die Person beim Erstellen (30/90 Tage, 1 Jahr,
  eigenes Datum bis 2 Jahre, oder ohne Ablauf; Standard 90 Tage). Abgelaufene Tokens werden abgelehnt und zählen
  nicht gegen das Limit von 10.
- Offen: keine Lese-only-Tokens; Session-Cookie-Cache 5 min (Abmelden wirkt bis zu 5 min verzögert,
  Mitgliedschaft wird trotzdem bei jeder Anfrage geprüft).

## Nachtrag 2026-10-05: OAuth für Connectors

- `@better-auth/oauth-provider`: dynamische Client-Registrierung (offen, wie von MCP vorgesehen; rate-limitiert
  durch das Plugin), Authorization Code nur mit PKCE (S256), Ressource `https://inhouseticket.com/mcp` als
  Zielgruppe – Tokens für andere Ressourcen werden am MCP-Endpunkt abgelehnt.
- Access-Tokens opak, nur als sha256-Hash gespeichert, 1 h gültig; Refresh-Tokens rotieren.
- Workspace-Bindung über die Einwilligungsseite (`oauth_workspace`); Mitgliedschaft und Sperre werden bei jedem
  MCP-Aufruf geprüft. „Trennen“ löscht Einwilligung, alle Tokens und die Workspace-Wahl sofort.
- Login-Weiterleitung prüft die Signatur der Anfrage, bevor sie zum Authorize-Endpunkt zurückleitet.

## Security-Review 2026-10-17

Geprüft (extern, alle Projekte): inhouseticket „sehr ordentlich“, 0 hoch, 2 mittel. Mandantentrennung, Passwörter
und Token-Speicherung ohne Befund, `pnpm audit` ohne hohe Befunde. Alle Befunde behoben (Freigabe Len):

| Befund | Schwere | Fix |
|---|---|---|
| Offene Weiterleitung über `next=/%09/evil.example` (Browser entfernen Tab/CR/LF, aus `/\t/` wird `//`) | mittel | `safeNext()` lehnt Steuerzeichen, Backslashes und kodierte Trenner ab, parst per `URL` und lässt nur denselben Origin zu (`src/lib/session.ts`); alle Aufrufer (Login, Set-Password, Magic Link) laufen darüber, Better Auth prüft Callback-URLs zusätzlich selbst |
| OAuth-Consent-Phishing: anonym registrierter Client „Claude“ mit fremder `redirect_uri` bekommt nach einem Klick dauerhaft MCP-Zugriff | mittel | Einwilligung zeigt den Ziel-Host groß; bekannte Ziele (claude.ai, claude.com, Loopback) normal, alle anderen „Nicht verifizierte Anwendung“ mit Pflicht-Häkchen, serverseitig erneut geprüft; `client_name` bereinigt und auf 60 Zeichen begrenzt. Registrierung bleibt offen – warnen statt sperren (ADR 004) |
| Passwort-Reset widerrief keine API-Tokens und OAuth-Verbindungen | niedrig | `onPasswordReset` widerruft alle API-Tokens und löscht OAuth-Tokens, Einwilligungen und Workspace-Wahl; neuer Knopf „Alle Verbindungen trennen“ unter Konto. Passwort *ändern* trennt bewusst nicht (beendet nur andere Sitzungen) – dafür gibt es den Knopf |
| `/stat` ohne Rate-Limit, Body erst nach dem Puffern geprüft, privilegierte Matomo-Parameter (cid, country, ua, uid …) durchgereicht | niedrig | 120 Treffer/IP/min, Body gezählt gelesen (16 KB), Allowlist statt Blockliste, `/stat` und `/stat.js` am Proxy vorbei, `proxyClientMaxBodySize` 1 MB |
| `/stat.js` lud den Tracker live vom Matomo-Server | niedrig | `public/stat.js` eingecheckt: offizielles Matomo-Release 5.13.0, byte-gleich mit dem Live-Stand (Hash in `docs/betrieb.md`) |
| OAuth akzeptierte Access-Tokens ohne `resources` (Zielgruppe) | niedrig | nur noch Tokens mit `https://…/mcp` als Ressource; Bestand per Migration 0010 nachgetragen, damit verbundene Connectors weiterlaufen. MCP-Clients senden `resource` (RFC 8707) – die E2E-Strecke bildet den claude.ai-Ablauf so nach |
| Einladungen aus dem Onboarding zählten nicht gegen das Mail-Limit; `/api/health` zeigte den vollen Commit-SHA; `page_view_daily` mit beliebig vielen Referrer-Hosts | niedrig | gemeinsames Budget `takeInviteMails()`; Health meldet `sha-<7>` (Deploy-Skript prüft dasselbe); höchstens 200 Referrer-Hosts pro Tag, Rest als ein Sammelposten |

Offen (Len):
- `MATOMO_TOKEN` live prüfen: eigener Benutzer, nur Recht „Schreiben“ auf die inhouseticket-Site, kein Superuser.
- Neue offizielle Claude-Hosts bei Bedarf in `KNOWN_REDIRECT_HOSTS` nachtragen (`src/lib/oauth-client-trust.ts`).

## Nachtrag 2026-10-18: Onboarding-Wizard (ADR 006)

- Jede Schritt-Action prüft selbst: vor dem Workspace nur `requireUser()`, danach `requireRole({ workspaceId }, "owner")`
  (Owner-Schritte, nur solange `onboarding_completed_at` leer ist) bzw. `requireMember()` (Startansicht der
  Beitretenden). Die `workspaceId` aus dem Browser wird nie ungeprüft verwendet; Nicht-Mitglieder bekommen 404.
- Der Name wird serverseitig über `auth.api.updateUser` gesetzt (Zod: 1–100 Zeichen, keine Steuerzeichen); der
  HTTP-Endpunkt `/api/auth/update-user` bleibt abgeschaltet.
- Einladungen aus Schritt 6: dieselben Regeln wie die Chips im Browser serverseitig erneut (Freemail/ungültig →
  Ablehnung), gemeinsames Mail-Budget `takeInviteMails()`, Platzlimit 100 inkl. offener Einladungen in derselben
  Transaktion wie der Abschluss (alles oder nichts).
- `onboarding_answer`: CHECK-Constraints aus denselben Konstanten wie die Zod-Enums, Freitext max. 100 Zeichen, nur
  bei „Andere“; `ON DELETE CASCADE` an Workspace und Person. Kein Wizard-Zustand im Browser-Speicher.
