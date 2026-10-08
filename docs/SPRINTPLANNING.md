# inhouseticket.com – Sprintplanung

**Rhythmus:** 1-Wochen-Sprints (Solo + Claude Code). 
**Ziel:** MVP live nach **Sprint 9** (~10 Wochen), MCP inklusive.
Jede Story erfüllt die Definition of Done aus `CLAUDE.md`.

Legende: `[ ]` offen · `[x]` erledigt · **P** = Priorität (1 hoch)

---

## Sprint 0 – Fundament
**Ziel:** Repo läuft lokal, CI grün, Schema steht.
- [x] Next.js + TS strict + Tailwind + pnpm
- [x] docker-compose (Postgres 16), `.env.example`
- [x] Drizzle + komplettes Schema + erste Migration
- [x] `limits.ts`, `freemail.ts` + Tests
- [x] Design-Tokens (Light/Dark) als CSS-Variablen, Fonts
- [x] UI-Primitives: Button, Input, Badge, Avatar, Dropdown, Tooltip, Toast
- [x] GitHub Actions (lint, typecheck, test), Dockerfile

## Sprint 1 – Auth & Workspace
**Ziel:** Mit Firmen-Mail registrieren, Workspace entsteht.
- [x] P1 Magic-Link-Login (Better Auth), E-Mail-Versand per SMTP über mittwald (entschieden 2026-10-03; lokal Mailpit)
- [x] P1 Freemail-Blockade mit freundlicher Fehlermeldung
- [x] P1 Workspace-Anlage über Domain, Owner-Rolle
- [x] P1 Einladungen per E-Mail, Auto-Join-Option (Default aus)
- [x] P1 User-Limit 100 (DB-Trigger + UI-Hinweis ab 90)
- [x] P2 Rollen Owner/Admin/Member, `requireMember()`-Helper
- [x] P2 Onboarding-Flow (Workspace-Name, Farbe, erstes Projekt)

## Sprint 2 – App-Shell & Explorer
**Ziel:** Navigation steht, Projekte anlegbar.
- [x] P1 Layout: Sidebar, Topbar, Content, Slide-Over-Container
- [x] P1 Explorer: Ordner → Projekte, auf/zuklappen, komplett einklappbar (`Cmd+B`)
- [x] P1 Projekt CRUD: Name, Key, Farbe (12er-Palette), Icon, Archivieren
- [x] P2 Ordner CRUD, Drag & Drop Sortierung
- [x] P2 Favoriten, User-Prefs persistieren
- [x] P2 Standard-Status je Projekt anlegen, Status editierbar

## Sprint 3 – Tickets & Listenansicht
**Ziel:** Tickets anlegen, bearbeiten, in Liste sehen.
- [x] P1 Ticket anlegen (Titel 500, Beschreibung 5000, Zähler sichtbar)
- [x] P1 Ticket-Keys `KEY-123` (atomar hochzählen)
- [x] P1 Priorität, Person, Enddatum, Status
- [x] P1 Listenansicht: Gruppierung, Sortierung, Inline-Edit, Optimistic Updates
- [x] P1 Slide-Over-Detailansicht, `Esc`, `↑/↓`
- [x] P2 Labels
- [x] P2 Mehrfachauswahl + Bulk-Aktionen
- [x] P2 Aktivitätslog

## Sprint 3b – Geschlossene Beta live (entschieden 2026-10-04)
**Ziel:** inhouseticket.com läuft, nur für freigegebene Firmen-Domains.
- [x] P1 Deploy-Pipeline: GitHub Actions baut Image (GHCR), mittwald-Stack auf dem Space-Server (App + Postgres), Migrationen
- [x] P1 vHost `inhouseticket.com` (+ `www` → 301), Let's Encrypt
- [x] P1 SMTP über `no-reply@inhouseticket.com` (Passwort trägt Len in mittwald ein), Reply-To `hello@`
- [x] P1 Beta-Freigabeliste für Domains (Registrierung nur für gelistete Domains), `noindex`
- [x] P1 Schlanke Seiten Impressum + Datenschutz (Inhalte von Len freigegeben)
- [x] ~~P2 Automatisches Deploy nach grüner CI auf `main`~~ – entschieden (Len, 2026-10-05): ausgerollt wird bewusst per Befehl (`scripts/deploy.sh`, prüft CI-Status und Health von außen)
- [x] P2 Bundle-Budget automatisch prüfen (Produktions-Build, ≤ 200 KB gz pro Seite) – `scripts/check-bundle-budget.mjs`, CI-Schritt nach `pnpm build`

## Sprint 4 – Kanban
**Ziel:** Board mit flüssigem Drag & Drop.
- [x] P1 Board mit Spalten = Status (dnd-kit)
- [x] P1 Fractional Indexing für Sortierung
- [x] P1 Karte: Key, Titel, Priorität, Avatar, Fälligkeit (Unteraufgaben-Fortschritt folgt mit Sprint 5)
- [x] P2 WIP-Limit je Spalte (visuelle Warnung)
- [x] P2 Schnell-Anlage direkt in Spalte
- [x] P3 Konfetti bei „Erledigt“ (abschaltbar)

## Sprint 5 – Unteraufgaben, Anhänge, Kommentare
**Ziel:** Ticket ist inhaltlich vollständig.
- [x] P1 Unteraufgaben (max. 5, eine Ebene) + Trigger-Absicherung, Fortschritt `3/5` auf Board-Karten
- [x] P1 Anhänge: WebP/JPEG/PNG, ≤ 100 KB, Magic-Byte-Check, Speicherung in Postgres (ADR 002), max. 20 pro Ticket
- [x] P1 Client-Auto-Kompression zu WebP < 100 KB
- [x] P2 Bildvorschau/Lightbox
- [x] P2 Kommentare mit @Erwähnung
- [x] P2 Leichtes Markdown in Beschreibung/Kommentaren

## Sprint 6 – Speed-Features & Meine Aufgaben
**Ziel:** Power-User lieben es.
- [x] P1 Command Palette (`Cmd+K`)
- [x] P1 Tastenkürzel + Hilfe-Overlay (`?`)
- [x] P1 „Meine Aufgaben“ projektübergreifend
- [x] P2 Quick-Add-Parser (`@person !prio ^datum`)
- [x] P2 Filterleiste + gespeicherte Views
- [x] P2 Volltextsuche (tsvector)

## Sprint 7 – Dashboard & Benachrichtigungen
**Ziel:** Überblick über Auslastung.
- [x] P1 Auslastung pro User (gewichtet nach Priorität), Überlast-Ampel
- [x] P1 Überfällige Tickets pro User/Projekt
- [x] P1 Projekt-Gesundheit
- [x] P2 Durchsatz (8 Wochen), Fälligkeits-Heatmap 14 Tage
- [x] P2 Kacheln klickbar → gefilterte Liste
- [x] P2 In-App-Inbox + täglicher E-Mail-Digest
- [x] P3 Realtime: vorerst Polling alle 30 s bei sichtbarem Tab (SSE zurückgestellt, Backlog)

## Sprint 8 – API & MCP-Server
**Ziel:** Claude kann mit inhouseticket arbeiten.
- [x] P1 Persönliche API-Tokens (erstellen, widerrufen, gehasht; einmalig angezeigt, max. 10 aktive pro Person)
- [x] P1 MCP-Endpunkt `/mcp` (Streamable HTTP, zustandslos, JSON; Bearer-Token)
- [x] P1 Tools: `list_projects`, `search_tickets`, `get_ticket`, `create_ticket`, `update_ticket` (Präfix `inhouseticket_`)
- [x] P2 Tools: `add_comment`, `toggle_subtask`, `get_workload`, `list_members`
- [x] P2 Rate-Limits (120 Anfragen/min pro Token, im Speicher – reicht für einen Container), Aktivitätslog „via Claude“
- [x] P2 Seite „Mit Claude verbinden“ (Token, Config-Snippets für Claude Code und Claude Desktop, Beispiele)
- [x] P3 OAuth 2.1 für den Connector in claude.ai (2026-10-05): `@better-auth/oauth-provider`, dynamische Client-Registrierung, PKCE, Magic-Link-Login, Einwilligung mit Workspace-Auswahl, opake Tokens (gehasht), „Verbundene Apps“ mit Trennen

## Sprint 9 – Polish, Recht, Launch
**Ziel:** Live auf inhouseticket.com.
- [ ] P1 Performance-Budget prüfen (JS ≤ 200 KB gz pro Seite, eigener Code ≤ 50 KB, LCP < 1,5 s)
  - [x] JS-Budget automatisch in CI (Stand 2026-10-05: Projektseite 197 KB, übrige App-Seiten 183–186 KB, Login 157 KB)
  - [x] LCP von einem EU-Standort messen – 2026-10-05 aus Deutschland, kalter Cache, je 5 Läufe: `/login` Median 168 ms (TTFB 79 ms), `/impressum` 156 ms (TTFB 68 ms)
- [x] P1 Security-Review (Workspace-Scope, Rate-Limits, CSP) – Ergebnis und offene Punkte: `docs/security-review.md`
- [ ] P1 Impressum, Datenschutz, AGB, AVV
  - [x] Impressum, Datenschutz (aktualisiert 2026-10-06: Statistik, KI-Assistenten, Backups, Export)
  - [x] Entwürfe AGB (`/agb`) und AVV (`/avv`, druckbar als PDF) – als Entwurf markiert, nicht verlinkt
  - [ ] Rechtliche Prüfung durch Len/Kanzlei, danach in Footer und Onboarding verlinken
- [x] P1 Deployment EU (Container + managed Postgres + Backups), Domain, SSL – live auf mittwald; Backups: Projekt-Backup täglich + nächtlicher `pg_dump` (docs/betrieb.md) – neues mittwald-Projekt auf dem bestehenden Space-Server, Stack mit App- und Postgres-Container, vHost `inhouseticket.com` → App, SMTP-Zugang no-reply@ in die Umgebung des App-Containers, RAM messen
- [ ] P1 Landingpage (Claim, Screenshots, „Kostenlos bis 100 User“, MCP-Highlight)
- [x] P2 Datenexport CSV/JSON, Workspace löschen – Seite „Daten & Workspace“ (Export für Admins, Löschen nur Owner mit Kürzel-Bestätigung)
- [ ] P2 Mobile-Feinschliff, Dark Mode, Accessibility-Audit
  - [x] Automatischer Audit (axe, WCAG 2.1 A/AA) auf 12 Seiten, hell und dunkel – in CI (`e2e/a11y.spec.ts`); einziger Befund: Diagramm-Balken/-Zellen mit `aria-label` ohne Rolle → `role="img"`
  - [x] Mobile-Feinschliff (2026-10-07): Liste zeigt am Handy Status/Priorität/Person/Fälligkeit unter dem Titel statt abgeschnittener Spalten, Board-Spalten rasten ein, keine Tastatur-Hinweise auf Touch-Geräten; Test ohne seitliches Scrollen
  - [x] Tastatur automatisiert (`e2e/keyboard.spec.ts`): jeder Tab-Stopp auf sechs Seiten mit sichtbarem Fokus, Kernablauf nur per Tastatur; Befund: Schnelleingabe hatte nur einen Farbwechsel als Fokus → Fokusrahmen
  - [ ] Screenreader-Durchgang mit VoiceOver/NVDA (braucht einen Menschen)
- [x] P2 Drag & Drop der Seitenleiste (dnd-kit) erst bei Bedarf laden – Projektseite 197,5 → 182,0 KB, übrige App-Seiten je ~15 KB weniger
- [x] P2 Cookieless Analytics – selbst gezählt (Len, 2026-10-06): Seitenaufrufe pro Tag/Pfad/Herkunft in Postgres, ohne IP und Cookies, App-Pfade ohne Workspace-Namen, Bots ausgefiltert; Anzeige in `/admin`
- [x] P1 Vor dem Launch (2026-10-07): DMARC (`p=none`), Health-Check alle 5 Min. mit Mail-Alarm, Restore-Probe des nächtlichen Dumps, SEO-Schalter `SITE_INDEXABLE` (robots, Sitemap, Vorschaubild, Metadaten; bis zum Launch aus)
- [ ] P1 Zum Launch: `SITE_INDEXABLE=true`, Beta-Liste leeren (Registrierung öffnen), AGB/AVV verlinken, externer Uptime-Check
- [ ] P3 Launch: Product Hunt, LinkedIn, t3n/Gründerszene-Pitch, OMR Reviews (Produktprofil anlegen, erste Bewertungen von Beta-Firmen)


## Sprint 10 – Import aus anderen Tools (aufgenommen 2026-10-08)
**Ziel:** Teams ziehen mit ihren Projekten kostenlos aus ClickUp, Jira, Notion und monday.com um –
ohne API-Zugang, nur mit der Export-Datei des alten Tools.

### Backend – Import im Workspace-Bereich
- [ ] P1 Seite „Import“ unter Einstellungen (neben „Daten & Workspace“), nur Admins/Owner
- [ ] P1 Ablauf in drei Schritten: Datei hochladen → Vorschau mit Zuordnung → Import bestätigen. Nichts wird
  geschrieben, bevor die Vorschau bestätigt ist; Import in einer Transaktion (ganz oder gar nicht)
- [ ] P1 Formate (Exportwege vor der Umsetzung mit echten Beispieldateien prüfen):
  - **Jira:** CSV-Export einer Filteransicht („Alle Felder“) – Summary, Issue key, Status, Priority, Assignee,
    Due date, Labels, Description, Parent/Sub-tasks, Kommentar-Spalten
  - **ClickUp:** CSV-Export des Workspace/einer Liste – Task Name, Status, Priority, Assignees, Due Date,
    Tags, Parent ID, Task Content
  - **Notion:** Datenbank-Export „Markdown & CSV“ (ZIP: CSV der Datenbank + eine Markdown-Seite pro Eintrag);
    Spalten frei benannt → Zuordnung in der Vorschau
  - **monday.com:** Board-Export als Excel (`.xlsx`); Gruppen, Subitems in eigenen Zeilen
- [ ] P1 Zuordnung in der Vorschau: Status → Projektstatus (nach Kategorie offen/in Arbeit/erledigt),
  Priorität → 4 Stufen, Personen per E-Mail auf Mitglieder (unbekannte bleiben unzugewiesen und werden
  aufgelistet), Labels/Tags → Labels, Fälligkeit, Unteraufgaben, optional Kommentare
- [ ] P1 Limits aus `limits.ts` gelten auch beim Import und werden in der Vorschau angezeigt: Titel > 500 und
  Beschreibung > 5000 Zeichen werden gekürzt (markiert), Unteraufgaben max. 5 und eine Ebene (Rest als
  Checkliste in die Beschreibung), Anhänge werden nicht übernommen (100-KB-Grenze, ADR 002) – Hinweis im Ergebnis
- [ ] P1 Sicherheit: Upload max. 5 MB, ZIP mit Größen- und Dateizahl-Grenze (Zip-Bomben), Parsing nur
  serverseitig, max. 5.000 Tickets pro Import, Rate-Limit pro Workspace, Workspace-Scope wie überall
- [ ] P2 Import-Protokoll: Anzahl übernommen/gekürzt/übersprungen, Download als CSV; Aktivitätslog
  „importiert aus Jira“ am Ticket
- [ ] P2 Mehrere Projekte aus einer Datei (Jira-Projekte, ClickUp-Listen, monday-Gruppen) → je ein Projekt
- [ ] P3 Rückgängig: kompletten Import innerhalb von 24 h wieder entfernen
- `TODO(entscheidung)`: `.xlsx` (monday) und ZIP (Notion) brauchen einen Parser – kleine Abhängigkeit oder
  Bordmittel? Alternative: nur CSV annehmen und für monday „Als CSV speichern“ erklären
- `TODO(entscheidung)`: neue Tabelle für Import-Läufe (Protokoll, Rückgängig) → ADR

### Frontend – Landingpage und Einstieg
- [ ] P1 Abschnitt auf der Landingpage „Kostenlos umziehen“: Projekte aus ClickUp, Jira, Notion und monday.com
  in wenigen Minuten importieren – erst live schalten, wenn der Import funktioniert
- [ ] P1 Kurzanleitung je Tool (wo finde ich den Export?) – auf der Import-Seite und als Hilfeseite
- [ ] P2 Einstieg „Projekte importieren“ im Onboarding und im leeren Zustand eines neuen Workspace
- [ ] P2 FAQ-Eintrag „Kann ich meine Daten mitnehmen?“ (Import und Export)
- Hinweis: Tool-Namen dürfen genannt werden; Logos nur gemäß den Markenrichtlinien der Anbieter

---

## Backlog (nach MVP)
- Ticket-Vorlagen
- Wiederkehrende Tickets
- Abhängigkeiten (blockiert durch)
- Kalenderansicht
- Intake-Formular → Ticket (ohne Account)
- Slack/Teams-Benachrichtigungen
- SSO (Google Workspace / Microsoft Entra) als möglicher Pro-Plan
- Subdomain pro Workspace (`firma.inhouseticket.com`) als mögliche Pro-Option – braucht Wildcard-DNS/-Zertifikat
- Englische UI
- Realtime per Server-Sent Events statt 30-s-Polling

## Risiken
| Risiko | Gegenmaßnahme |
|---|---|
| Spam-Workspaces | Firmen-Domain-Pflicht, Rate-Limit Registrierung, Disposable-Domain-Liste |
| Kosten bei „kostenlos“ | 100-KB-Limit, Bild-Storage minimal, Postgres effizient |
| Feature Creep | Backlog statt Sprint, Minimalismus-Check pro Story |
| Datenleck zwischen Workspaces | `requireMember()`, Security-Review-Prompt, E2E-Tests mit 2 Workspaces |
