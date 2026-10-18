# ADR 005 – Registrierung mit Name, E-Mail und Passwort, Konto erst nach Bestätigungslink

**Datum:** 2026-10-18 · **Status:** angenommen (Len: „Name, E-Mail und Passwort, mit einem Bestätigungslink danach um sich damit zum ersten Mal anzumelden.“)

## Kontext
Bisher entstanden Konten nur über den Magic Link (ADR 003: `disableSignUp: true`). Wer neu war, sah auf
der Anmeldeseite nur „Anmeldelink per E-Mail senden“ – als Registrierung war das nicht zu erkennen. ADR 003
hatte eine Registrierung mit Passwort verworfen, weil sie eine eigene E-Mail-Bestätigung und die doppelte
Freemail-/Beta-Prüfung bräuchte. Beides liefert diese Entscheidung jetzt nach.

## Entscheidung
- **Route `/register`** (englisch wie `/login`, `/set-password`): Name, Firmen-E-Mail, Passwort + Wiederholung
  (Richtlinie aus `limits.ts`). Hinweis „Mit der Registrierung akzeptierst du die AGB … Datenschutzerklärung“
  mit Links statt Checkbox – wie beim Anlegen des Workspace (AGB/AVV), B2B, Datenschutz ist Information,
  keine Einwilligung. Die Anmeldeseite verlinkt „Noch kein Konto? Registrieren“ und nennt den Magic Link
  „Ohne Passwort per Link anmelden“.
- **Kein Konto vor der Bestätigung.** Die Server Action prüft mit Zod, Firmenadresse (Ausnahmen
  `SUPERADMIN_EMAILS`/`TESTER_EMAILS`) und Beta wie beim Anmeldelink, zählt pro IP und pro Adresse (HMAC,
  Produktion) und antwortet dann immer „Schau in dein Postfach“. Die eigentliche Arbeit läuft mit `after()`
  nach der Antwort – Inhalt und Antwortzeit verraten nicht, ob es die Adresse schon gibt:
  - neue Adresse: Passwort-Hash mit Better Auths eigenem Hasher (`ctx.password.hash`, scrypt), Zeile in
    **`pending_registration`** (Adresse klein, Name, Hash, SHA-256 des Tokens, `next`, Fehlversuche,
    `expires_at` = 24 h). Eine Zeile pro Adresse (`UNIQUE(email)`), eine neue Registrierung ersetzt die alte
    samt Link. Mail mit Link auf `/register/confirm?token=…` in der Sprache der Anfrage.
  - Adresse mit Konto: Mail „Du hast schon ein Konto“ mit Links zur Anmeldung und zu „Passwort vergessen“,
    höchstens eine je 15 Minuten.
- **Bestätigungsseite scanner-sicher:** GET zeigt nur Adresse und Passwortfeld, verbraucht und zählt nichts.
  Das Absenden verlangt **das bei der Registrierung gewählte Passwort**. Damit kann niemand eine fremde
  Adresse „vorregistrieren“ (Pre-Account-Hijacking): Wer den Link aus dem eigenen Postfach öffnet, kennt das
  Passwort des Angreifers nicht, und eine eigene Registrierung ersetzt dessen Zeile.
- **Abschluss als server-only Better-Auth-Endpunkt** (`createAuthEndpoint.serverOnly` in
  `src/lib/registration-plugin.ts`, nicht im HTTP-Router): Versuch zählen (atomar vor der Prüfung), Passwort
  mit `ctx.password.verify` prüfen, nach 5 Fehlversuchen ist der Link tot (Zeile gelöscht), Zeile einmalig
  herausnehmen, `internalAdapter.createUser` (`emailVerified: true`, Datenbank-Hooks für Firmenadresse und
  Name laufen) + `linkAccount` (Credential mit dem gespeicherten Hash), Sitzung über `createSession` +
  `setSessionCookie` (nextCookies setzt das Cookie in der Server Action). Weiter zu `next` oder `/start`
  (Einladungen, Domain-Beitritt, Onboarding wie bisher).
- Entsteht ein Konto auf anderem Weg (Magic Link), löscht ein `user.create.after`-Hook offene
  Registrierungen der Adresse. Abgelaufene Zeilen löscht der Scheduler des Servers (`instrumentation.ts`,
  alle 15 Minuten) und jede neue Registrierung.
- Better Auths eigenes `/sign-up/email` bleibt aus (`disableSignUp: true`): Es legt das Konto vor der
  Bestätigung an.

## Verworfene Alternativen
- **`/sign-up/email` mit `requireEmailVerification`:** Konto (mit Passwort des Anlegenden) existiert sofort;
  wer eine fremde Adresse zuerst registriert, besitzt das Konto, sobald das Opfer den Link klickt –
  genau das Pre-Account-Hijacking, das hier verhindert werden soll. Außerdem verrät die Antwort ohne
  Zusatzaufwand, ob es die Adresse gibt.
- **Daten in einem signierten Token im Link statt in einer Tabelle:** der Passwort-Hash stünde in der Mail,
  „nur einmal nutzbar“ und „neue Registrierung ersetzt alte“ bräuchten trotzdem Serverzustand.
- **Better Auths `verification`-Tabelle mitbenutzen:** kein Zähler für Fehlversuche, kein `UNIQUE` je
  Adresse, Wert als JSON-Blob ohne Constraints.
- **Bestätigung ohne Passwort (nur Klick):** wäre bequemer, öffnet aber das Hijacking (siehe oben).
- **Checkbox für AGB/Datenschutz:** im B2B-Kontext nicht nötig (kein Verbraucher, Datenschutz ist keine
  Einwilligung); das Anlegen des Workspace arbeitet schon mit einem Hinweistext.

## Folgen
- Neue Tabelle `pending_registration` (Migration `0011_pending_registration.sql`), Constraints für
  Kleinschreibung, Namenslänge, `next`-Länge und Versuchszahl.
- Datenschutzerklärung beschreibt Registrierung und Speicherdauer (24 Stunden, gelöscht nach Bestätigung
  oder Ablauf).
- In der geschlossenen Beta verrät „Beta geschlossen“ wie beim Anmeldelink, dass eine Adresse außerhalb der
  Beta-Domains ein Konto oder eine Einladung hat – unverändert gegenüber heute.
- Wer das Registrierungspasswort vergisst, registriert sich neu; der alte Link verfällt.
