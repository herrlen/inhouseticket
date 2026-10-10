# Launch-Kit – inhouseticket.com

Alles, was zum Veröffentlichen auf Product Hunt, LinkedIn, bei t3n/Gründerszene und auf OMR Reviews gebraucht
wird. Stand 2026-10-10. Texte sind fertig zum Kopieren; Längenangaben beziehen sich auf die Grenzen der Plattformen.

## Eckdaten

| | |
|---|---|
| Name | inhouseticket |
| URL | https://inhouseticket.com |
| Claim (DE) | Tickets für dein Team – schnell, schlicht, kostenlos. |
| Tagline (EN) | Free, fast ticketing for teams – with Claude built in |
| Preis | Kostenlos, bis 100 Personen pro Workspace, alle Funktionen, keine Kreditkarte |
| Zielgruppe | Interne Teams in Firmen (Marketing, Agentur, IT, Ops) mit 2–100 Personen, DACH zuerst |
| Kategorie | Projektmanagement / Aufgabenverwaltung / Ticketsystem |
| Sprache | Deutsch (Englisch geplant) |
| Hosting | Deutschland (mittwald), DSGVO, AVV inklusive |
| Anbieter | Studio Luy UG (haftungsbeschränkt), Norderreihe 21, 22767 Hamburg |
| Kontakt | hello@inhouseticket.com |
| Status | Live, in aktiver Entwicklung – Feedback ausdrücklich erwünscht |

## Was es kann (Feature-Liste)

- **Tickets:** Titel, Beschreibung mit leichtem Markdown, Status, Priorität (4 Stufen), Person, Fälligkeit, Labels,
  bis zu 5 Unteraufgaben, Bilder (automatisch verkleinert), Kommentare mit @Erwähnung, Verlauf, Bulk-Aktionen
- **Projekte:** Farbe, Kürzel (WEB-12), eigene Status, Ordner, Favoriten, Archiv; Liste und Kanban mit WIP-Limits;
  Filter, gespeicherte Ansichten, Volltextsuche, „Meine Aufgaben“ projektübergreifend
- **Team:** Einladungen, Rollen Owner/Admin/Mitglied, Dashboard mit Auslastung, Überfälligem, Projekt-Gesundheit,
  Durchsatz und Fälligkeits-Heatmap; In-App-Inbox und täglicher E-Mail-Überblick
- **Tempo:** Optimistic Updates ohne Ladekreisel, Befehlspalette ⌘K, Tastenkürzel, Schnelleingabe
  `@Person !Priorität ^Termin`, Seiten unter 200 KB JavaScript
- **Claude/MCP:** eingebauter MCP-Server – als Connector in claude.ai (OAuth) oder in Claude Code/Claude Desktop
  (API-Token). Claude sucht, legt an, ändert, kommentiert, hakt Unteraufgaben ab, zeigt Auslastung; jede Änderung
  „via Claude“ im Verlauf
- **Daten:** Anmeldung per Magic Link mit Firmen-E-Mail, strikte Trennung der Workspaces, kein Tracking/keine
  Werbung, Export CSV/JSON, Workspace löschen, tägliche Backups
- **Barrierefreiheit:** komplett per Tastatur, Dark Mode, WCAG AA automatisch geprüft

**Nicht sagen:** „für immer kostenlos“ (Pro-Plan mit SSO steht im Backlog), „Import aus Jira/ClickUp/Notion/monday“
(erst nach Test mit echten Dateien), Logos fremder Tools.

## Bildmaterial

- Screenshots 1360 × 860, hell und dunkel: `public/landing/{list,board,dashboard}-{light,dark}.jpg`
  (neu erzeugen: `e2e/landing-screenshots.spec.ts`)
- Vorschaubild/OG-Bild: https://inhouseticket.com/opengraph-image (1200 × 630)
- Fehlt noch: Logo/Icon 240 × 240 (Product Hunt Thumbnail), kurzes Video/GIF (30–60 s: Ticket per Schnelleingabe →
  Board ziehen → Claude fragt „Was ist bei mir diese Woche fällig?“)

---

## Product Hunt (Englisch)

- **Name:** inhouseticket
- **Tagline (≤ 60):** `Free, fast ticketing for teams – with Claude built in`
- **Topics:** Productivity, Task Management, Project Management, Artificial Intelligence, Developer Tools
- **Link:** https://inhouseticket.com
- **Pricing:** Free
- **Launch:** Dienstag–Donnerstag, 00:01 PT (09:01 Uhr deutscher Zeit); Gallery: list, board, dashboard (je hell),
  danach Claude-Beispiel

**Description (≤ 260):**
> Ticketing for in-house teams that stays out of the way: list and Kanban, a workload dashboard, keyboard shortcuts
> for everything – and a built-in MCP server so Claude can search, create and update your tickets. Free for up to
> 100 people, hosted in Germany.

**Maker comment (erster Kommentar):**
> Hi Product Hunt 👋
>
> We run a small studio in Hamburg and got tired of ticket tools that are either slow, expensive per seat, or
> buried under features nobody uses. So we built inhouseticket – the tool we wanted for our own team:
>
> ⚡ Instant: every change shows up immediately, no spinners. ⌘K for everything, new tickets in one line
> (`@anna !high ^friday`).
> 🗂 Everything you need for tickets and projects: list + Kanban, subtasks, comments with @mentions, labels,
> saved views, full-text search, "My tasks" across projects.
> 📊 A workload dashboard that shows who's overloaded and what's overdue – no report building.
> 🤖 Claude as a teammate: inhouseticket ships an MCP server. Add it as a connector in claude.ai (or Claude
> Code/Desktop) and ask "What's due for me this week?" or "Create a ticket for Anna, high priority, due Friday."
> Every change is logged "via Claude".
> 🔒 Company email sign-in (magic link), strict workspace isolation, hosted in Germany, GDPR DPA included, no
> tracking.
>
> It's free for up to 100 people per workspace – all features, no credit card.
>
> It's still early and we ship every week. The UI is German for now (English is on the list). We'd love your
> feedback – what would make you switch? hello@inhouseticket.com

## LinkedIn (Deutsch)

**Post 1 – Launch (persönlich, von Len):**
> Wir haben ein Ticketsystem gebaut. Kostenlos. 🎟️
>
> Warum noch eins? Weil unsere Teams Tickets wollten, die einfach schnell sind – ohne Ladekreisel, ohne
> 30 Menüs, ohne Kosten pro Kopf.
>
> inhouseticket kann alles, was ein Team für Tickets und Projekte braucht:
> ✅ Liste und Kanban, Unteraufgaben, Kommentare, Labels, Suche
> ✅ Dashboard: Wer ist überlastet, was ist überfällig?
> ✅ ⌘K und Tastenkürzel für alles
> ✅ Claude als Kollege – eingebauter MCP-Server: „Was ist bei mir diese Woche fällig?“
> ✅ Gehostet in Deutschland, AVV inklusive, kein Tracking
>
> Kostenlos bis 100 Personen pro Workspace. Anmelden mit der Firmen-E-Mail, fertig.
>
> Wir sind noch mitten in der Entwicklung und bauen jede Woche weiter – Feedback und Wünsche gern in die
> Kommentare oder an hello@inhouseticket.com.
>
> 👉 inhouseticket.com
>
> #Projektmanagement #Produktivität #KI #Claude #MCP #SaaS #MadeInGermany

**Post 2 – Claude/MCP (eine Woche später):**
> „Leg im Website-Projekt ein Ticket für Anna an, Priorität hoch, fällig Freitag.“
>
> Das tippe ich inzwischen in Claude statt ins Ticketsystem. inhouseticket hat einen eingebauten MCP-Server:
> In claude.ai als Connector eintragen, anmelden, Workspace wählen – fertig. Claude arbeitet mit meinen Rechten,
> und jede Änderung steht „via Claude“ im Verlauf.
>
> Kostenlos, für Teams bis 100 Personen: inhouseticket.com

**Post 3 – Auslastung (Screenshot Dashboard):**
> Wer im Team hat gerade zu viel auf dem Tisch? Unser Dashboard gewichtet offene Tickets nach Priorität und zeigt
> eine Ampel pro Person – plus Überfälliges, Projekt-Gesundheit und was in den nächsten 14 Tagen fällig wird.
> Ohne Berichte basteln. inhouseticket.com

## Pressemitteilung / Pitch an t3n und Gründerszene

**Betreff:** Hamburger Studio bringt kostenloses Ticketsystem mit eingebautem Claude-Zugang (MCP)

> Hallo [Name],
>
> mit inhouseticket.com startet ein kostenloses Ticketsystem für Firmen-Teams bis 100 Personen – gehostet in
> Deutschland und als eines der ersten Tools im DACH-Raum mit eingebautem MCP-Server: Teams verbinden Claude
> direkt mit ihren Projekten und lassen Tickets per Satz anlegen, suchen und aktualisieren.
>
> Kurz die Fakten:
> – Liste und Kanban, Unteraufgaben, Kommentare, Volltextsuche, Auslastungs-Dashboard
> – Fokus auf Tempo: Änderungen ohne Ladezeit, alles per Tastatur
> – Anmeldung nur mit Firmen-E-Mail, Daten in Deutschland, AVV inklusive, kein Tracking
> – kostenlos bis 100 Personen pro Workspace, alle Funktionen
>
> Hinter inhouseticket steht die Studio Luy UG aus Hamburg. Gern schicke ich Screenshots, einen Testzugang oder
> stehe für ein kurzes Gespräch bereit.
>
> Viele Grüße
> Len Messerschmidt
> hello@inhouseticket.com · inhouseticket.com

Ansprechpartner recherchieren: t3n (Software & Tools), Gründerszene (Startups/Hamburg), zusätzlich
Hamburg Startups, Basic Thinking, Dr. Web.

## OMR Reviews

- **Produktname:** inhouseticket
- **Kategorien:** Projektmanagement-Software, Aufgabenmanagement-Software, Ticketsystem
- **Kurzbeschreibung (1 Satz):** Kostenloses, schnelles Ticketsystem für Firmen-Teams bis 100 Personen – mit
  Liste, Kanban, Auslastungs-Dashboard und eingebautem Claude-Zugang (MCP).
- **Langbeschreibung:** Feature-Liste oben verwenden, Abschnitte Tickets, Projekte, Team, Claude, Daten.
- **Preismodell:** Kostenlos (Free), keine Testphase
- **Deployment:** Cloud/SaaS, Hosting Deutschland
- **Sprachen:** Deutsch
- **Unternehmensgröße:** 1–100 Mitarbeitende pro Workspace
- **Integrationen:** Claude (claude.ai, Claude Code, Claude Desktop) über MCP, REST/MCP mit API-Token
- **Screenshots:** list, board, dashboard (hell)
- **Erste Bewertungen:** Beta-Firmen (studioluy.de, ursalz.com) per Mail bitten, Link aus dem OMR-Profil

## Checkliste Veröffentlichung

- [x] AGB und AVV geprüft und verlinkt
- [ ] Registrierung offen (`BETA_ALLOWED_DOMAINS=" "`), Indexierung an (`SITE_INDEXABLE=true`) – siehe `docs/betrieb.md`
- [ ] Externer Uptime-Check (z. B. UptimeRobot auf `/api/health`)
- [ ] Logo 240 × 240 und Demo-Video/GIF
- [ ] Google Search Console: Domain bestätigen, Sitemap `https://inhouseticket.com/sitemap.xml` einreichen
- [ ] Product Hunt: Account, Upcoming-Seite, Launch-Termin
- [ ] LinkedIn Post 1 am Launch-Tag, Post 2 und 3 im Wochenabstand
- [ ] Pitch-Mails an t3n und Gründerszene
- [ ] OMR-Profil anlegen, Beta-Firmen um Bewertung bitten
