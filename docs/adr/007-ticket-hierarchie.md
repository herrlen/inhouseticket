# ADR 007 – Ticket-Hierarchie wie Jira (Epic → Story/Aufgabe → Unteraufgabe)

**Datum:** 2026-11-13 · **Status:** angenommen (Entscheidung des Besitzers; identisch in emuchat)

## Kontext
Tickets standen bisher flach nebeneinander, die einzige Gliederung war die Checkliste (Tabelle `subtask`,
höchstens 5 Punkte, nur abhaken). Teams, die aus Jira kommen, erwarten Epics mit Stories/Aufgaben darin und
Unteraufgaben als eigene Tickets (Status, Person, Kommentare). emuchat bekommt dieselben Regeln; Export und
Umzug müssen beide Seiten gleich lesen.

## Entscheidung
- `ticket.type` (Enum `ticket_type`: `epic`, `story`, `task`, `subtask`, Standard `task`, bestehende Tickets
  werden `task`) und `ticket.parent_id`.
- Regeln (einmal in `src/lib/ticket-hierarchy.ts`, von Server und UI genutzt): Epic hat nie Eltern;
  Story/Aufgabe optional ein Epic; Unteraufgabe braucht eine Story oder Aufgabe. Ein Typwechsel ist nur
  erlaubt, wenn danach das Ticket **und** alle Kinder die Regeln erfüllen. Die Abfragen
  (`assertHierarchy()` in `db/queries/tickets.ts`) prüfen vorab und liefern lesbare Codes.
- Zweite Verteidigungslinie in der Datenbank (Migration `0015_ticket_hierarchy_rules.sql`):
  - FK `(parent_id, project_id) → ticket (id, project_id)`: Eltern immer im selben Projekt (und damit
    Workspace). **DEFERRABLE INITIALLY DEFERRED**, damit der Lösch-Trigger die Kinder nach dem Elternteil
    bereinigen kann.
  - Trigger `enforce_ticket_hierarchy` (BEFORE INSERT/UPDATE OF type, parent_id, project_id) mit
    denselben Codes (`ticket_hierarchy:<code>`); das Elternticket wird `FOR SHARE` gelesen, damit ein
    gleichzeitiger Typwechsel wartet und das neue Kind sieht.
  - Trigger `ticket_children_on_delete` (AFTER DELETE): Unteraufgaben eines gelöschten Tickets werden
    mitgelöscht (Kommentare, Anhänge – Bytes liegen in Postgres, ADR 002 – und Checklisten per Cascade),
    Stories/Aufgaben eines gelöschten Epics verlieren nur `parent_id`. AFTER statt BEFORE, weil ein
    BEFORE-Trigger beim Löschen ganzer Projekte/Workspaces („tuple already modified“) scheitern würde.
- Die Checkliste bleibt (UI-Name „Checkliste“); ein Punkt lässt sich bei Story/Aufgabe „In Unteraufgabe
  umwandeln“ (`convertChecklistItem()`: neues Ticket Typ `subtask`, Titel/Person/Fälligkeit/erledigt
  übernommen, Punkt entfernt, Verlauf am Elternticket).
- Export (Version bleibt 2): pro Ticket `type` und `parentNumber` (Nummer des Elterntickets im selben
  Projekt, sonst `null`). Leser behandeln fehlende Felder als `task` ohne Eltern.

## Verworfen
- **`ON DELETE SET NULL` am FK:** würde Unteraufgaben ohne Eltern zurücklassen, was die Regel verbietet.
- **`ON DELETE CASCADE` am FK:** würde auch Stories eines gelöschten Epics löschen.
- **Nur App-Prüfung:** gleichzeitige Änderungen (Typwechsel des Elterntickets während ein Kind entsteht)
  könnten die Regeln umgehen; Limits und Regeln gelten hier immer doppelt (Entwicklerregeln §4).
- **Unteraufgaben als Ausbau der Checkliste:** Checklistenpunkte haben keinen Status, keine Kommentare und
  sind auf 5 begrenzt; Unteraufgaben als eigene Tickets passen zu Liste, Board, Suche und MCP ohne Sonderwege.
