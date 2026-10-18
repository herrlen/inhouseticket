# ADR 006 – Onboarding-Wizard: Route, Fortsetzbarkeit, Backfill, Auto-Join vorausgewählt

**Datum:** 2026-10-18 · **Status:** angenommen (Spezifikation `docs/ONBOARDING.md`, Empfehlungen aus Abschnitt 6 übernommen)

## Kontext
Bisher legte eine einzige Seite (`src/app/(auth)/onboarding`) Workspace, Farbe, Beispielprojekt (Marketing · IT ·
Allgemein, 3 Tickets) und Einladungen in einem Formular an. `docs/ONBOARDING.md` ersetzt das durch einen Wizard:
eine Frage pro Screen, jeder Schritt speichert sofort, fortsetzbar nach Reload, eigener Kurz-Wizard für
Beitretende, Projekt aus einer von 8 Vorlagen mit Tutorial-Tickets.

## Entscheidung
- **Route `src/app/(app)/onboarding/`** (URL bleibt `/onboarding`, alle bisherigen Weiterleitungen gelten). Die
  Seite rendert eine ruhige, `inert` und `aria-hidden` geschaltete App-Kulisse (Seitenleiste, Kopfzeile, Spalten)
  und darüber die Wizard-Karte als `role="dialog"`. Die echte App-Shell (`[workspace]/layout.tsx`) kommt nicht
  in Frage: vor Schritt 2 gibt es noch keinen Workspace, und die Shell lädt Explorer, Benachrichtigungen und
  Befehlspalette, die im Wizard nur Ablenkung wären. Die alte Seite unter `(auth)` ist entfernt.
- **Eine Server Action pro Schritt** (`actions.ts`), jede mit Zod-Schema (`src/lib/validation/onboarding.ts`) und
  eigener Zugriffsprüfung: ab Schritt 2 `requireRole({ workspaceId }, "owner")` bzw. `requireMember()` für
  Beitretende. Wiederholte Schritte überschreiben (Upsert), Schritt 2 aktualisiert einen bereits angelegten
  Workspace statt einen zweiten anzulegen. Abschluss (Schritt 6) in **einer Transaktion**: Einladungen,
  Projekt, Status, Labels, Tutorial-Tickets inkl. Unteraufgaben; die Workspace-Zeile wird `FOR UPDATE`
  gesperrt, ein Doppelklick findet sie danach erledigt vor.
- **Fortsetzbarkeit:** `user_pref.onboarding_step` speichert den nächsten offenen Schritt (Nummerierung aus
  ONBOARDING.md §2.1) und wird nur vorwärts bewegt (`greatest(...)`), „Zurück“ ist reine Navigation. Weil
  `user_pref` je Workspace gilt, gibt es vor Schritt 2 noch keine Zeile: bis dahin hält der Wizard den Schritt
  in `?step=` (der Server erlaubt dort nie mehr als Schritt 2). Ab Schritt 2 gilt die Datenbank; `?step=` darf
  zurück, nie über den gespeicherten Schritt hinaus.
- **Guard:** `requireMember()` liefert `user.onboarded_at` frisch aus der Datenbank (die Sitzung ist 5 Minuten
  zwischengespeichert). Das Workspace-Layout leitet ohne `onboarded_at` nach `/onboarding`. API und MCP sind
  nicht betroffen. „Später fertigstellen“ (ab Schritt 3) setzt `onboarded_at`, der Workspace bleibt ohne
  `onboarding_completed_at` – der Owner sieht dann das Banner „Einrichtung fertigstellen“.
- **Backfill in der Migration** `0012_onboarding_wizard.sql`: `onboarded_at = now()` für alle, die Mitglied
  irgendeines Workspace sind, `onboarding_completed_at = created_at` für alle bestehenden Workspaces. Bestehende
  Nutzer sehen den Wizard nie. Bestehende `user_pref`-Zeilen bekommen `default_view = 'list'` (Projektlinks
  öffneten bisher die Liste); ohne Zeile gilt im Code ebenfalls die Liste, die Spalte selbst hat den Standard
  `'board'` aus der Spezifikation (der Wizard schlägt Board vor).
- **Auto-Join im Wizard vorausgewählt an** (ONBOARDING.md §6, entgegen KONZEPT 10. „Default aus“). Die Spalte
  `workspace.auto_join` bleibt `default false`; nur der Wizard schlägt „an“ vor, der Owner sieht den Schalter in
  Schritt 2. Beitreten verlangt weiterhin den Klick „Beitreten“ auf `/start` – niemand landet ungefragt im
  Workspace. Persönliche Workspaces (Ausnahme-Adressen, Schlüssel = volle Adresse) zeigen den Schalter nicht,
  die Action erzwingt dort `false`.
- **Startansicht pro Person** (`user_pref.default_view`), nicht pro Projekt (§6). Projektlinks der Seitenleiste
  hängen bei „Board“ `?view=board` an; `/p/KEY` ohne Parameter bleibt die Liste.
- **Antworten aus Schritt 5** in `onboarding_answer` (`UNIQUE(workspace_id, user_id)`), CHECK-Constraints aus
  denselben Konstanten wie die Zod-Enums (`src/lib/onboarding/options.ts`), `ON DELETE CASCADE` an Workspace und
  Person. Nichts davon im Browser-Speicher.
- **Kein Avatar-Upload:** Es gibt noch keinen Mechanismus dafür; der Profilschritt zeigt die Initialen-Vorschau.

## Verworfene Alternativen
- **Wizard-Stand im Browser (localStorage/Cookie):** nicht geräteübergreifend und ein neuer Eintrag im
  Speicher-Inventar (Datenschutzerklärung Abschnitt 7).
- **Eigene Spalte `user.onboarding_step` für die Schritte vor dem Workspace:** wäre eine Abweichung vom
  Datenmodell der Spezifikation für einen Zustand, der höchstens einen Schritt umfasst.
- **Ein großes Formular mit clientseitigen Schritten:** nicht fortsetzbar, ein Fehler im letzten Schritt
  verwirft alles.
- **Vorlagen als Tabelle:** bräuchte eine Admin-Oberfläche; Code-Konstanten (`src/lib/onboarding/templates.ts`)
  sind testbar gegen `limits.ts`.

## Folgen
- Migration `0012_onboarding_wizard.sql`: Spalten `user.timezone`, `user.onboarded_at`,
  `user_pref.default_view`, `user_pref.onboarding_step`, `workspace.team_type`,
  `workspace.onboarding_completed_at`, Tabelle `onboarding_answer`, Backfill. `scripts/deploy.sh` führt sie aus.
- Beitretende landen nach Einladung oder Domain-Beitritt zuerst im Kurz-Wizard (Profil, Startansicht), dann
  in „Meine Aufgaben“.
- Matomo-Ereignisse `Onboarding/Step completed` (Name = Schritt) und `Onboarding/Completed` (Name =
  Team-Bereich), ohne personenbezogene Daten; Seitentitel bleibt `…/Onboarding`.
