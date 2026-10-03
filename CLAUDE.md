# CLAUDE.md – inhouseticket.com

Kontextdatei für Claude Code. Liegt im Repo-Root und wird bei jeder Session automatisch gelesen.

## Was ist das?
Schlankes, sehr schnelles, kostenloses Ticketing-System für Firmen-Teams. Liste + Kanban, Explorer-Sidebar (einklappbar), Auslastungs-Dashboard, MCP-Server für Claude. Details: `docs/KONZEPT.md`. Reihenfolge: `docs/SPRINTPLANNING.md`. Arbeitsweise: `docs/entwicklerregeln.md`.

@AGENTS.md

## Stack
- Next.js 16 (App Router, `output: standalone`), TypeScript strict, Tailwind CSS 4 (Tokens per `@theme` in `globals.css`, keine `tailwind.config`)
- PostgreSQL + Drizzle ORM (`src/db/schema.ts`, Migrations in `drizzle/`)
- Better Auth (Magic Link, nur Firmen-Domains)
- TanStack Query (Client-Cache, Optimistic Updates), dnd-kit (Kanban)
- Zod (Validierung Client + Server)
- S3-kompatibler Storage für Anhänge
- Vitest (Unit), Playwright (E2E)
- Docker, EU-Hosting

## Befehle
```bash
pnpm dev            # Dev-Server auf http://localhost:3100 (UI-Vorschau: /dev/ui)
pnpm build          # Production-Build
pnpm lint           # ESLint
pnpm typecheck      # tsc --noEmit
pnpm test           # Vitest (Unit, ohne DB)
pnpm test:db        # Vitest gegen Postgres (Constraints, Trigger)
pnpm test:e2e       # Playwright
pnpm db:up          # Postgres 16 (Port 5442) + Mailpit (8025) per docker compose
pnpm db:generate    # Drizzle Migration erzeugen
pnpm db:migrate     # Migration ausführen
pnpm db:studio      # Drizzle Studio
```

## Ordnerstruktur
```
src/
  app/                 # Routen (App Router)
    (auth)/            # Login, Verify
    (app)/[workspace]/ # Eingeloggter Bereich
    api/               # REST + MCP-Endpunkt
  components/
    ui/                # Primitives (Button, Badge, Avatar …)
    tickets/ board/ explorer/ dashboard/
  db/                  # schema.ts, client.ts, queries/
  lib/
    limits.ts          # ALLE Limits zentral
    validation/        # Zod-Schemas
    auth.ts
    freemail.ts        # Blockliste Freemail-Domains
  mcp/                 # MCP-Server (Tools)
docs/
  KONZEPT.md
  SPRINTPLANNING.md
  entwicklerregeln.md
```

## Harte Regeln
1. **Mandantentrennung:** Jede Query filtert nach `workspaceId`. Nie ohne. Zugriff immer über `requireMember({ slug })` bzw. `requireMember({ workspaceId })` oder `requireRole(…, "admin")` aus `src/lib/authz.ts` – Nicht-Mitglieder bekommen 404. Server Actions prüfen selbst erneut (nie auf die Seite verlassen).
2. **Limits nur aus `src/lib/limits.ts`:**
   - `MAX_USERS_PER_WORKSPACE = 100`
   - `MAX_TITLE = 500`, `MAX_DESCRIPTION = 5000`
   - `MAX_SUBTASKS = 5` (nur eine Ebene)
   - `MAX_ATTACHMENT_BYTES = 100 * 1024`
   - `ALLOWED_MIME = ['image/webp','image/jpeg','image/png']` → serverseitig per Magic-Bytes prüfen, nicht nur MIME-Header
3. **Firmen-E-Mail:** Registrierung mit Freemail-Domain (gmail, gmx, web.de, t-online, outlook, hotmail, yahoo, icloud, proton …) wird abgelehnt. Liste in `src/lib/freemail.ts`, erweiterbar.
4. **Speed:** Optimistic Updates für Status, Priorität, Zuweisung, Drag & Drop. Keine Spinner bei Inline-Edits. Keine schweren Libraries (kein Moment.js, kein Lodash komplett, keine UI-Kits mit großem Runtime).
5. **Barrierefreiheit:** Alle Aktionen per Tastatur, Fokus-Ringe sichtbar, Kontrast WCAG AA – auch bei den bunten Farben.
6. **Sprache:** UI Deutsch (i18n-fähig vorbereitet), Code/Kommentare Englisch.

## Design-Tokens (Kurzfassung)
- Basis: neutral, viel Weißraum, Radius 10 px, 1 px Borders statt Schatten.
- Farbe kommt über **Projektfarben**, **Prioritäten** und **Status** – nicht über Flächen.
- Font: Inter (UI), JetBrains Mono (Ticket-Keys).
- Details siehe `docs/KONZEPT.md` → Abschnitt Design.

## Definition of Done
- Typecheck, Lint, Tests grün
- Limits serverseitig erzwungen + getestet
- Funktioniert per Tastatur und in Dark Mode
- Kein Query ohne Workspace-Scope
