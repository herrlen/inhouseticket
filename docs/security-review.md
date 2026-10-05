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
