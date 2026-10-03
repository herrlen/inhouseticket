# ADR 001 – Datenmodell und Mandantentrennung in der Datenbank

**Datum:** 2026-10-03 · **Status:** angenommen · **Sprint:** 0

## Kontext
KONZEPT §6 beschreibt das Datenmodell. Better Auth bringt eigene Tabellen mit, und die
Mandantentrennung soll nicht nur in der App, sondern auch in der Datenbank halten.

## Entscheidungen

1. **Better-Auth-Tabellen sind die Benutzerbasis.** `user`, `session`, `account`, `verification`
   mit den von Better Auth erwarteten Feldern. KONZEPT-`user.avatar_url` heißt `image`.
   `user.id` ist `text` (von Better Auth erzeugt), alle eigenen Tabellen nutzen `uuid`.
2. **Jede Mandanten-Tabelle trägt `workspace_id`** – auch `status`, `label`, `subtask`,
   `comment` (in KONZEPT nicht vorgesehen). So filtert jede Query direkt, ohne Join.
3. **Zusammengesetzte Fremdschlüssel** sichern, dass Kind und Eltern im selben Workspace bzw.
   Projekt liegen: `ticket(project_id, workspace_id) → project`, `subtask/comment/attachment
   (ticket_id, workspace_id) → ticket`, `ticket(status_id, project_id) → status`,
   `ticket_label` über `project_id` an Ticket **und** Label. Ein Fehler in der App kann damit
   keine Zeile in einen fremden Workspace hängen.
4. **Limits doppelt:** Längen über `varchar(n)`, Anhänge per CHECK (Bytes, MIME), Priorität 0–4,
   Projekt-Key-Format; Unteraufgaben (≤ 5) und aktive Mitglieder (≤ 100) per Trigger mit
   `FOR UPDATE`-Sperre auf die Elternzeile gegen gleichzeitige Inserts. Zahlen müssen mit
   `src/lib/limits.ts` übereinstimmen – `src/db/__tests__/constraints.db.test.ts` prüft das.
5. **`user_pref` pro (User, Workspace)** statt nur pro User: Favoriten und aufgeklappte Ordner
   beziehen sich auf Projekte eines Workspaces. Zusätzlich `confetti` (abschaltbar laut KONZEPT §5.3).
6. **Ergänzungen gegenüber KONZEPT:** `workspace.color` (Onboarding §5.6), `invitation.role`
   und `accepted_at`, `project.created_at`, `saved_view.created_at`.
7. **Volltextsuche** als generierte Spalte `ticket.search` (`german`, Titel Gewicht A,
   Beschreibung B) mit GIN-Index.
8. **Sortierung** per Fractional Index als `text` (`sort`).
9. Spaltennamen in Postgres `snake_case`, in TypeScript `camelCase` (Drizzle `casing`).

## Verworfene Alternativen
- **Row Level Security:** stärker, aber jede Verbindung bräuchte `SET app.workspace_id`;
  mit Connection-Pool und Server Actions fehleranfällig. Kann vor dem Launch (Sprint 9,
  Security-Review) nachgerüstet werden – das Schema mit `workspace_id` überall ist darauf vorbereitet.
- **Einfache Fremdschlüssel + Prüfung nur in der App:** ein vergessener Check = Datenleck.
- **Limits nur in der App:** Race Conditions bei gleichzeitigen Inserts.

## Folgen
- Inserts müssen `workspace_id` (und bei `ticket_label` `project_id`) mitliefern.
- Ein User kann nicht gelöscht werden, solange er Tickets, Kommentare oder Anhänge angelegt
  hat (`created_by`/`author_id` ohne Cascade). Im MVP werden Mitglieder deaktiviert, nicht gelöscht.
