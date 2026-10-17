# ADR 004 – OAuth-Clients: unbekannte Weiterleitungsziele warnen, nicht sperren

**Datum:** 2026-10-17 · **Status:** angenommen (Security-Review 2026-10-17, Befund „Consent-Phishing“; Len hat die Behebung aller Befunde freigegeben)

## Kontext
Der MCP-Connector (claude.ai, Claude Desktop, Claude Code) registriert sich per dynamischer
Client-Registrierung (RFC 7591) – offen und ohne Anmeldung, wie MCP es vorsieht. Den `client_name`
wählt der Registrierende selbst. Bisher zeigte die Einwilligungsseite nur diesen Namen: Ein Angreifer
konnte „Claude“ mit eigener `redirect_uri` registrieren, einen Link auf den Authorize-Endpunkt
verschicken und bekam nach einem Klick auf „Erlauben“ den Code und damit dauerhaft MCP-Zugriff mit
den Rechten des Opfers.

Fälschen lässt sich der Name, nicht das Ziel: Den Authorization Code bekommt nur die registrierte
und in der signierten Anfrage genannte `redirect_uri`.

## Entscheidung
- Die Einwilligungsseite zeigt den **Host der Weiterleitung** groß („Nach dem Erlauben geht es weiter
  zu …“), nicht nur den Namen. Das Ziel stammt aus der signierten Anfrage und muss beim Client
  registriert sein (`src/lib/oauth-consent.ts`).
- **Allowlist** bekannter Ziele in `src/lib/oauth-client-trust.ts`:
  - `known`: `https://claude.ai`, `https://claude.com` – exakter Host, nur https, ohne Port.
    Subdomains zählen bewusst nicht dazu.
  - `loopback`: `localhost`, `127.0.0.1`, `[::1]` (Claude Desktop/Code, MCP Inspector). Der Code
    bleibt auf dem Gerät der Person; ein Angreifer aus der Ferne erhält ihn nicht.
  - `unknown`: alles andere, auch App-Schemata (`cursor://`, `vscode://`) – die kann jede App beanspruchen.
- Unbekannte Ziele: deutlicher Hinweis **„Nicht verifizierte Anwendung“**, der Name erscheint nur als
  „Eine Anwendung, die sich „…“ nennt“, und „Trotzdem erlauben“ ist erst nach einem Häkchen („Ich habe die
  Verbindung selbst gestartet und vertraue <host>“) aktiv. Die Server Action prüft dasselbe erneut.
- `client_name` wird bei der Registrierung bereinigt (Steuer- und Bidi-Zeichen raus, max.
  `MAX_OAUTH_CLIENT_NAME` = 60 Zeichen aus `limits.ts`) und bei der Anzeige noch einmal, damit alte
  Einträge und lange Namen den Host nicht verdrängen.

## Verworfene Alternativen
- **Registrierung nur für allowlistete Hosts:** schließt andere, legitime MCP-Clients aus (Cursor,
  VS Code, eigene Agenten, künftige Claude-Hosts). Ein Firmen-Ticketsystem soll mit jedem MCP-Client
  nutzbar bleiben. Kann später als Workspace-Einstellung („nur bekannte Apps“) kommen.
- **Clients von Hand freischalten (Betreiber):** widerspricht dem Selbstbedienungs-Connector und
  skaliert nicht.
- **Nur den Namen sperren („Claude“, „Anthropic“):** leicht zu umgehen (Homoglyphen, „Claude Pro“),
  und ein legitimer Name schützt nicht vor einem fremden Ziel.

## Folgen
- Bekannte Claude-Clients sehen keinen zusätzlichen Schritt.
- Neue offizielle Claude-Hosts müssen in `KNOWN_REDIRECT_HOSTS` nachgetragen werden; bis dahin
  erscheinen sie als „nicht verifiziert“ (funktionieren aber).
