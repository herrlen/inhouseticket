# inhouseticket.com – Produktkonzept

**Claim:** *Tickets. Ohne Ballast.*
Ein kostenloses, schlankes Ticketing-System für interne Teams – so schnell wie eine Notiz-App, so übersichtlich wie ein Kanban-Board, mit dem Überblick eines Jira-Dashboards.

---

## 1. Zielgruppe & Positionierung

| | inhouseticket | ClickUp | Jira |
|---|---|---|---|
| Preis | kostenlos | Freemium | Freemium (10 User) |
| Lernkurve | Minuten | hoch | hoch |
| Fokus | Tickets, Übersicht, Auslastung | alles | Software-Teams |
| User | bis 100 | unbegrenzt | 10 kostenlos |

**Zielgruppe:** KMU, Agenturen, Inhouse-Teams (Marketing, IT, Office, Support), 2–100 Personen, die Jira zu schwer und Excel zu chaotisch finden.

**USP:** kostenlos bis 100 User · keine Einarbeitung · extrem schnell · DSGVO/EU-Hosting · Claude-Integration via MCP.

---

## 2. Kern-Features (MVP)

### 2.1 Account & Workspace
- Registrierung **nur mit Firmen-E-Mail** (Freemail-Blockliste: gmail, googlemail, gmx, web.de, t-online, outlook, hotmail, live, yahoo, icloud, me, proton, aol, mail.de, freenet …).
- Login per **Magic Link** (kein Passwort → weniger Support, mehr Sicherheit).
- **Workspace = E-Mail-Domain.** Erster User einer Domain erstellt den Workspace und ist Owner.
- Weitere User mit derselben Domain: Beitritt per Einladung **oder** optional Auto-Join (Owner-Einstellung).
- Externe Domains nur per Einladung (z. B. Freelancer mit Firmen-Domain).
- **Limit: 100 aktive User** pro Workspace. Ab 90 Hinweis an Owner, ab 100 keine neuen Einladungen.
- Rollen: **Owner**, **Admin**, **Member**. (Kein Gast-Konzept im MVP.)

### 2.2 Projekte
- Unbegrenzt viele Projekte.
- Jedes Projekt: Name, Kürzel (z. B. `MKT`), **Farbe** (aus 12er-Palette), optional Emoji-Icon.
- Optional **Ordner** zur Gruppierung im Explorer (eine Ebene: Ordner → Projekte).
- Archivieren statt Löschen (Löschen nur durch Owner, mit Bestätigung).

### 2.3 Tickets
| Feld | Regel |
|---|---|
| Key | automatisch `MKT-142` (Jira-Stil, pro Projekt hochzählend) |
| Titel | Pflicht, max. **500 Zeichen** |
| Beschreibung | optional, max. **5.000 Zeichen**, leichtes Markdown (fett, kursiv, Listen, Links, Code) |
| Status | pro Projekt definierbar, Default: *Offen → In Arbeit → Review → Erledigt* |
| Priorität | **Dringend · Hoch · Mittel · Niedrig · Keine** |
| Zugewiesen | **eine** Person (bewusst – klare Verantwortung) |
| Enddatum | optional, Datum (optional Uhrzeit) |
| Labels | optional, frei pro Projekt, farbig |
| Unteraufgaben | max. **5**, je Titel (500), Checkbox, optional eigene Person + Datum. Nur eine Ebene. |
| Anhänge | nur **WebP, JPEG, PNG**, je max. **100 KB** |
| Kommentare | mit @Erwähnung |
| Aktivitätslog | automatisch (wer hat was wann geändert) |

**Anhänge-UX-Trick:** Bilder > 100 KB werden **clientseitig automatisch** zu WebP komprimiert/verkleinert, bis sie passen. Nur wenn das nicht klappt, kommt ein Fehler. Serverseitig: Magic-Byte-Prüfung + Größenlimit.

### 2.4 Ansichten
1. **Liste** – dichte Tabelle, gruppierbar (Status / Priorität / Person / Fälligkeit), Inline-Edit, Mehrfachauswahl + Bulk-Aktionen.
2. **Kanban** – Spalten = Status, Drag & Drop, Karte zeigt Key, Titel, Priorität, Avatar, Fälligkeit, Unteraufgaben-Fortschritt (z. B. `3/5`). Optional **WIP-Limit** pro Spalte.
3. **Meine Aufgaben** – projektübergreifend alles, was mir zugewiesen ist, gruppiert nach *Überfällig · Heute · Diese Woche · Später*.
4. **Dashboard** – Auslastung (siehe 2.6).

Ticket-Detail öffnet als **Slide-Over rechts** (kein Seitenwechsel → schnell, Kontext bleibt). Mit `Esc` zu, mit `↑/↓` zum nächsten Ticket.

### 2.5 Explorer (ClickUp-Stil)
- Linke Sidebar: Workspace → Ordner → Projekte, Projektfarbe als Punkt, Ticket-Zähler.
- **Einklappbar** komplett (`Cmd/Ctrl + B`) auf eine Icon-Leiste, Ordner einzeln aufklappbar.
- Favoriten oben angepinnt.
- Drag & Drop zum Sortieren.
- Zustand (offen/zu) wird pro User gespeichert.

### 2.6 Dashboard (Jira-Stil, schlank)
**Workspace-Dashboard**
- **Auslastung pro User:** offene Tickets, gewichtet nach Priorität (Dringend 4, Hoch 3, Mittel 2, Niedrig 1), als horizontale Balken; Ampel bei Überlast (Schwelle einstellbar).
- **Überfällige Tickets** pro User und Projekt.
- **Projekt-Gesundheit:** offen / in Arbeit / erledigt, Anteil überfällig.
- **Durchsatz:** erledigte Tickets pro Woche (letzte 8 Wochen).
- **Fälligkeits-Heatmap** der nächsten 14 Tage.

**Projekt-Dashboard:** dieselben Kacheln, gefiltert auf ein Projekt.
Alle Kacheln klickbar → springt in gefilterte Liste.

### 2.7 Geschwindigkeit & Power-User
- **Command Palette** (`Cmd/Ctrl + K`): Ticket suchen, anlegen, Projekt wechseln, Aktionen.
- **Tastenkürzel:** `C` neues Ticket · `/` Suche · `1`–`4` Priorität · `A` zuweisen · `D` Datum · `L` Liste · `B` Board · `?` Hilfe.
- **Quick-Add:** `Bug Login kaputt @max !hoch ^freitag` → parst Person, Priorität, Datum.
- **Gespeicherte Filter** („Views“) pro User.
- Volltextsuche (Postgres `tsvector`).

### 2.8 Benachrichtigungen
- In-App-Inbox (Zuweisung, Erwähnung, Statuswechsel bei eigenen Tickets, Fälligkeit morgen).
- E-Mail-Digest täglich (abschaltbar), keine Einzel-Mail-Flut.

---

## 3. Inspiration aus ClickUp & Jira – bewusst ausgewählt

| Feature | Quelle | MVP? | Begründung |
|---|---|---|---|
| Explorer-Sidebar, einklappbar | ClickUp | ✅ | Kernwunsch |
| Ticket-Keys `MKT-142` | Jira | ✅ | referenzierbar in Chats/Mails |
| Command Palette | ClickUp/Linear | ✅ | Speed |
| Meine Aufgaben | ClickUp „Home“ | ✅ | täglicher Einstieg |
| Workload-Ansicht | Jira/ClickUp | ✅ | Kernwunsch |
| WIP-Limits | Jira | ✅ | einfach, wirksam |
| Gespeicherte Filter | Jira JQL light | ✅ | |
| Ticket-Vorlagen | ClickUp | 🔜 V1.1 | z. B. „Bug“, „Content-Briefing“ |
| Wiederkehrende Tickets | ClickUp | 🔜 V1.1 | |
| Abhängigkeiten (blockiert durch) | Jira | 🔜 V1.1 | |
| Kalenderansicht | ClickUp | 🔜 V1.2 | |
| Formular → Ticket (Intake) | Jira Service | 🔜 V1.2 | interne Anfragen ohne Account |
| Slack/Teams-Benachrichtigung | beide | 🔜 V1.2 | |
| Zeiterfassung, Sprints, Docs, Whiteboards | beide | ❌ | widerspricht Minimalismus |

---

## 4. MCP-Server für Claude

**Ziel:** Claude kann Tickets lesen, anlegen und pflegen – z. B. „Leg mir aus diesem Meeting-Protokoll Tickets an“ oder „Wer ist diese Woche überlastet?“.

- **Transport:** Remote-MCP über Streamable HTTP unter `https://inhouseticket.com/mcp`.
- **Auth:** MVP mit persönlichem API-Token (in den User-Einstellungen erzeugbar, widerrufbar, gehasht gespeichert). Später OAuth 2.1, damit es als Connector in claude.ai eingebunden werden kann.
- **Rechte:** Token erbt die Rechte des Users, workspace-gescoped. Rate-Limit pro Token.

**Tools**
| Tool | Zweck |
|---|---|
| `list_projects` | Projekte des Workspaces |
| `search_tickets` | Filter: Projekt, Status, Priorität, Person, fällig bis, Freitext |
| `get_ticket` | Details inkl. Unteraufgaben, Kommentare |
| `create_ticket` | inkl. Unteraufgaben (max. 5), Limits werden geprüft |
| `update_ticket` | Status, Priorität, Person, Datum, Titel, Beschreibung |
| `add_comment` | Kommentar schreiben |
| `toggle_subtask` | Unteraufgabe abhaken |
| `get_workload` | Auslastung pro User / Projekt |
| `list_members` | für Zuweisungen |

Alle Schreibaktionen erscheinen im Aktivitätslog mit Kennzeichnung „via Claude“.

---

## 5. Design

### 5.1 Leitidee: „Weißes Papier, bunte Stifte“
Die Fläche bleibt ruhig und neutral. **Farbe trägt Bedeutung:** Projekte, Prioritäten, Status, Avatare. So wirkt das Tool fröhlich, aber nie unruhig.

### 5.2 Farbsystem

**Neutral (Light / Dark)**
| Token | Light | Dark |
|---|---|---|
| `--bg` | `#FAFAF9` | `#0E0E11` |
| `--surface` | `#FFFFFF` | `#17171C` |
| `--border` | `#E7E5E4` | `#26262E` |
| `--text` | `#1C1917` | `#F4F4F5` |
| `--muted` | `#78716C` | `#A1A1AA` |
| `--accent` (Marke) | `#5B5BF7` (Indigo-Violett) | `#7C7CFF` |

**Projektpalette (12)** – Grundfarbe für Punkte, Balken und Flächen. Für Text und Icons gibt es je Farbe eine `-ink`-Variante, die WCAG AA (4,5:1) in Light und Dark erreicht (`src/app/globals.css`, geprüft in `tokens.test.ts`). Mehrere Grundfarben (z. B. Sonne 1,6:1, Orange 2,1:1) sind auf Weiß als Text nicht lesbar.
Coral `#FF6B5B` · Orange `#FF9F1C` · Sonne `#F5C400` · Limette `#8AC926` · Mint `#2EC4B6` · Türkis `#00B4D8` · Blau `#3A86FF` · Indigo `#5B5BF7` · Violett `#9B5DE5` · Pink `#F15BB5` · Beere `#C9184A` · Schiefer `#64748B`

**Prioritäten**
| Priorität | Farbe | Icon |
|---|---|---|
| Dringend | `#EF4444` | ▲▲ gefüllt |
| Hoch | `#F97316` | ▲▲ |
| Mittel | `#EAB308` | ▲ |
| Niedrig | `#3B82F6` | ▼ |
| Keine | `--muted` | — |

**Status:** Offen (Grau) · In Arbeit (Blau) · Review (Violett) · Erledigt (Grün `#22C55E`). Pro Projekt anpassbar.

### 5.3 Typografie & Form
- **Inter** 14 px Basis, 13 px in dichten Listen; **JetBrains Mono** für Ticket-Keys.
- Radius 10 px (Karten), 6 px (Badges), Pills für Status.
- 1 px Borders, Schatten nur für schwebende Elemente (Slide-Over, Palette, Dropdowns).
- Spacing-Raster 4 px.
- Micro-Animationen 120–180 ms (ease-out), respektiert `prefers-reduced-motion`.
- Kleines Detail mit Charme: Beim Verschieben nach „Erledigt“ ein dezenter Konfetti-Puff in Projektfarbe (abschaltbar).

### 5.4 UI-Struktur

```
┌──────────────┬────────────────────────────────────────────────────┐
│ ◉ Workspace ▾│  Marketing / Kampagne Q4        [Liste|Board|📊]  ⌘K│
│ ─────────────│  ┌ Filter: Person ▾ Priorität ▾ Fällig ▾  + View ┐ │
│ 🏠 Meine Aufg.│  └────────────────────────────────────────────────┘ │
│ 📥 Inbox   3 │                                                    │
│ 📊 Dashboard │   Offen (8)    In Arbeit (4)   Review (2)  Erledigt │
│ ─────────────│  ┌─────────┐  ┌─────────┐    ┌─────────┐          │
│ ★ Favoriten  │  │MKT-142  │  │MKT-138  │    │MKT-120  │          │
│  ● Kampagne  │  │Banner Q4│  │Newslet. │    │Landing  │          │
│ ▾ Marketing  │  │▲▲ 🟠 3/5│  │▲ 👤 Fr  │    │▼ 👤     │          │
│  ● Kampagne  │  └─────────┘  └─────────┘    └─────────┘          │
│  ● Social    │                                                    │
│ ▸ IT         │                                                    │
│ + Projekt    │                                    ┌──────────────┐│
│ ─────────────│                                    │ Slide-Over   ││
│ ⚙ Einstell.  │                                    │ Ticket-Detail││
│ « einklappen │                                    └──────────────┘│
└──────────────┴────────────────────────────────────────────────────┘
```

- **Sidebar** (240 px, eingeklappt 56 px): Navigation + Explorer.
- **Topbar:** Breadcrumb, View-Switcher, Suche/Palette, Avatar.
- **Filterleiste:** Chips, eine Zeile, gespeicherte Views.
- **Content:** Liste oder Board.
- **Slide-Over** (560 px): Titel inline editierbar, rechts Metadaten-Spalte (Status, Priorität, Person, Datum, Labels), darunter Beschreibung, Unteraufgaben, Anhänge, Kommentare/Aktivität in Tabs.

### 5.5 UX-Prinzipien
1. **Alles inline editierbar** – kein „Bearbeiten“-Modus.
2. **Nie warten** – Optimistic UI, Fehler werden zurückgerollt mit Toast + „Erneut“.
3. **Leere Zustände mit Aktion** – „Noch keine Tickets. Drück `C`.“
4. **Undo statt Bestätigungsdialog** (außer bei Projekt-Löschung).
5. **Zähler sichtbar machen** – Titel `423/500`, Unteraufgaben `5/5` (Button deaktiviert), Anhang `98 KB/100 KB`.
6. **Mobile:** responsiv, Board horizontal scrollbar, Sidebar als Drawer. Keine native App im MVP.

### 5.6 Onboarding (≤ 60 Sekunden)
1. Firmen-E-Mail eingeben → Magic Link.
2. Workspace-Name (vorausgefüllt aus Domain) + Farbe.
3. Erstes Projekt anlegen (Vorlage: *Marketing · IT · Allgemein*), 3 Beispiel-Tickets.
4. Kollegen einladen (E-Mails mit Komma) – überspringbar.

---

## 6. Datenmodell (PostgreSQL)

```
workspace        id, name, domain (unique), auto_join bool, created_at
user             id, email (unique), name, avatar_url, created_at
membership       id, workspace_id, user_id, role (owner|admin|member), status (active|invited|disabled), created_at
                 UNIQUE(workspace_id, user_id)
invitation       id, workspace_id, email, token_hash, invited_by, expires_at
folder           id, workspace_id, name, sort
project          id, workspace_id, folder_id?, name, key (unique je workspace), color, icon, ticket_seq int, archived_at?, sort
status           id, project_id, name, color, category (open|active|done), sort, wip_limit?
label            id, project_id, name, color
ticket           id, workspace_id, project_id, number int, title varchar(500), description varchar(5000),
                 status_id, priority smallint (0-4), assignee_id?, due_at?, sort (fractional index),
                 created_by, created_at, updated_at, completed_at?, search tsvector
                 UNIQUE(project_id, number)
ticket_label     ticket_id, label_id
subtask          id, ticket_id, title varchar(500), done bool, assignee_id?, due_at?, sort
                 CHECK max 5 je ticket (Trigger + App-Logik)
attachment       id, ticket_id, workspace_id, key, mime, bytes (<= 102400), width, height, uploaded_by, created_at
comment          id, ticket_id, author_id, body varchar(5000), created_at, edited_at?
activity         id, workspace_id, ticket_id, actor_id, type, payload jsonb, via (web|mcp|api), created_at
notification     id, user_id, workspace_id, ticket_id, type, read_at?, created_at
saved_view       id, user_id, workspace_id, project_id?, name, filters jsonb
user_pref        user_id, sidebar_collapsed bool, expanded_folders jsonb, favorites jsonb, theme
api_token        id, user_id, workspace_id, name, token_hash, last_used_at, created_at, revoked_at?
```

**Indizes:** `ticket(workspace_id, project_id, status_id)`, `ticket(assignee_id, due_at)`, GIN auf `ticket.search`.
**Limits doppelt abgesichert:** DB-Constraints (Länge, Bytes) + Trigger (Subtask-Anzahl, User-Anzahl) + App-Validierung.

---

## 7. Technik & Performance

- **Stack:** Next.js App Router, TypeScript, Tailwind, Postgres + Drizzle, Better Auth, TanStack Query, dnd-kit, Zod.
- **Realtime:** Server-Sent Events pro Projekt (Board aktualisiert sich live), Fallback Polling.
- **Sortierung:** Fractional Indexing → Drag & Drop ohne Massen-Updates.
- **Storage:** S3-kompatibel (EU), Bilder über signierte URLs, Cache-Header lang.
- **Budget:** JS initial < 150 KB gz, LCP < 1,5 s, Interaktion < 100 ms.
- **Hosting:** Docker-Container, EU (z. B. Mittwald), Postgres managed, tägliche Backups.
- **Sicherheit:** Rate-Limits (Login, API, MCP), CSRF über Server Actions, CSP-Header, Audit-Log.

---

## 8. Recht & Betrieb (DE)
- Impressum, Datenschutzerklärung, AGB/Nutzungsbedingungen.
- **AVV (Auftragsverarbeitungsvertrag)** als Download/Click-Accept – B2B-Kunden fragen danach.
- Datenexport (CSV/JSON) pro Workspace, Workspace-Löschung durch Owner.
- Keine Tracking-Cookies; Analytics cookieless (z. B. Plausible, selbst gehostet).

---

## 9. Kennzahlen
- Aktivierung: Workspace mit ≥ 3 Usern und ≥ 10 Tickets in 7 Tagen
- Wöchentlich aktive Workspaces
- Median Zeit „Ticket anlegen“ < 5 s
- MCP-Nutzung: Anteil Workspaces mit aktivem API-Token

## 10. Offene Fragen
- Finanzierung langfristig (kostenlos): später optionaler Pro-Plan (SSO, > 100 User, Intake-Formulare)?
- Auto-Join per Domain standardmäßig an oder aus?
- Namensschema Ticket-Keys bei Projekt-Umbenennung (Key bleibt fix – empfohlen).
