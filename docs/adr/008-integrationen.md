# ADR 008 – Integrationen: Connector-Framework und ClickUp-Abgleich (nur lesend)

**Datum:** 2026-11-14 · **Status:** vorgeschlagen (PR `feat/clickup-api`)

## Kontext
Teams ziehen aus ClickUp um oder arbeiten eine Zeit lang parallel. Der CSV-Import (`src/lib/import/`) ist
ein einmaliger Umzug in ein neues Projekt; er kennt keine Personen-E-Mails, keine Hierarchie über eine Ebene
hinaus und keine laufenden Änderungen. Das Konzept (emuchat Redesign/Integrationen, Abschnitt 4) sieht ein
Connector-Framework vor, das später auch in emuchat läuft (Jira, Slack, Miro folgen).

## Entscheidung
- **Modul `src/lib/integrations/`** ohne React und ohne Next: `types.ts` (Connector-Schnittstelle:
  `testConnection`, `listContainers`, `listPeople`, `pull(scope, { since, startQuery, startPage })`,
  `pullComments`, optional `handleWebhook`), `registry.ts`, `providers.ts`, `crypto.ts`, `rate-limiter.ts`,
  `mapping.ts` (rein) und `clickup/` (Client, Connector, Fake für Tests). Datenbank-Seite in
  `src/db/queries/integrations.ts` (Verwaltung) und `integration-sync.ts` (Lease, Lauf-Protokoll, Schreiben);
  `engine.ts` verbindet beides. Für emuchat wandert der Ordner ohne `engine.ts`/Queries in ein gemeinsames Paket.
- **Tabellen** (Migration 0016): `integration` (ein Anbieter je Workspace, `credentials` versiegelt, `config` mit
  Auswahl und Wizard-Schritt, `status` setup/active/error, `locked_until` als Lease), `external_ref` (eindeutig je
  Integration, Typ, externe ID – macht den Abgleich idempotent; `external_parent_id` für die Hierarchie,
  `pending_detail` für Kommentare), `field_mapping` (Status, Person, Priorität), `sync_run` (Protokoll mit
  Zählern und Cursor). Alle mit `workspace_id`; Kinder hängen über `(integration_id, workspace_id)` an der
  Integration und fallen mit ihr bzw. mit dem Workspace weg. „Trennen“ löscht die Integration – Tickets bleiben.
- **Zugangsdaten:** AES-256-GCM, Schlüssel per HKDF-SHA256 aus `INTEGRATION_SECRET`, Format `v1:<iv>:<daten>`,
  AAD `integration.credentials:<id>` (ein kopierter Wert entschlüsselt in keiner anderen Zeile). Klartext nur auf
  dem Server; die UI zeigt `pk_…1234`. Fehlermeldungen und Logs enthalten nie Token oder Inhalte.
- **ClickUp** (API v2, geprüft 14.11.2026): `GET /team`, `/team/{id}/space`, `/space/{id}/folder`,
  `/space/{id}/list`, Aufgaben über `GET /team/{id}/task` mit `space_ids[]`/`list_ids[]` (je höchstens 20 IDs pro
  Anfrage), `page` ab 0, 100 pro Seite, `include_closed`, `subtasks`, `include_markdown_description`,
  `order_by=created`, Delta über `date_updated_gt` (Unix-ms). Kommentare `GET /task/{id}/comment` (25 pro Seite,
  ältere über `start`+`start_id`). Rate-Limiter je Token (90/min), bei 429 Pause bis `X-RateLimit-Reset`
  (Sekunden oder ms – die Doku nennt keine Einheit; geklemmt auf 1 s … 2 min), 5xx mit Backoff.
- **Abbildung:** Projekt je Space (`config.projectMode = "space"`; „je Liste“ ist vorbereitet, nicht angeboten),
  Ordner und Liste als Labels, Tags als Labels, Meilenstein als Label „Meilenstein“. Status: Vorschlag aus
  ClickUp-Typ (`open` → Offen, `closed`/`done` → Erledigt) und Name; Unklares wird „eigener Status“ (gleicher
  Name im Projekt, Kategorie geraten). Priorität 1–4 → Dringend/Hoch/Mittel/Niedrig. Erste zugewiesene Person,
  Zuordnung per E-Mail (nicht zugeordnet → unzugewiesen). Checkliste: die ersten 5 Punkte in die Checkliste,
  der Rest als Markdown in die Beschreibung (wie der CSV-Import).
- **Hierarchie:** inhouseticket kennt eine Unteraufgaben-Ebene, ClickUp bis zu sieben. Jede Aufgabe hängt als
  Unteraufgabe unter ihrem obersten abgeglichenen Vorfahren (wie der CSV-Import Unter-Unteraufgaben faltet).
  Die Verknüpfung passiert nach allen Aufgaben eines Laufs (Reihenfolge der Seiten egal): erst lösen, dann
  anhängen. Kein Elternteil, wenn der Vorfahr nicht abgeglichen ist (Liste nicht gewählt), in einem anderen
  Space liegt oder die Kette eine Schleife bildet. Von Hand gesetzte Eltern (z. B. ein lokales Epic) bleiben,
  solange ClickUp keinen Elternteil vorgibt; was die Regeln verletzt, zählt als `unlinked`.
- **Lauf:** Phasen `tasks` (seitenweise, Cursor nach jeder Seite) → `links` → `comments` (höchstens 4 min je Lauf,
  Rest im nächsten). Unveränderte Aufgaben (gleiches `date_updated`) werden übersprungen. Delta ab dem neuesten
  `date_updated` des letzten fehlerfreien Laufs minus 60 s; nach geänderter Auswahl einmal alles.
- **Einzelner Lauf:** Lease-Spalte statt Advisory Lock: postgres-js verteilt Abfragen über einen Pool, ein
  Session-Lock müsste auf einer reservierten Verbindung über den ganzen Lauf gehalten werden. Die Lease läuft
  nach 5 Minuten ohne Verlängerung ab, ein abgestürzter Lauf blockiert also nicht dauerhaft.
- **Polling** alle 5 Minuten im App-Container (`instrumentation.ts`, nur Produktion); „Jetzt abgleichen“ startet
  sofort per `after()`. Webhooks: nur als TODO in der Schnittstelle (`handleWebhook`).

## Bewusst (noch) nicht
- Schreiben nach ClickUp, Löschungen (das Delta zeigt gelöschte Aufgaben nicht; erst mit Webhooks), Anhänge,
  Zeitschätzung/-erfassung, Startdatum, weitere Zuständige als Beobachter (gibt es in inhouseticket nicht).
- Verschieben zwischen Projekten: wandert eine Aufgabe in ClickUp in einen anderen Space, bleibt das Ticket in
  seinem Projekt (ein Umzug würde es umnummerieren). Lokal gelöschte Tickets werden nicht neu angelegt.
- Labels werden nur ergänzt, nie entfernt; die Checkliste wird nur beim Anlegen übernommen.

## Verworfene Alternativen
- **Gemeinsames Paket sofort:** inhouseticket ist kein Monorepo; das Modul ist so geschnitten, dass es später
  ohne Umbau umzieht.
- **Advisory Lock:** siehe oben. **Alles im Speicher sammeln, dann schreiben:** 17 000 Aufgaben passen nicht
  sicher in 512 MB und wären nach einem Neustart verloren.
- **Projekt je Liste:** ein großer ClickUp-Workspace hat Hunderte Listen; als Option vorbereitet.
