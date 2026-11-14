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
  sofort per `after()`. Webhooks: siehe Nachtrag unten (Polling dann alle 30 Minuten).

## Nachtrag 2026-11-14: ClickUp-CSV-Import über denselben Weg (PR `feat/clickup-csv`, Migration 0017)
Ein echter Workspace-Export (12,8 MB, 17.806 Zeilen, 17.120 Aufgaben, 33 Spaces, 62 Status, 10.326 Unteraufgaben)
lief durch den alten CSV-Import nicht (5 MB / 5.000 Tickets, ein Projekt, Unteraufgaben als Checkliste).
- **Eine Quelle mehr, kein zweiter Weg:** `src/lib/import/clickup.ts` liest jede Zeile als `ExternalTask`
  (dieselbe Form wie der Connector); `src/lib/integrations/csv-import.ts` schreibt über den `SyncWriter`
  (`createOnly`, Personen per Name). Damit gelten Projekt je Space, Ordner/Liste/Tags/„Meilenstein“ als Labels,
  Status über `field_mapping`, Checklisten-Regel, Hierarchie (`linkHierarchy`) und Idempotenz über `external_ref`
  unverändert. Jira, Notion und monday.com bleiben beim alten Import.
- **Integration ohne Token:** Ohne API-Verbindung legt der Import eine `integration`-Zeile ohne Zugangsdaten an
  (`credentials = ''`, kein `tokenHint`, Status `setup`); die Einstellungen zeigen „Nicht verbunden“. Wird später
  ein Token eingetragen, füllt er diese Zeile – der API-Abgleich erkennt die importierten Aufgaben an der Task-ID.
  Projekte: Die CSV kennt nur Space-Namen (`csv:<name>`); `projectFor()` übernimmt ein Projekt dieser Integration
  mit dem Namen des Space, in beide Richtungen. Kommentare haben in der CSV keine IDs (abgeleitet aus Task,
  Position und Inhalt); gleicher Text innerhalb von zwei Minuten gilt beim jeweils anderen Weg als derselbe
  Kommentar. Vorhandene Tickets fasst der CSV-Import nie an (die CSV ist der ältere Stand).
- **Datei:** `import_upload` (Text in Postgres wie Anhänge in ADR 002, kein Volume), höchstens 50 MB und
  50.000 Zeilen (`limits.ts`); eine nicht gestartete Datei je Workspace, nach dem Lauf gelöscht, Reste nach 24 h.
  Gelesen wird zeilenweise (`csvRows()`), Dubletten nach Task-ID verworfen.
- **Lauf:** `sync_run` mit `trigger = 'csv'` und eigenem Cursor (`uploadId`, Phase, erledigte Aufgaben). Hält die
  Lease der Integration (nie neben einem API-Lauf); Stand alle 100 Aufgaben; nach einem Neustart setzt der
  Poller oder die Fortschrittsabfrage der Seite fort. Datenbankfehler: bis zu drei Versuche, dann Abbruch mit
  Fehler (angelegte Tickets bleiben). API-Läufe übergehen CSV-Läufe (`openRun`, `lastDeltaMark`).
- **Gemessen** (lokal, echter Export): 17.120 Tickets, 6.959 Kommentare, 33 Projekte in 230 s; derselbe Export
  noch einmal: 0 neu in 27 s.
- **Verworfen:** geparste Zeilen einzeln speichern (mehr Schreiblast, gleiche Wirkung wie die Datei neu zu lesen –
  das dauert 0,4 s); Anhänge herunterladen (Links bleiben in der Beschreibung).

## Nachtrag 2026-11-14: Webhooks (Echtzeit, PR `feat/clickup-webhooks`, Migration 0018)
- **ClickUp-Doku geprüft (14.11.2026):** `POST /team/{team_id}/webhook` mit `endpoint`, `events` und optional
  *einem* Ort (`space_id`/`folder_id`/`list_id`/`task_id`); Antwort `{ id, webhook: { id, secret, health } }`.
  `GET /team/{team_id}/webhook` liefert nur die Webhooks des eigenen Tokens mit `health.status`/`fail_count`,
  `DELETE /webhook/{id}` → `{}`. Signatur: Header `X-Signature`, HMAC-SHA256 des Bodys mit dem Secret, hex.
  Ereignisse: `{ event, task_id, webhook_id, history_items? }` (bei `taskDeleted` ohne `history_items`). Abweichungen
  bzw. Ergänzungen gegenüber der Annahme: ClickUp wertet eine Antwort > 7 s oder ohne 2xx als Fehlschlag (5 Versuche,
  dann ist das Ereignis weg), sperrt bei `fail_count` 100 **und sofort bei 401 oder 410**; Reaktivieren per
  `PUT /webhook/{id}`. Keine festen Absender-IPs. Kein `last_page`/keine Einheit dokumentiert (wie gehabt).
- **Ein Webhook je Integration** für `taskCreated`, `taskUpdated`, `taskDeleted`, `taskMoved`, `taskStatusUpdated`,
  `taskAssigneeUpdated`, `taskPriorityUpdated`, `taskDueDateUpdated`, `taskTagUpdated`, `taskCommentPosted`,
  `taskCommentUpdated`. Ein Ortsfilter nur, wenn genau ein ganzer Space gewählt ist; sonst für den ganzen
  ClickUp-Workspace – was nicht zur Auswahl gehört, verwirft der Abgleich beim Lesen der Aufgabe. Registriert nur
  mit öffentlicher Adresse (Produktion, `APP_URL` https); neu nach Auswahl-Änderung und Token-Ersatz (Webhooks hängen
  am Token), entfernt bei „Trennen“. Id und Secret versiegelt in `integration.webhook` (gleiche Krypto, AAD
  `integration.webhook:<id>`), dazu `webhook_status` (`active`/`failing`/`failed`), `webhook_event_at`,
  `webhook_checked_at`. Scheitert die Registrierung: `failed`, Polling alle 5 Minuten, stündlich neuer Versuch.
- **Endpunkt** `POST /api/integrations/clickup/webhook/[integrationId]` (Route Handler; der Proxy läuft für `/api`
  nicht, `noindex` kommt aus `next.config.ts`, kein Same-Origin-Check – Aufrufer ist ClickUp): Body höchstens
  256 KB, Signatur in konstanter Zeit **vor** dem Parsen. Unbekannte, getrennte, gesperrte (Token abgelehnt) oder
  webhooklose Integration → dasselbe 404; falsche/fehlende Signatur → 401 (sperrt bei ClickUp nur einen
  verwaisten alten Webhook – gewollt). Fehlversuche zählen je Adresse und Integration (120/min), gültige Ereignisse
  je Integration (600/min, darüber ein Delta-Abgleich statt Einzelabrufen). Antwort sofort 204.
- **Verarbeitung:** Das Ereignis landet in `integration_event` (eine Zeile je Aufgabe und Art, ein zweites Ereignis
  erneuert nur die Zeit; höchstens 5 000 offene Zeilen, sonst Delta-Abgleich). Nach der Antwort (`after()`) holt
  `processWebhookEvents()` unter dem Lease der Integration jede Aufgabe per `GET /task/{id}` und schreibt sie über den
  `SyncWriter` – gleiche Abbildung, Idempotenz über `date_updated`, Hierarchie (`linkHierarchy`), Kommentare
  (Kommentar-Ereignisse setzen `pending_detail`, höchstens 60 s je Stapel). Hält ein Abgleich den Lease, warten die
  Ereignisse; der Poller arbeitet sie jede Minute ab. Webhook-Stapel schreiben kein `sync_run` (das Protokoll
  bliebe sonst voller Einzelereignisse) und verschieben weder `last_sync_at` noch die Delta-Marke.
- **`taskDeleted`:** nur lesend und „lokal gelöscht bleibt gelöscht“ → das Ticket wird **nicht** gelöscht, sondern
  bekommt das Label „In ClickUp gelöscht“ (Labels werden nur ergänzt). Wer aufräumen will, filtert danach.
- **Polling bleibt Sicherheitsnetz:** alle 30 Minuten, solange `webhook_status = active`, sonst alle 5. Nach jedem
  geplanten Lauf prüft `maintainWebhook()` die Gesundheit bei ClickUp: `failing` → Status `failing` (wieder alle 5
  Minuten), gesperrt/fehlt/andere Adresse → neu registrieren (statt `PUT` reaktivieren: neues Secret, alte Lücke
  holt das Delta).
- **Verworfen:** Ereignisinhalt (`history_items`) direkt übernehmen – unvollständig je Ereignistyp, keine
  Reihenfolge-Garantie; die Aufgabe frisch zu lesen kostet einen Aufruf und nutzt den erprobten Weg. Einen Webhook je
  Space/Liste – bei vielen gewählten Listen Dutzende Registrierungen; Filtern beim Lesen ist billiger.

## Bewusst (noch) nicht
- Schreiben nach ClickUp, Löschen von Tickets (gelöschte Aufgaben bekommen nur ein Label, siehe Webhooks), Anhänge,
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
