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
