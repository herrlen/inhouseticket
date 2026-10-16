# Entwicklerregeln – inhouseticket

Gilt für Menschen und KI-Assistenten. `CLAUDE.md` enthält die harten Regeln (Mandantentrennung,
Limits, Freemail, Speed, Barrierefreiheit, Sprache) und die Definition of Done – sie werden hier
nicht wiederholt. Diese Datei regelt das **Wie**. `docs/SPRINTPLANNING.md` bestimmt Reihenfolge
und Scope, `docs/KONZEPT.md` Produkt, Design und Datenmodell.

## 1. Arbeitsweise (auch für KI-Assistenten)

1. **Prüfen, nicht annehmen.** Vor einer Änderung den Ist-Zustand lesen: Schema, Migrationen,
   vorhandene Komponenten. Next.js 16 weicht vom Trainingswissen ab → `AGENTS.md` beachten,
   Doku in `node_modules/next/dist/docs/`.
2. **Kleine Diffs.** Eine Aufgabe = ein commit-fähiger Schritt.
3. **Keine ungefragten Zusatzfeatures.** Ideen landen im Backlog von `SPRINTPLANNING.md`.
4. **Keine neue Abhängigkeit ohne Rückfrage**: was löst sie, was kostet sie (Bundle!), was wäre
   die Lösung mit Bordmitteln.
5. **Unsicherheit benennen** statt raten. Offene Punkte als `TODO(entscheidung): …`.
6. Nichts löschen oder umformatieren, was nicht zur Aufgabe gehört.

## 2. Git

- Branches: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- Conventional Commits, englisch, Imperativ, **Sprint im Scope**: `feat(s1): magic link login`.
- `main` ist immer deploybar.
- Schema-Änderungen mit Tragweite (neue Tabelle, Constraint, Trigger) bekommen einen ADR in
  `docs/adr/NNN-titel.md` mit Datum und verworfenen Alternativen.

## 3. TypeScript & Frontend

- `strict` + `noUncheckedIndexedAccess`. Kein `any` – `unknown` plus Narrowing.
  `@ts-expect-error` nur mit Begründung, nie `@ts-ignore`.
- **Server Components sind Standard.** `"use client"` nur wo Interaktion es erzwingt, so tief im
  Baum wie möglich.
- Keine Geschäftslogik in Komponenten: Komponente rendert, `lib/` rechnet, `db/queries/` holt.
- Datum/Zahlen nur über `Intl` (Locale `de-DE`, englisch `en-GB` via `intlLocale()`), nie handgebaute Strings.
- Farben, Radien, Abstände nur über Design-Tokens (CSS-Variablen / Tailwind-Theme), keine Literale.
- Nutzersichtbare Texte nicht verstreut hartcodieren: gesammelt in `src/lib/i18n/de.ts`
  (CLAUDE.md Regel 6), englisch in `src/lib/i18n/en.ts` – gleiche Schlüssel, der Typ `Messages`
  und `i18n.test.ts` erzwingen das. Deutsch ist Standard; der Umschalter DE | EN setzt das
  Cookie `lang` (Server Action, kein Redirect nach `Accept-Language`). Server-Code liest Texte mit
  `await getT()` (`@/lib/i18n/server`), Client-Komponenten mit `useT()` (`@/lib/i18n/client`);
  Englisch lädt im Browser als eigener Chunk nach. Datum/Zahl über `intlLocale(locale)`.
  Rechtstexte bleiben deutsch (mit englischem Hinweis); Zod-Meldungen bleiben deutsch und werden
  am Server-Rand mit `t.validation()` übersetzt – neue Meldung ⇒ Eintrag in `en.ts`.
- Primitives aus `src/components/ui/` zuerst prüfen, bevor etwas Neues entsteht – jedes gibt es genau einmal.
- Richtwert: Komponente ≤ 200 Zeilen, Route-Handler ≤ 120 Zeilen, sonst aufteilen.

## 4. Server & Daten

- Jede Eingabe am Rand mit **Zod** validieren: Server Actions, Route-Handler, MCP-Tools,
  Umgebungsvariablen beim Start (`src/lib/env.ts`).
- Zugriff auf Workspace-Daten nur nach `requireMember(workspaceId)`; Queries in `src/db/queries/`.
- Limits doppelt: DB-Constraint/Trigger **und** App-Validierung aus `src/lib/limits.ts`.
- Einheitliches Fehlerformat für API/MCP: `{ error: { code, message } }` – `code` stabil und
  maschinenlesbar, `message` deutsch. Clients werten nie `message` aus.
- Zeiten in der DB als `timestamptz` (UTC); Umrechnung nach `Europe/Berlin` nur in der UI.
- Migrationen nur über `pnpm db:generate` – nie Migrationsdateien von Hand nachträglich ändern,
  die bereits committet sind.

## 5. Fehlerbehandlung

- **Keine leeren `catch`-Blöcke.** Mindestens Logging (ohne personenbezogene Daten) und ein
  sichtbarer Zustand in der UI.
- Optimistic Update schlägt fehl → zurückrollen, Toast mit „Erneut versuchen“.
- Der Nutzer sieht nie einen rohen Fehlercode ohne Handlungsoption.

## 6. Barrierefreiheit – prüfbar

- Kontrast ≥ 4,5:1 für Text, ≥ 3:1 für Bedienelemente – auch bei Projekt- und Prioritätsfarben
  (farbiger Punkt + Text, nie Farbe als einziger Informationsträger).
- Sichtbarer Fokusring überall; nie `outline: none` ohne Ersatz.
- Dialoge/Slide-Over/Palette: Fokus-Falle, `Esc` schließt, Fokus kehrt zum Auslöser zurück.
- Asynchrone Änderungen (gespeichert, Fehler, verschoben) über `aria-live` melden.
- Skip-Link zum Hauptinhalt, Überschriften ohne Sprünge.
- `prefers-reduced-motion` schaltet Animationen ab (inkl. Konfetti).

## 7. Sicherheit

- Keine Secrets im Repo; `.env` ist ignoriert, `.env.example` gepflegt.
- API-/MCP-Tokens nur gehasht speichern; Klartext genau einmal anzeigen.
- Rate-Limits für Login, API und MCP – pro User **und** pro IP bzw. Token.
- Passwörter nur über Better Auth (`emailAndPassword`, eigenes Hashing verboten); Länge aus `limits.ts`
  (`MIN_PASSWORD`/`MAX_PASSWORD`). Antworten verraten nie, ob es ein Konto gibt („E-Mail-Adresse oder
  Passwort stimmt nicht“, „Falls es ein Konto gibt …“). Reset-Links nie loggen. Neue Seiten mit Nutzerdaten
  laufen über `requireUser()`/`requireMember()` – dort sitzt die Passwort-Pflicht (ADR 003).
- Nutzerinhalte (Titel, Beschreibung, Kommentare) nie per `dangerouslySetInnerHTML`; Markdown nur
  über einen Renderer mit Allowlist, Links mit `rel="noopener noreferrer"`.
- Uploads: Magic-Bytes prüfen, nicht dem MIME-Header oder der Endung vertrauen.

## 8. Tests & Gates

- **Unit (Vitest):** Limits, Freemail-Prüfung, Quick-Add-Parser, Fractional Indexing,
  Auslastungsberechnung, Magic-Byte-Prüfung, Passwort-Validierung und Passwort-Pflicht.
- **E2E (Playwright):** Happy Path je Sprint. **Ab Sprint 1 und nie übersprungen:** zwei
  Workspaces sehen ihre Daten getrennt.
- **Pre-Commit:** lint + typecheck (+ betroffene Tests). **CI:** lint, typecheck, test, build.
- Budget aus KONZEPT §7 (JS initial < 150 KB gz, LCP < 1,5 s) wird ab Sprint 9 automatisch geprüft.
