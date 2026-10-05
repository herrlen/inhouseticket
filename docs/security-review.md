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

- **Client-IP hinter mittwald – teilweise geklärt (2026-10-05):** Von außen geprüft: Ein gefälschter
  `X-Forwarded-For` bzw. `X-Real-IP` umgeht die Begrenzung pro IP nicht (6. Anmeldeanfrage → 429, auch mit
  gefälschtem Header) – der Proxy überschreibt den Header. Noch offen: ob dort die echte Client-IP oder eine
  Proxy-Adresse steht (dann teilen sich alle einen Zähler). Dafür zeigt `/admin` jetzt „Erkannte IP-Adresse“;
  Len vergleicht sie einmal mit seiner echten IP.
- ~~**Server Actions** ohne Limit pro Person~~ – erledigt: `requireMember` begrenzt Seitenaufrufe und Server
  Actions auf 600 pro Minute und Person (gilt damit für alle heutigen und künftigen Actions).
- **Anhänge löschen:** jedes Mitglied darf jeden Anhang löschen (Kommentare: nur Autor oder Admin).
  Produktentscheidung offen.
- API-Tokens ohne Ablauf und ohne Lese-only-Variante; Session-Cookie-Cache 5 min (Abmelden wirkt bis zu
  5 min verzögert, Mitgliedschaft wird trotzdem bei jeder Anfrage geprüft).
