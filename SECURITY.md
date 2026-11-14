# Sicherheit & Krypto-Policy – inhouseticket

## Sicherheitslücke melden
Bitte nicht öffentlich als Issue. Mail an **hello@inhouseticket.com** (bzw. an den Betreiber laut Impressum) mit
Beschreibung, betroffener URL und Schritten zum Nachstellen. Wir antworten innerhalb von 3 Werktagen.

## Algorithmen (verbindlich)
| Zweck | Baustein |
|---|---|
| Passwörter | Argon2id (m=19 MiB, t=2, p=1) über `src/lib/password-hash.ts`; Altbestand scrypt (Better Auth), Rehash beim Login |
| Tokens (Einladung, Registrierung, API, Login-Link, Reset, OAuth) | aus `randomBytes` (eigene: 256 Bit, `newToken()`), in der DB nur SHA-256 (`hashToken()`) |
| Symmetrische Verschlüsselung | nur durch Better Auth (OAuth-Client-Secrets, Refresh-Replay): XChaCha20-Poly1305, Envelope `$ba$<version>$…` |
| Eigene Feldverschlüsselung | keine. Kommt eine dazu: AES-256-GCM in `src/lib/crypto.ts`, Format `v1:<keyId>:<base64url(nonce ‖ ct ‖ tag)>`, AAD = `tabelle.spalte:<id>`, Schlüssel per `hkdfSync("sha256")` pro Zweck |
| Signaturen | HMAC-SHA256 (Better-Auth-Cookies); Vergleiche nur über die Bibliothek bzw. `timingSafeEqual` |
| Transport | TLS überall; HSTS 1 Jahr inkl. Subdomains; SMTP nur SMTPS/STARTTLS |

Verboten: MD5/SHA-1 für Sicherheit, ECB/CBC ohne MAC, `createCipher`, feste IVs, `Math.random` für Geheimnisse,
`crypto-js`, `===` auf Signaturen, deaktivierte Zertifikatsprüfung, eigene Krypto-Konstruktionen.

## Schlüssel & Secrets
- Produktion: nur Umgebungsvariablen im mittwald-Stack (`BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD`,
  `SMTP_PASSWORD`, `MATOMO_TOKEN`); Deploy über `scripts/deploy.sh` (gibt nichts aus).
- Nie im Repo; `.env*` ist gitignored und in `.dockerignore`, `.env.example` nur mit Platzhaltern.
- Getrennt pro Umgebung (lokal/E2E/Produktion) und pro Projekt; nie zwischen inhouseticket, emuchat, wytboard teilen.
- Sicherung: Passwortmanager, getrennt von den Datenbank-Backups; Zugriff nur Betreiber.
- `BETTER_AUTH_SECRET` (≥ 32 Byte Zufall) signiert Session-Cookies und verschlüsselt OAuth-Client-Secrets. Für
  nichts anderes verwenden.

## Rotation von `BETTER_AUTH_SECRET`
Better Auth kennt versionierte Secrets (`BETTER_AUTH_SECRETS`, erstes = aktiv). Ablauf:
1. Neues Secret erzeugen (`openssl rand -base64 32`).
2. `BETTER_AUTH_SECRETS="2:<neu>,1:<alt>"` im Stack setzen, `BETTER_AUTH_SECRET` bleibt vorerst auf dem alten Wert
   (entschlüsselt Bestände ohne Versionskennung). `scripts/deploy.sh` und `infra/mittwald-stack.yml` müssen die
   Variable dafür durchreichen.
3. Ausrollen. Sitzungen müssen sich ggf. neu anmelden; Hashes (Tokens, Passwörter) sind nicht betroffen.
4. Alte Version entfernen, sobald keine verschlüsselte Zeile sie mehr nutzt.

Bei Verdacht auf Leak: sofort rotieren, betroffene Tokens widerrufen (Konto → „Alle Verbindungen trennen“),
Vorfall dokumentieren (Art. 33 DSGVO prüfen).
