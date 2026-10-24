# inhouseticket

Schlankes, schnelles, kostenloses Ticketing für Firmen-Teams. Produkt: [docs/KONZEPT.md](docs/KONZEPT.md) ·
Planung: [docs/SPRINTPLANNING.md](docs/SPRINTPLANNING.md) · Regeln: [CLAUDE.md](CLAUDE.md), [docs/entwicklerregeln.md](docs/entwicklerregeln.md)

## Lokal starten

Voraussetzungen: Node ≥ 22, pnpm 10, Docker.

```bash
pnpm install            # setzt auch den Pre-Commit-Hook (.githooks)
cp .env.example .env    # BETTER_AUTH_SECRET mit `openssl rand -base64 32` ersetzen,
                        # APP_URL=http://localhost:3100 setzen und SITE_URL leeren
pnpm db:up              # Postgres 16 (Port 5442) + Mailpit (http://localhost:8025)
pnpm db:migrate
pnpm dev                # http://localhost:3100 · UI-Bausteine: /dev/ui
```

## Prüfen

```bash
pnpm lint && pnpm typecheck && pnpm test   # wie der Pre-Commit-Hook
pnpm test:db                               # Constraints/Trigger gegen Postgres
pnpm test:e2e                              # Playwright (einmalig: pnpm exec playwright install chromium)
```

## Adressen

| Host | Inhalt |
|---|---|
| `https://app.inhouseticket.com` (`APP_URL`) | App: Anmeldung, Workspaces, API, Links in Mails |
| `https://app.inhouseticket.com/mcp` | MCP-Endpunkt für Claude (Connector-URL; Anleitung in der App unter Einstellungen → Claude) |
| `https://inhouseticket.com` (`SITE_URL`) | Landingpage, „Umziehen“, Rechtstexte – App-Pfade leiten per 301 auf `app.` weiter |

Beide Hosts zeigen auf denselben Container. Details: [docs/betrieb.md](docs/betrieb.md), `src/lib/hosts.ts`.
