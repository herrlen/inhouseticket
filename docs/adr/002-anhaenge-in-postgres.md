# ADR 002 – Bild-Anhänge in Postgres statt S3

**Datum:** 2026-10-04 · **Status:** angenommen (Len: „gerne weiter“ auf den Vorschlag) · **Sprint:** 5

## Kontext
KONZEPT sah S3-kompatiblen Speicher vor. Anhänge sind aber auf WebP/JPEG/PNG mit höchstens 100 KB
begrenzt, die App läuft als ein Container mit eigener Postgres auf mittwald.

## Entscheidung
- Bilder liegen als `bytea` in `attachment.data`, zusammen mit `mime`, `bytes`, Maßen und Dateiname.
- Prüfung serverseitig über die Dateisignatur (Magic Bytes), nicht über MIME-Header oder Endung;
  Maße werden aus dem Datei-Header gelesen.
- Die Datenbank erzwingt: Größe ≤ 102 400 Bytes, `octet_length(data) = bytes`, erlaubte MIME-Typen,
  höchstens 20 Anhänge pro Ticket (Trigger, wie bei Unteraufgaben).
- Ausgeliefert über `/api/w/{workspaceId}/attachments/{key}` nach Mitgliedschaftsprüfung, mit
  `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox` und privatem Langzeit-Cache
  (Inhalte ändern sich nie).
- Listen-Abfragen wählen `data` nie mit aus.

## Verworfene Alternativen
- **S3 (mittwald Object Storage o. ä.):** zweiter Dienst, Zugangsdaten, signierte URLs, eigener
  Lösch-Pfad – für ≤ 100 KB pro Bild unverhältnismäßig.
- **Dateisystem/Volume des App-Containers:** kein Backup zusammen mit der Datenbank, nicht
  transaktional mit den Zeilen.

## Folgen
- Backups der Datenbank enthalten die Bilder automatisch.
- Wachstum: 1.000 Bilder ≈ 100 MB. Bei deutlich mehr Last oder größeren Dateien auf S3 umziehen
  (nur Speicher- und Auslieferungsfunktionen in `src/db/queries/attachments.ts` betroffen).
