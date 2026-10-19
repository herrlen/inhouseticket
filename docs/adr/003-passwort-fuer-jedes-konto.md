# ADR 003 – Jedes Konto hat ein Passwort, der Magic Link bleibt

**Datum:** 2026-10-16 · **Status:** angenommen (Len: „Jeder User im Account hat einen E-Mail-Login und ein Passwort. In den Einstellungen gibt es Passwort zurücksetzen.“)

## Kontext
Bisher gab es nur den Magic Link (KONZEPT §2.1: „kein Passwort“). Len möchte, dass sich jede Person
mit E-Mail und Passwort anmelden kann; wer per Link kommt, soll dabei ein Passwort festlegen.
Better Auth 1.7 bringt `emailAndPassword` mit (scrypt, `account.password` existiert schon) – keine
Schema-Änderung, keine neue Abhängigkeit.

## Entscheidung
- `emailAndPassword` mit `disableSignUp: true`: Konten entstehen weiter nur über den Magic Link, damit
  Freemail-Sperre, geschlossene Beta und Postfach-Bestätigung nicht umgangen werden können.
- Passwort-Pflicht serverseitig an drei Stellen: `requireUser()` (alle Seiten und Server Actions, auch
  `requireMember`/`requireSuperadmin`), `requireApiMember()` (403 `password_required`) und ein
  Before-Hook auf `/oauth2/authorize` (Connector-Login). Ausnahme nur die Seite `/set-password`.
- Länge 10–128 Zeichen aus `src/lib/limits.ts`, in Better Auth und Zod gleich.
- Zurücksetzen: Link 30 Minuten gültig, einmalig (Better Auth verbraucht das Token), Token als SHA-256
  in `verification` (`storeIdentifier`-Override für `reset-password:`). Danach enden alle Sitzungen.
  Ändern in den Einstellungen beendet alle anderen Sitzungen.
- Rate-Limits: Better Auth pro IP (Produktion; Anmeldung 3/10 s, Reset 3/min) plus pro Adresse
  (10 Anmeldungen bzw. 3 Reset-Mails je 15 Minuten) und pro Person in den Einstellungen.
- Keine Konto-Enumeration: gleiche Meldung für unbekannte Adresse, falsches Passwort und Konto ohne
  Passwort; „Passwort vergessen“ antwortet immer gleich.

## Verworfene Alternativen
- **Registrierung mit Passwort:** bräuchte eigene E-Mail-Bestätigung und doppelte Freemail-/Beta-Prüfung.
- **Weiterleitung nur im Client oder im Proxy:** Client ist umgehbar; der Proxy müsste pro Seitenaufruf
  Session und Passwortstatus aus der Datenbank lesen und deckt Server Actions/API nicht ab.
- **Passwortstatus in der Session zwischenspeichern:** spart eine indizierte Abfrage pro Anfrage, wäre
  nach dem Festlegen bis zu 5 Minuten (Cookie-Cache) veraltet.

## Folgen
- Better Auths Cookie-Cache (5 Minuten) bedeutet: Andere Geräte merken das Abmelden nach Ändern oder
  Zurücksetzen spätestens nach 5 Minuten; serverseitig ist die Sitzung sofort gelöscht.
- Datenschutzerklärung und AVV beschreiben noch „Anmeldung ohne Passwort“ – Anpassung durch Len.

## Nachtrag 2026-10-17: Konto ohne Passwort versucht es mit Passwort
- Entscheidung Len (für alle Apps): eine neutrale Meldung auf dem Bildschirm, und für ein bestehendes Konto ohne
  Passwort schickt der Server automatisch einen Anmeldelink (Mailtext erklärt, dass danach ein Passwort festgelegt
  wird). Unbekannte Adresse oder Konto mit Passwort: keine Mail. Höchstens eine Mail je Adresse und 15 Minuten.
- Umsetzung als **After-Hook auf `/sign-in/email`** in `src/lib/auth.ts`: Er sieht Better Auths eigenes Ergebnis
  (401), ändert Antwort und Status nicht und plant die Arbeit mit `after()` – Datenbankabfrage und Versand laufen
  nach der Antwort, die Antwortzeit verrät nichts. Der Link entsteht über `auth.api.signInMagicLink`, also mit
  denselben Hooks (Firmenadresse, Beta, Limit je Adresse), demselben Token-Hashing und derselben Bestätigungsseite.
  Konten entstehen hier nie.
- Verworfen: **eigener Wrapper-Endpunkt** statt `/api/auth/sign-in/email` – der offene Better-Auth-Endpunkt bliebe
  daneben erreichbar, und der Wrapper müsste Cookies und Fehlerformat nachbauen. **Mail im Client auslösen** – der
  Client kennt den Kontostatus nicht (keine Enumeration), müsste also immer senden.

## Nachtrag 2026-10-18: Registrierung mit Passwort
- Die oben verworfene „Registrierung mit Passwort“ gibt es jetzt (Len) – mit eigener Bestätigung und denselben
  Prüfungen, siehe **ADR 005**. `disableSignUp: true` bleibt: Better Auths `/sign-up/email` würde das Konto vor der
  Bestätigung anlegen.

## Nachtrag 2026-10-19: Magic Link nur für bestehende Konten
- Konten entstehen nicht mehr über den Magic Link, nur noch über die Registrierung (Len, siehe **ADR 005**, Nachtrag
  2026-10-19). Unbekannte Adressen bekommen statt eines Links einen Hinweis auf `/register`.
