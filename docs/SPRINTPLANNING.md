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
- [ ] P1 Magic-Link-Login (Better Auth), E-Mail-Versand per SMTP über mittwald (entschieden 2026-10-03; lokal Mailpit)
- [ ] P1 Freemail-Blockade mit freundlicher Fehlermeldung
- [ ] P1 Workspace-Anlage über Domain, Owner-Rolle
- [ ] P1 Einladungen per E-Mail, Auto-Join-Option (Default aus)
- [ ] P1 User-Limit 100 (DB-Trigger + UI-Hinweis ab 90)
- [ ] P2 Rollen Owner/Admin/Member, `requireMember()`-Helper
- [ ] P2 Onboarding-Flow (Workspace-Name, Farbe, erstes Projekt)

## Sprint 2 – App-Shell & Explorer
**Ziel:** Navigation steht, Projekte anlegbar.
- [ ] P1 Layout: Sidebar, Topbar, Content, Slide-Over-Container
- [ ] P1 Explorer: Ordner → Projekte, auf/zuklappen, komplett einklappbar (`Cmd+B`)
- [ ] P1 Projekt CRUD: Name, Key, Farbe (12er-Palette), Icon, Archivieren
- [ ] P2 Ordner CRUD, Drag & Drop Sortierung
- [ ] P2 Favoriten, User-Prefs persistieren
- [ ] P2 Standard-Status je Projekt anlegen, Status editierbar

## Sprint 3 – Tickets & Listenansicht
**Ziel:** Tickets anlegen, bearbeiten, in Liste sehen.
- [ ] P1 Ticket anlegen (Titel 500, Beschreibung 5000, Zähler sichtbar)
- [ ] P1 Ticket-Keys `KEY-123` (atomar hochzählen)
- [ ] P1 Priorität, Person, Enddatum, Status
- [ ] P1 Listenansicht: Gruppierung, Sortierung, Inline-Edit, Optimistic Updates
- [ ] P1 Slide-Over-Detailansicht, `Esc`, `↑/↓`
- [ ] P2 Labels
- [ ] P2 Mehrfachauswahl + Bulk-Aktionen
- [ ] P2 Aktivitätslog

## Sprint 4 – Kanban
**Ziel:** Board mit flüssigem Drag & Drop.
- [ ] P1 Board mit Spalten = Status (dnd-kit)
- [ ] P1 Fractional Indexing für Sortierung
- [ ] P1 Karte: Key, Titel, Priorität, Avatar, Fälligkeit, Unteraufgaben-Fortschritt
- [ ] P2 WIP-Limit je Spalte (visuelle Warnung)
- [ ] P2 Schnell-Anlage direkt in Spalte
- [ ] P3 Konfetti bei „Erledigt“ (abschaltbar)

## Sprint 5 – Unteraufgaben, Anhänge, Kommentare
**Ziel:** Ticket ist inhaltlich vollständig.
- [ ] P1 Unteraufgaben (max. 5, eine Ebene) + Trigger-Absicherung
- [ ] P1 Anhänge: WebP/JPEG/PNG, ≤ 100 KB, Magic-Byte-Check, S3-Upload
- [ ] P1 Client-Auto-Kompression zu WebP < 100 KB
- [ ] P2 Bildvorschau/Lightbox
- [ ] P2 Kommentare mit @Erwähnung
- [ ] P2 Leichtes Markdown in Beschreibung/Kommentaren

## Sprint 6 – Speed-Features & Meine Aufgaben
**Ziel:** Power-User lieben es.
- [ ] P1 Command Palette (`Cmd+K`)
- [ ] P1 Tastenkürzel + Hilfe-Overlay (`?`)
- [ ] P1 „Meine Aufgaben“ projektübergreifend
- [ ] P2 Quick-Add-Parser (`@person !prio ^datum`)
- [ ] P2 Filterleiste + gespeicherte Views
- [ ] P2 Volltextsuche (tsvector)

## Sprint 7 – Dashboard & Benachrichtigungen
**Ziel:** Überblick über Auslastung.
- [ ] P1 Auslastung pro User (gewichtet nach Priorität), Überlast-Ampel
- [ ] P1 Überfällige Tickets pro User/Projekt
- [ ] P1 Projekt-Gesundheit
- [ ] P2 Durchsatz (8 Wochen), Fälligkeits-Heatmap 14 Tage
- [ ] P2 Kacheln klickbar → gefilterte Liste
- [ ] P2 In-App-Inbox + täglicher E-Mail-Digest
- [ ] P3 Realtime via SSE auf Board/Liste

## Sprint 8 – API & MCP-Server
**Ziel:** Claude kann mit inhouseticket arbeiten.
- [ ] P1 Persönliche API-Tokens (erstellen, widerrufen, gehasht)
- [ ] P1 MCP-Endpunkt `/mcp` (Streamable HTTP)
- [ ] P1 Tools: `list_projects`, `search_tickets`, `get_ticket`, `create_ticket`, `update_ticket`
- [ ] P2 Tools: `add_comment`, `toggle_subtask`, `get_workload`, `list_members`
- [ ] P2 Rate-Limits, Aktivitätslog „via Claude“
- [ ] P2 Doku-Seite „Mit Claude verbinden“ (inkl. Config-Snippet)
- [ ] P3 OAuth 2.1 vorbereiten (Connector in claude.ai)

## Sprint 9 – Polish, Recht, Launch
**Ziel:** Live auf inhouseticket.com.
- [ ] P1 Performance-Budget prüfen (JS < 150 KB gz, LCP < 1,5 s)
- [ ] P1 Security-Review (Workspace-Scope, Rate-Limits, CSP)
- [ ] P1 Impressum, Datenschutz, AGB, AVV
- [ ] P1 Deployment EU (Container + managed Postgres + Backups), Domain, SSL
- [ ] P1 Landingpage (Claim, Screenshots, „Kostenlos bis 100 User“, MCP-Highlight)
- [ ] P2 Datenexport CSV/JSON, Workspace löschen
- [ ] P2 Mobile-Feinschliff, Dark Mode, Accessibility-Audit
- [ ] P2 Cookieless Analytics
- [ ] P3 Launch: Product Hunt, LinkedIn, t3n/Gründerszene-Pitch

---

## Backlog (nach MVP)
- Ticket-Vorlagen
- Wiederkehrende Tickets
- Abhängigkeiten (blockiert durch)
- Kalenderansicht
- Intake-Formular → Ticket (ohne Account)
- Slack/Teams-Benachrichtigungen
- OAuth-Connector für claude.ai
- SSO (Google Workspace / Microsoft Entra) als möglicher Pro-Plan
- Englische UI

## Risiken
| Risiko | Gegenmaßnahme |
|---|---|
| Spam-Workspaces | Firmen-Domain-Pflicht, Rate-Limit Registrierung, Disposable-Domain-Liste |
| Kosten bei „kostenlos“ | 100-KB-Limit, Bild-Storage minimal, Postgres effizient |
| Feature Creep | Backlog statt Sprint, Minimalismus-Check pro Story |
| Datenleck zwischen Workspaces | `requireMember()`, Security-Review-Prompt, E2E-Tests mit 2 Workspaces |
