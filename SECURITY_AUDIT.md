# Krypto- & Sicherheits-Audit – inhouseticket.com

Stand: 06.11.2026 · Basis `origin/main` @ `dddcbbd` · Modus: `fix` (Freigabe Len für Audit und alle Fixes)
Grundlage: OWASP ASVS 4/5, OWASP Cryptographic/Password Storage Cheat Sheets, BSI TR-02102, DSGVO Art. 32.
Hinweis: inhouseticket zieht nach emuchat um, läuft aber noch produktiv. Die Fixes sind trotzdem vollständig.

## Kurzfazit

Die eigene Krypto ist schlank und sauber: nur `node:crypto`, kein eigenes Verschlüsseln. Alle Tokens (Einladung,
Registrierung, Login-Link, Passwort-Reset, API-Token, OAuth-Access-/Refresh-Token, Authorization Code) werden nur
als SHA-256-Hash gespeichert. SMTP läuft nur mit TLS, Cookies sind `Secure`/`HttpOnly`/`SameSite=Lax`, die CSP
ist streng. Kein verbotenes Muster im Quellcode.

Lücken gab es an drei Stellen:
1. **Abhängigkeiten**: Next.js 16.3.8 mit zwei kritischen RCE-Lücken, dazu zod und body-parser (DoS, hoch).
2. **Passwörter** liefen über Better Auths scrypt mit 32 MiB, unter dem OWASP-Minimum und nicht Argon2id.
3. **HSTS fehlte**, und der nächtliche `pg_dump` liegt unverschlüsselt im Volume.

Ein Finding war „Kritisch“, eines „Hoch“. Beide sind gefixt, ebenso HSTS und Argon2id.

| Phase | Ampel | Kurz |
|---|---|---|
| 1 Transport | 🟢 | HSTS jetzt gesetzt (F-03), SMTPS/STARTTLS-Pflicht, Cookies `__Secure-`. Offen nur stack-interne Wege (Prüfen) |
| 2 Data at Rest | 🟡 | Keine K3-Daten im Klartext; `pg_dump` unverschlüsselt (F-05); K2-Inhalte bewusst Klartext (F-13) |
| 3 Passwörter | 🟢 | Argon2id mit Rehash beim Login (F-04, gefixt); Rate-Limits pro IP und Adresse, Reset 30 Min., einmalig |
| 4 Tokens/Sessions | 🟢 | CSPRNG, 256 Bit, nur Hashes; OAuth mit PKCE und Ressourcenbindung. Keine 2FA (F-09) |
| 5 Schlüssel/Secrets | 🟡 | Repo und Historie sauber (gitleaks); ein Root-Secret, Rotation nur dokumentiert (F-07) |
| 6 Verbotene Muster | 🟢 | `Math.random` nur in Konfetti/Matomo-Cache-Buster und Tests; sonst keine Fundstelle |
| 8 Basis-Checks | 🟢 | Kritische/hohe CVEs behoben (F-01, F-02); übrig nur 2 moderate in Dev-Werkzeugen (F-14) |
| 9 DSGVO | – | Textbaustein unten |

---

## Phase 0 – Inventar

**Stack:** Next.js 16 (App Router, `output: standalone`), TypeScript strict, Node 22 (Docker `node:22-alpine`),
pnpm 10, Drizzle ORM + postgres-js, Better Auth 1.7.7 (E-Mail/Passwort, Magic Link, eigenes Registrierungs-Plugin),
`@better-auth/oauth-provider` (OAuth 2.1 für claude.ai-Connectors), MCP-SDK, nodemailer.

**Datenspeicher:**
- PostgreSQL 16 als Container im mittwald-Stack (Volume `inhouseticket-pgdata`); nächtlicher `pg_dump -Fc` ins
  Volume `inhouseticket-pgbackup`; mittwald-Projektbackup täglich 04:25 (30 Tage, enthält die Volumes)
- Anhänge (≤ 100 KB, nur WebP/JPEG/PNG per Magic-Bytes) als `bytea` in Postgres (ADR 002), Auslieferung nur über
  `/api/w/[workspaceId]/attachments/[key]` mit Mitgliedschaftsprüfung, `nosniff` und `sandbox`
- Rate-Limit-Zähler im Speicher des einen App-Containers. Kein Redis, kein externer Storage.

**Externe Verbindungen:** SMTP `mail.agenturserver.de:465` (SMTPS), Matomo `analytics.klatxt.de` (HTTPS,
serverseitige Weiterleitung über `/stat`), OAuth-Clients (claude.ai/Claude Desktop) gegen `/api/auth/oauth2/*`,
MCP unter `/mcp`. Kein Shopify, kein Stripe/PayPal, keine LLM-API, keine eingehenden Webhooks.

### Datenklassifizierung

| Klasse | Objekt (Tabelle.Spalte bzw. Ort) | Schutz heute |
|---|---|---|
| K3 | `account.password` | Argon2id (nach F-04; Altbestand scrypt bis zum nächsten Login) |
| K3 | `pending_registration.password_hash` | Argon2id (Altbestand scrypt), Zeile verfällt |
| K3 | `pending_registration.token_hash`, `invitation.token_hash`, `api_token.token_hash` | SHA-256 ✓ |
| K3 | `verification.value` (Login-Link `storeToken: "hashed"`, Reset `storeIdentifier: hashed`) | SHA-256 ✓ |
| K3 | `oauth_access_token.token`, `oauth_refresh_token.token`, Authorization Codes | SHA-256 (`storeTokens.hash`) ✓ |
| K3 | `oauth_client.client_secret` (nur vertrauliche Clients) | XChaCha20-Poly1305 durch Better Auth (`storeClientSecret` = `encrypted`, Schlüssel SHA-256(Secret)) |
| K3 | `oauth_refresh_token.rotation_replay_response` | von Better Auth verschlüsselt ✓ |
| K3 | `session.token` | Klartext (Better-Auth-Standard); Cookie ist mit dem Secret signiert, siehe F-10 |
| K3 | Env: `BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD`, `SMTP_PASSWORD`, `MATOMO_TOKEN` | nur im mittwald-Stack ✓ |
| K2 | `user` (Name, E-Mail, Zeitzone), `membership`, `invitation.email`, `pending_registration` | Klartext |
| K2 | `ticket` (+ `search`), `comment`, `subtask`, `activity`, `notification`, `attachment.data` | Klartext (Volltextsuche), siehe F-13 |
| K2 | `session.ip_address/user_agent` | Klartext |
| K1 | `saved_view`, `user_pref`, `onboarding_answer`, Logs (nur IDs und Fehlernamen) | – |
| K0 | `page_view_daily` (Pfadmuster, Referrer-Host, ohne IP/Nutzer), Landing, Rechtstexte | – |

**Wo liegen Secrets:** Produktion nur als Umgebungsvariablen im mittwald-Stack (`infra/mittwald-stack.yml` mit
`${…}`-Platzhaltern). `scripts/deploy.sh` liest sie aus dem laufenden Stack, schreibt sie in eine Temp-Datei mit
Rechten 600 und löscht sie danach; nichts wird ausgegeben. Beim ersten Deploy erzeugt es `BETTER_AUTH_SECRET`
(`openssl rand -base64 32`) und `POSTGRES_PASSWORD` (`openssl rand -hex 24`). Lokal `.env` (gitignored, auch in
`.dockerignore`). `.env.example` enthält nur Platzhalter.

---

## Findings

| ID | Schwere | Phase | Datei:Zeile | Problem | Fix | Aufwand |
|---|---|---|---|---|---|---|
| F-01 | **Kritisch** | 8 | [package.json:33](package.json#L33) | `next` 16.3.8: GHSA-2464-fhr4-w9xw (RCE im Image-Optimizer mit SVG, ohne Anmeldung), GHSA-673q-mjm6-r5xr (RCE in `use cache` mit Typed Arrays), GHSA-p3m5-59mp-jv5r (DoS über Server Actions). | `next` und `eslint-config-next` auf 16.4.5. | S |
| F-02 | **Hoch** | 8 | [package.json](package.json), [pnpm-workspace.yaml](pnpm-workspace.yaml) | `zod` 4.6.5 (GHSA-mrhx-c7xc-m3w5, Speicher-DoS; zod prüft jeden API- und MCP-Body), `body-parser` 2.3.0 unter dem MCP-SDK (GHSA-27r3-jxmh-p828, DoS). Moderat: `nodemailer` 10.0.14 (Adressparser stellt an fremde Domain zu, 3 CVEs), `fast-uri`, `ip-address`, `qs`; `vite` (nur Dev-Server). | zod 4.6.7, nodemailer 10.3.1, MCP-SDK 1.32.2, Untergrenzen per `overrides` für body-parser/fast-uri/ip-address/qs/vite, vitest 5.1.0. | S |
| F-03 | Mittel | 1 | [src/lib/csp.ts:27](src/lib/csp.ts#L27) | Kein `Strict-Transport-Security`. mittwald leitet http auf https um, aber ohne HSTS lässt sich der erste Aufruf einer Sitzung herabstufen (SSL-Stripping). | `max-age=31536000; includeSubDomains` an jeder Antwort (über `SECURITY_HEADERS`), ohne `preload`. Test in `csp.test.ts`. | S |
| F-04 | Mittel | 3 | [src/lib/auth.ts:159](src/lib/auth.ts#L159) (Better-Auth-Standard `@better-auth/utils/password`: scrypt N=16384, r=16, p=1) | Passwort-Hash mit scrypt und 32 MiB, unter dem OWASP-Minimum (N=2^17, r=8 bzw. gleichwertig) und nicht der Projektstandard Argon2id. | Neues `src/lib/password-hash.ts`: Argon2id m=19 MiB, t=2, p=1 (`@node-rs/argon2`, Prebuilds, in Next.js' `serverExternalPackages`). `emailAndPassword.password: { hash, verify }`; `verify` erkennt `$argon2id$`, sonst scrypt. Rehash nach erfolgreichem Passwort-Login (After-Hook, nach der Antwort). Kein Massen-Rehash nötig. 19 MiB statt 64 MiB wegen des 512-MB-Containers. | M |
| F-05 | Mittel | 2 | [scripts/setup-db-backup.sh:15-17](scripts/setup-db-backup.sh#L15-L17) | Der nächtliche `pg_dump` liegt **unverschlüsselt** im Volume und damit auch 30 Tage im mittwald-Projektbackup. Er enthält alle K2-Daten und die Hashes. Das Image `postgres:16-alpine` hat weder `age` noch `openssl`. | `age` in den Dump-Weg bringen: eigenes Image `FROM postgres:16-alpine` + `apk add age`, Cronjob `pg_dump … -Fc \| age -r age1… > $f.age`, privater Schlüssel nur im Passwortmanager; `docs/betrieb.md` → Restore um `age -d` ergänzen. Alternativ bewusst auf das mittwald-Backup vertrauen und das begründen. **Offen**: Infrastruktur-Änderung am laufenden Datenbank-Container kurz vor dem Umzug nach emuchat; Entscheidung Len. | M |
| F-06 | Niedrig | 5 | [src/lib/rate-limit.ts:34](src/lib/rate-limit.ts#L34) | `addressKey()` nahm `BETTER_AUTH_SECRET` direkt als HMAC-Schlüssel. Dasselbe Secret signiert Session-Cookies und verschlüsselt OAuth-Client-Secrets (Schlüssel für mehrere Zwecke). | Zufallsschlüssel pro Prozess (`randomBytes(32)`); die Zähler leben ohnehin nur im Prozess. | S |
| F-07 | Niedrig | 5 | [src/lib/env.ts:14](src/lib/env.ts#L14), [scripts/deploy.sh:111-112](scripts/deploy.sh#L111-L112) | Ein Root-Secret (`BETTER_AUTH_SECRET`) für Cookies und Better-Auth-Verschlüsselung, ohne dokumentierte Rotation. Better Auth 1.7 kann versionierte Secrets (`BETTER_AUTH_SECRETS="2:neu,1:alt"`, Envelope `$ba$<version>$…`, altes Secret entschlüsselt weiter), `deploy.sh` reicht aber nur `BETTER_AUTH_SECRET` durch. | Ablauf in `SECURITY.md` dokumentiert. Durchreichen von `BETTER_AUTH_SECRETS` erst bei einer echten Rotation einbauen (leere Variable im Stack wäre riskant). Eigene Feldverschlüsselung gibt es nicht, ein zentrales `crypto.ts` ist deshalb nicht nötig (siehe unten). | S |
| F-08 | Prüfen | 1 | [infra/mittwald-stack.yml:24-25](infra/mittwald-stack.yml#L24-L25), `DATABASE_URL` Zeile 36 | `postgres` veröffentlicht `5432:5432/tcp`. Ob der Port nur im Projektnetz oder auch von außen erreichbar ist, geht aus dem Repo nicht hervor. App ↔ Postgres spricht ohne TLS (`postgres://` im Stack-Netz). | Von außen testen (`nc -vz <host> 5432`). Ist er nur im Projektnetz: dokumentieren. Wird er nicht gebraucht: `ports` entfernen (vorher prüfen, ob die App den Dienst dann noch per Name erreicht). | S |
| F-09 | Prüfen | 3/4 | [src/lib/superadmin.ts](src/lib/superadmin.ts), `/admin` | Keine Zwei-Faktor-Anmeldung, auch nicht für Superadmins (`/admin`, workspace-übergreifende Kennzahlen, Sperren von Workspaces). Passwort-Login ist pro IP und Adresse begrenzt. | Bei Weiterbetrieb TOTP-2FA wie in emuchat (ADR 001 dort), mindestens für `SUPERADMIN_EMAILS`. **Offen**: neues Feature, nicht im Scope eines Krypto-Fixes; emuchat hat 2FA. | M |
| F-10 | Niedrig | 4 | Tabelle `session.token` (Better Auth) | Session-Tokens liegen im Klartext in der DB und damit im Dump. Ein Dump allein reicht nicht zur Übernahme: das Cookie trägt `token.HMAC(BETTER_AUTH_SECRET)`, die Signatur wird geprüft. | Akzeptiert (Better-Auth-Standard). Mit F-05 (verschlüsselter Dump) erledigt sich der Rest. | – |
| F-11 | Niedrig | 3/4 | Better Auth `generateId(24)` (Reset), `generateRandomString(32)` (Magic Link) | Reset-Token rund 143 Bit, Login-Link rund 182 Bit; der Standard nennt 256 Bit als „besser“. ≥ 128 Bit ist erfüllt; beide gehasht, einmalig, 30 bzw. 15 Min., rate-limitiert. | Akzeptiert und dokumentiert. | – |
| F-12 | Niedrig | 1 | [src/lib/auth.ts:147](src/lib/auth.ts#L147) (`crossSubDomainCookies`) | Das Session-Cookie gilt für `Domain=inhouseticket.com`, also für jede Subdomain. Ein `__Host-`-Präfix ist damit nicht möglich. | Akzeptiert (Landing erkennt Angemeldete). Bedingung: keine fremd betriebenen oder unsicheren Subdomains unter inhouseticket.com. | – |
| F-13 | Prüfen | 2 | `ticket`, `comment`, `attachment.data` | K2-Inhalte (Tickets, Kommentare, Anhänge) liegen im Klartext. Begründung: `tsvector`-Volltextsuche (`src/db/queries/search.ts`), MCP und Export brauchen Klartext; Feldverschlüsselung würde die Suche brechen. | Bewusst so lassen und im TOM-Text ehrlich nennen; Restrisiko Hoster-Backups über F-05 verringern. | – |
| F-14 | Niedrig | 8 | `drizzle-kit` → `esbuild` 0.18.20, `eslint-config-next` → `minimatch` 10.2.6 | 2 moderate CVEs in Dev-Werkzeugen (esbuild-Dev-Server, ReDoS in Globs). Nicht im Produktions-Image. | Offen, bis die Eltern-Pakete nachziehen (Fix nur über Major-Sprung). | S |
| F-15 | Prüfen | 5 | Git-Historie (124 Commits, alle Branches) | gitleaks 1 Treffer: `generic-api-key` in `e2e/register.spec.ts:137` (Commit `58a6cd2`), Wert `***`. Das ist ein E2E-Testpasswort gegen den lokalen Dev-Server, kein Produktionsgeheimnis. | Kein Handlungsbedarf, keine Rotation nötig. | – |
| F-16 | Prüfen | 5/8 | mStudio, GitHub | Aus dem Repo nicht prüfbar: 2FA für alle mStudio- und GitHub-Zugänge, SSH nur per Key, Sicherung von `BETTER_AUTH_SECRET` im Passwortmanager mit klarer Zugriffsliste, `MATOMO_TOKEN` nur mit Schreibrecht auf die eigene Site. | Im mStudio/GitHub prüfen; Notfall-Abschnitt in `docs/betrieb.md` (wo liegt das Secret, wer hat Zugriff). | S |

### Bestätigte Positiva (keine Aktion)
- Zufall nur aus `randomBytes`/`randomUUID`; alle eigenen Tokens 256 Bit (`newToken()`, `iht_`-API-Tokens).
- Alle Tokens nur als SHA-256 gespeichert; API-Token einmal angezeigt, Ablauf wählbar, Widerruf sofort wirksam.
- Login-Link- und Reset-Tokens gehasht (`storeToken: "hashed"`, `storeIdentifier` für `reset-password:`).
- OAuth 2.1: PKCE Pflicht, opake Access-Tokens (1 h) nur als Hash, Refresh-Tokens rotieren, Ressource `…/mcp`
  wird geprüft; Passwort-Reset trennt alle Verbindungen und widerruft API-Tokens.
- Rate-Limits pro IP (Better Auth) und pro Adresse (Login, Link, Reset, Registrierung); Antworten verraten nicht,
  ob eine Adresse existiert (auch nicht über die Laufzeit, Mails nach der Antwort).
- SMTP: Port 465 implizit TLS, sonst `requireTLS` außer localhost. Keine `rejectUnauthorized: false`.
- Header: Nonce-CSP (`frame-ancestors 'none'`, `object-src 'none'`, `upgrade-insecure-requests`), `nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, Permissions-Policy, COOP; jetzt auch HSTS.
- Cookies: über https `__Secure-`-Präfix, `HttpOnly`, `SameSite=Lax`; neue Session bei jedem Login, Logout und
  Reset löschen serverseitig (Cookie-Cache 5 Min., in `docs/security-review.md` dokumentiert).
- Logs: nur IDs und Fehlernamen, nie Adressen, Links oder Tokens.
- `/api/health` zeigt nur `sha-<7>`; `NODE_ENV=production`, keine Stacktraces nach außen.

### Warum kein zentrales `crypto.ts` (Phase 7)
inhouseticket speichert keine K3-Daten umkehrbar verschlüsselt, die der eigene Code schreibt: Passwörter sind
Hashes, alle Tokens sind Hashes, einzig `oauth_client.client_secret` und die Refresh-Replay-Antwort verschlüsselt
Better Auth selbst (XChaCha20-Poly1305, versionierbar über `BETTER_AUTH_SECRETS`). Ein eigenes `encrypt/decrypt`
mit `v1:<keyId>:`-Format hätte keinen Aufrufer. Die vorhandenen Bausteine decken die Standard-API ab:
`newToken()`/`hashToken()` in `src/lib/tokens.ts`, `hashPassword()`/`verifyPassword()` in `src/lib/password-hash.ts`.
Kommt doch ein Fremd-Token dazu, gehört es nach Phase 2/7 in ein neues `src/lib/crypto.ts`.

---

## Priorisierte Fix-Reihenfolge

1. **F-01** Next.js 16.4.5 ⚡ Quick Win, kritisch
2. **F-02** zod, nodemailer, MCP-SDK-Abhängigkeiten ⚡ Quick Win
3. **F-03** HSTS ⚡ Quick Win
4. **F-04** Argon2id mit Rehash beim Login
5. **F-06** Rate-Limit-Schlüssel getrennt vom Root-Secret ⚡ Quick Win
6. **F-05** `pg_dump` mit `age` verschlüsseln (Infrastruktur, Entscheidung Len)
7. **F-08/F-16** Prüfungen außerhalb des Codes (Port 5432, mStudio, GitHub)
8. **F-07, F-09** Rotation einbauen bzw. 2FA, falls inhouseticket länger läuft als geplant

---

## TOM-Textbaustein „Technische Maßnahmen Verschlüsselung“ (Art. 32 DSGVO)

> Stand nach diesem Audit. Der mit * markierte Satz gilt erst nach Umsetzung von F-05.

**Transport.** Alle Verbindungen zwischen Browser bzw. angebundenen Anwendungen (z. B. Claude-Connectors) und
inhouseticket laufen ausschließlich über HTTPS mit TLS. HTTP Strict Transport Security (1 Jahr, inkl. Subdomains)
ist aktiv. Sitzungs-Cookies sind nur über HTTPS übertragbar, für Skripte nicht lesbar und gegen seitenübergreifende
Anfragen geschützt. E-Mails (Anmelde- und Einladungslinks) versendet inhouseticket nur über TLS-verschlüsselte
SMTP-Verbindungen. Anfragen an externe Dienste erfolgen über HTTPS mit Zertifikatsprüfung.

**Speicherung.** Die Daten liegen in Rechenzentren in Deutschland (mittwald). Zugangs-Tokens (API-Schlüssel,
Einladungs-, Registrierungs- und Anmeldelinks, Links zum Zurücksetzen des Passworts, OAuth-Zugriffs- und
Erneuerungstokens) werden nur als kryptografischer Hash gespeichert. Geheimnisse angebundener OAuth-Anwendungen
werden auf Anwendungsebene mit XChaCha20-Poly1305 verschlüsselt. Datenbanksicherungen werden verschlüsselt
abgelegt*. Ticket-, Kommentar- und Anhangsinhalte werden für die Volltextsuche unverschlüsselt in der Datenbank
gespeichert und sind durch Zugriffskontrolle, Mandantentrennung und die Sicherheitsmaßnahmen des Rechenzentrums
geschützt.

**Passwörter.** Passwörter werden ausschließlich mit der speicherharten Hashfunktion Argon2id und individuellem
Salt gespeichert, nie im Klartext oder umkehrbar; ältere Hashes (scrypt) werden bei der nächsten Anmeldung
ersetzt. Anmeldeversuche, Anmeldelinks, Registrierungen und Passwort-Zurücksetzungen sind pro Adresse und pro IP
begrenzt. Links zum Zurücksetzen gelten 30 Minuten und nur einmal; danach werden alle Sitzungen, API-Schlüssel und
Verbindungen beendet.

**Schlüsselverwaltung.** Schlüssel und Zugangsdaten liegen nicht im Quellcode, sondern nur als geschützte
Umgebungsvariablen der Produktionsumgebung. Sie werden mit einem kryptografisch sicheren Zufallsgenerator erzeugt
und sind pro Umgebung und Projekt getrennt. Ein Schlüsselwechsel ist über versionierte Schlüssel möglich, ohne dass
verschlüsselte Daten verloren gehen. Eine Sicherung der Schlüssel liegt getrennt von den Datensicherungen in einem
Passwortmanager mit beschränktem Zugriff.

---

## Umsetzung (Branch `security/krypto-audit`, 06.11.2026)

| Finding | Status | Commit |
|---|---|---|
| F-01 Next.js 16.4.5 | gefixt | `e43edec` |
| F-02 zod, nodemailer, MCP-SDK, body-parser, fast-uri, ip-address, qs, vite | gefixt | `1aae696` |
| F-03 HSTS | gefixt | `cd3f6dc` |
| F-04 Argon2id + Rehash beim Login | gefixt | `0031109` |
| F-06 Rate-Limit-Schlüssel ohne Root-Secret | gefixt | `3695224` |
| F-07 Rotation `BETTER_AUTH_SECRET` | dokumentiert in `SECURITY.md`; Durchreichen im Deploy erst bei Bedarf | dieser Commit |
| F-05 `pg_dump` verschlüsseln | offen – Infrastruktur (eigenes Postgres-Image mit `age`), Entscheidung Len | – |
| F-08 Port 5432 / DB ohne TLS im Stack-Netz | offen – nur im mStudio prüfbar | – |
| F-09 2FA | offen – neues Feature; emuchat hat 2FA | – |
| F-10, F-11, F-12, F-13 | akzeptiert, begründet | – |
| F-14 esbuild/minimatch (Dev) | offen – kein Fix im Versionsbereich | – |
| F-15 gitleaks-Treffer | kein Handlungsbedarf (Testpasswort) | – |
| F-16 mStudio/GitHub | offen – Len | – |

**Prüfung (lokal, Windows):** `pnpm lint` ✓, `pnpm typecheck` ✓, `pnpm test` ✓ (54 Dateien),
`test:db` gegen lokales Postgres 16 ✓ (15 Dateien, 86 Tests; der erste Lauf auf frischer DB scheiterte einmal an
einem parallelen Insert von `oauth_resource` – bekannter Seed-Wettlauf, unabhängig von diesen Änderungen),
Playwright `password.spec.ts` + `register.spec.ts` ✓ (13 Tests). Rehash von Hand geprüft: scrypt-Hash gesetzt,
Passwort-Login → `$argon2id$v=19$m=19456,t=2,p=1$…`, zweiter Login klappt. `docker build` ✓, im Image lädt
`@node-rs/argon2` (musl-Prebuild) und hasht. Die volle E2E-Suite lief nicht lokal (CI).
`pnpm audit`: 2 moderate (nur Dev-Werkzeuge, F-14), vorher 2 kritisch, 4 hoch, 13 moderat, 3 niedrig.
