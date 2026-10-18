# inhouseticket.com – Onboarding-Wizard (Plan & Spezifikation)

> Ablage im Repo: `docs/ONBOARDING.md`
> Ersetzt/erweitert `KONZEPT.md` → 5.6 Onboarding. Ziel bleibt: **≤ 60 Sekunden** bis zum ersten Ticket.

---

## 1. Abgleich mit ClickUp-Wizard

### 1.1 Was ClickUp abfragt (Reihenfolge laut Fortschrittsbalken)
| # | ClickUp-Schritt | Bei uns bisher | Entscheidung |
|---|---|---|---|
| 1 | Wofür nutzen? (Arbeit / Privat / Schule) | – | ❌ entfällt – nur Firmen-Accounts |
| 2 | Was möchtest du verwalten? (Marketing, IT, Support …) | Vorlage „Marketing · IT · Allgemein“ | ✅ **ausbauen** → Team-Bereich steuert Projektvorlage |
| 3 | Wie hast du von uns erfahren? | – | ✅ **neu**, optional (Attribution fürs Marketing) |
| 4 | Personen einladen (mehrere einfügen) | Kollegen einladen | ✅ vorhanden → **Chips + Validierung** ergänzen |
| 5 | Welche Features ausprobieren? | – | 🔁 **umgedeutet** → „Startansicht: Liste oder Board“ |
| 6 | Verwendest du eines dieser Tools? (Jira, Trello, Excel …) | – | ✅ **neu**, optional → Import-Hinweis + Marketing-Insight |
| 7 | Tools verbinden (Kalender, Slack, Drive …) | – | ❌ MVP: nein (Slack/Teams, Kalender stehen im Backlog) |
| 8 | Workspace benennen | Workspace-Name + Farbe | ✅ vorhanden |
| – | Nach dem Wizard: Space → Ordner → 2 Projekte mit Beispiel-Tasks + „Get Started“-Liste | 3 Beispiel-Tickets | ✅ **ausbauen** → Beispiel-Tickets = Mini-Tutorial |

Bewusst ausgelassen: alle KI-Themen (KI-Feature, Brain, Agenten, KI-Chats), Chat/Kanäle, Meetings, Clips, Zeiterfassung, Gantt, Sprints, CRM, Ziele/OKRs.

### 1.2 Was uns bisher fehlt
1. **Profil-Schritt (Name, Avatar, Zeitzone)** – Magic Link liefert keinen Namen, wir brauchen ihn aber für Zuweisungen, Avatare und @Erwähnungen. ClickUp holt das woanders, wir müssen es explizit machen.
2. **Team-Bereich** als Steuerung für Vorlage (Status, Labels, Beispiel-Tickets).
3. **Startansicht** (Liste/Board) als persönliche Präferenz.
4. **Herkunfts-Tool** (Jira, Trello, Excel …) → Import-Hinweis, Daten für Positionierung.
5. **„Wie hast du von uns erfahren?“** – first-party, ohne Tracking, DSGVO-konform.
6. **Einladungs-UX:** mehrere Adressen einfügen, Chips, Freemail-Erkennung, extern-Kennzeichnung, Zähler `x/100`.
7. **Fortsetzbarkeit:** Wizard-Stand serverseitig speichern (Reload / anderes Gerät).
8. **Wizard für Beitretende** (Einladung/Auto-Join) – nur Profil, kein Workspace-Setup.
9. **Tutorial-Tickets** statt separater Checkliste (kein neues UI-Element nötig).

### 1.3 UX-Muster übernehmen – und Fehler vermeiden
Übernehmen:
- Modal-Karte über der (bereits geladenen) App → App fühlt sich sofort „da“ an.
- Eine Frage pro Screen, große Pills, Fortschrittsbalken, `Zurück` links, primärer Button rechts.
- „Drücke Enter, um fortzufahren“-Hinweis, Pills per Tastatur.
- `Weiter` deaktiviert, bis Pflichtfeld gefüllt; optionale Schritte mit `Überspringen`.

Vermeiden (ClickUp-Schwächen):
- **Sprachmix** („Which tools would you like to connect?“) → alle Strings aus i18n-Datei.
- **Schlechte Übersetzung** „Anstehend“ statt „Weiter“ → Button heißt `Weiter` / `Los geht’s`.
- **Zu viele Screens (8+)** → wir bleiben bei max. 6, davon 1 kombinierter Optional-Screen.
- Feature-Auswahl, die nur Erwartungen weckt, die wir nicht erfüllen.

---

## 2. Unser Wizard-Flow

### 2.1 Owner (erster User der Domain)
| Schritt | Inhalt | Pflicht | Default / Vorbelegung |
|---|---|---|---|
| 1 · Profil | Name, Avatar (optional), Zeitzone (auto, änderbar) | Name | Name aus E-Mail (`max.mustermann@` → „Max Mustermann“) |
| 2 · Workspace | Name, Farbe (12er-Palette), Auto-Join-Schalter | Name | Name aus Domain (`ursalz.de` → „Ursalz“) |
| 3 · Team-Bereich | Marketing · IT · Support · Office/Verwaltung · Vertrieb · Kreativ & Design · Entwicklung · Allgemein | ja (1 Auswahl) | – |
| 4 · Startansicht | Liste oder Board (zwei Mini-Vorschauen) | ja | Board |
| 5 · Zwei kurze Fragen | a) Bisher genutzt (Mehrfach): Excel/CSV, Jira, Trello, Asana, ClickUp, Monday, Notion, E-Mail/nichts, Andere · b) Woher kennst du uns (einfach): Google/Suche, LinkedIn, Empfehlung, KI-Assistent, Podcast, Bewertungsportal, Product Hunt, Andere (+Freitext) | nein | `Überspringen` |
| 6 · Einladen | E-Mails einfügen (Komma, Leerzeichen, Zeilen), Chips, Status je Chip | nein | `Überspringen` |
| → Fertig | Projekt aus Vorlage mit Tutorial-Tickets, gewählte Ansicht öffnet sich | | |

### 2.2 Beitretende (Einladung / Auto-Join)
Nur Schritt 1 (Profil) + Schritt 4 (Startansicht) → landet in „Meine Aufgaben“.

### 2.3 Regeln
- Jeder Schritt = eine Server Action mit Zod-Schema, speichert sofort → Wizard ist fortsetzbar.
- `Zurück` verändert nichts, nur Navigation. Bereits angelegter Workspace wird bei Schritt 2 aktualisiert, nicht dupliziert (idempotent).
- Workspace + Projekt werden **erst beim Abschluss** aus der Vorlage befüllt (eine Transaktion).
- Wizard nicht abbrechbar vor Schritt 2 (Workspace muss existieren), danach `Später fertigstellen` → Rest per Banner.
- Bei Einladungen: Freemail → roter Chip „Freemail nicht erlaubt“, fremde Firmen-Domain → gelber Chip „extern“, Duplikat/bereits Mitglied → grauer Chip. Limit 100 inkl. offener Einladungen.
- `prefers-reduced-motion`: Screen-Wechsel ohne Slide, nur Fade ≤ 120 ms.

### 2.4 Projektvorlagen je Team-Bereich
| Bereich | Projekt | Key | Farbe | Status | Labels |
|---|---|---|---|---|---|
| Marketing | Marketing | MKT | Coral | Offen · In Arbeit · Review · Erledigt | Social, Content, Kampagne, Design |
| IT | IT-Anfragen | IT | Blau | Offen · In Arbeit · Wartet · Erledigt | Hardware, Software, Zugang, Bug |
| Support | Support | SUP | Mint | Neu · In Bearbeitung · Wartet auf Kunde · Gelöst | Frage, Fehler, Wunsch |
| Office/Verwaltung | Office | OFF | Sonne | Offen · In Arbeit · Erledigt | Einkauf, Termin, Personal |
| Vertrieb | Vertrieb | VTR | Orange | Offen · In Arbeit · Angebot · Erledigt | Lead, Angebot, Kunde |
| Kreativ & Design | Design | DES | Violett | Briefing · In Arbeit · Review · Freigegeben | Print, Web, Social |
| Entwicklung | Entwicklung | DEV | Indigo | Offen · In Arbeit · Review · Erledigt | Bug, Feature, Tech-Debt |
| Allgemein | Allgemein | ALL | Schiefer | Offen · In Arbeit · Erledigt | – |

Vorlagen als **Code-Konstanten** (`src/lib/onboarding/templates.ts`), keine DB-Tabelle → keine Admin-UI nötig.

### 2.5 Tutorial-Tickets (in jedem Vorlagen-Projekt)
Ersetzt die 3 Beispiel-Tickets und eine eigene „Get Started“-Liste:
1. `Drück C – und leg dein erstes eigenes Ticket an` (Priorität Hoch, Zugewiesen: ich, fällig heute)
2. `Zieh mich nach „In Arbeit“ →` (Board) bzw. `Ändere meinen Status per Klick` (Liste)
3. `Öffne mich und hak die Unteraufgaben ab` – 3 Unteraufgaben: `Esc schließt`, `↑/↓ springt zum nächsten Ticket`, `Cmd/Ctrl+K öffnet die Palette`
4. `Lade dein Team ein` (nur wenn Schritt 6 übersprungen)
5. Ein Bereichs-spezifisches Beispiel (z. B. MKT: `Newsletter November planen`)

Alle Tutorial-Tickets bekommen das Label `Tutorial` → Bulk-Löschen mit einem Klick.

---

## 3. Datenmodell-Ergänzungen

```
user              + timezone text default 'Europe/Berlin'
                  + onboarded_at timestamptz null
user_pref         + default_view text ('list'|'board') default 'board'
                  + onboarding_step smallint null          -- Fortsetzbarkeit
workspace         + team_type text null                    -- marketing|it|support|office|sales|creative|dev|general
                  + onboarding_completed_at timestamptz null
onboarding_answer   id, workspace_id, user_id,
                    previous_tools text[] (max 9),
                    source text null, source_other varchar(100) null,
                    created_at
                    UNIQUE(workspace_id, user_id)
```
- `onboarding_answer` hängt am Workspace → wird bei Workspace-Löschung mitgelöscht (DSGVO).
- Auswertung nur aggregiert (Backlog: internes Admin-Dashboard).
- Erlaubte Werte als Zod-Enums in `src/lib/validation/onboarding.ts`.

---

## 4. Ergänzungen aus dem ClickUp-App-Screenshot (Listenansicht)
Kleine Dinge, die unsere Liste noch nicht hat:
- [x] „+ Ticket hinzufügen“-Zeile am Ende **jeder Gruppe** (legt Ticket mit diesem Status an)
- [x] Schalter „Erledigte anzeigen“ (Default aus)
- [x] Schalter „Unteraufgaben anzeigen“ (aufklappbar unter dem Ticket)
- [x] Spalten ein-/ausblenden (pro User in `user_pref` gespeichert)
- [x] „+ Neuer Status“ am Listenende (nur Admin/Owner)
- [x] Kommentar-Zähler als Spalte

Umgesetzt 2026-10-18: „+ Ticket hinzufügen“ bei Gruppierung nach Status; „Erledigte anzeigen“ und „Unteraufgaben
anzeigen“ als URL-Parameter (`done=1`, `subtasks=1`, landen damit auch in gespeicherten Ansichten), Hinweis
„n erledigte Tickets ausgeblendet“ unter der Liste; ausgeblendete Spalten in `user_pref.hidden_columns`
(Migration `0013_list_columns`); „+ Neuer Status“ zeigt die Liste nur Admins/Owner – die Server Action ist
dieselbe wie in den Projekteinstellungen (dort dürfen Mitglieder heute schon Status anlegen).

---

## 5. Umsetzungsplan

Abhängigkeiten: Profil/Workspace/Einladen brauchen Sprint 1, Vorlagen brauchen Projekte/Status/Labels (Sprint 2) und Tickets/Unteraufgaben (Sprint 3 + 5), Startansicht braucht Board (Sprint 4).

### Phase A – Doku (sofort)
- [x] `docs/ONBOARDING.md` anlegen (diese Datei)
- [x] `KONZEPT.md` 5.6 auf Verweis + Kurzfassung umstellen, Datenmodell (6.) ergänzen
- [x] `SPRINTPLANNING.md` anpassen (siehe unten)

### Phase B – Sprint 1 (Wizard-Gerüst)
- [x] P1 Route `src/app/(app)/onboarding/` mit Wizard-Shell: Modal-Karte, Fortschritt, Zurück/Weiter, Enter, Überspringen
- [x] P1 Schritt 1 Profil (Name-Vorbelegung aus E-Mail, Zeitzone via `Intl`)
- [x] P1 Schritt 2 Workspace (Name aus Domain, Farbe, Auto-Join)
- [x] P1 Schritt 6 Einladen (Chips, Paste-Parser, Freemail/extern/Duplikat, Limit 100)
- [x] P2 Schritt 5 Zwei kurze Fragen + Tabelle `onboarding_answer`
- [x] P2 Fortsetzbarkeit (`onboarding_step`), Redirect-Guard: nicht onboardete User → `/onboarding`
- [x] P2 Beitretende-Flow (Profil + Ansicht)
- [x] Tests: Unit (Name-Parser, Paste-Parser, Domain→Name), E2E Owner-Happy-Path, E2E Beitritt

### Phase C – nach Sprint 4/5 (Vorlagen + Ansicht)
- [x] P1 Schritt 3 Team-Bereich + `templates.ts`
- [x] P1 Anlage in **einer Transaktion**: Projekt, Status, Labels, Tutorial-Tickets inkl. Unteraufgaben
- [x] P1 Schritt 4 Startansicht → `user_pref.default_view`, Projektlink öffnet diese Ansicht
- [x] P2 Banner „Einrichtung fertigstellen“ bei abgebrochenem Wizard
- [x] P2 Listen-Ergänzungen aus Abschnitt 4
- [x] Tests: jede Vorlage erzeugt gültige Daten (Limits, max. 5 Unteraufgaben), E2E Board/Liste-Wahl

### SPRINTPLANNING-Änderungen
- Sprint 1: „P2 Onboarding-Flow …“ ersetzen durch Phase B (siehe oben)
- Sprint 3: Listen-Ergänzungen (Abschnitt 4) als P2/P3
- Sprint 5 (Ende): Phase C
- Sprint 9: `P2 CSV-Import (generisch, Spalten-Mapping)` neben Datenexport – passt zum Schritt „Bisher genutzt: Excel/CSV“
- Backlog: Import-Assistent Jira/Trello/Asana · iCal-Feed „Meine Fälligkeiten“ · internes Dashboard Onboarding-Auswertung · Tool-Verbindungen (Kalender, Slack/Teams)

---

## 6. Offene Entscheidungen
| Frage | Empfehlung |
|---|---|
| Auto-Join standardmäßig an oder aus? (KONZEPT 10.) | **An** – Domain ist verifiziert, spart Einladungen; Owner sieht den Schalter in Schritt 2 |
| Mehrere Team-Bereiche wählbar? | **Nein** im MVP – ein Projekt zum Start, weitere per `+ Projekt` mit Vorlagen-Auswahl |
| Startansicht pro User oder pro Projekt? | **Pro User** (einfacher), Projekt merkt sich zuletzt genutzte Ansicht |

## 7. Definition of Done (zusätzlich zu CLAUDE.md)
- Owner kommt in ≤ 60 s vom Magic Link zum ersten eigenen Ticket (manuell gemessen)
- Wizard vollständig per Tastatur bedienbar, Pills als `radiogroup`/`group` mit ARIA
- Reload in jedem Schritt → gleicher Schritt, keine Duplikate
- Keine englischen Strings im Wizard
