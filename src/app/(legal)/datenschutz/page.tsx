import type { Metadata } from "next";
import { OPERATOR } from "@/lib/legal";

export const metadata: Metadata = { title: "Datenschutz" };

// Draft for the closed beta – describes what the app actually does. Review before public launch.
export default function DatenschutzPage() {
  return (
    <>
      <h1>Datenschutzerklärung</h1>
      <p className="text-[13px] text-muted">Stand: Oktober 2026 · geschlossene Beta</p>

      <h2>1. Verantwortlicher</h2>
      <p>
        {OPERATOR.name}, {OPERATOR.street}, {OPERATOR.city}, {OPERATOR.country}. Vertreten durch die Geschäftsführerin {OPERATOR.managingDirector}.
        E-Mail: <a className="text-accent underline" href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
      </p>

      <h2>2. Worum es geht</h2>
      <p>
        inhouseticket ist ein Ticketsystem für Teams einer Firma. Wir verarbeiten nur die Daten, die für Anmeldung, Zusammenarbeit im Workspace und
        einen sicheren Betrieb nötig sind. Es gibt keine Werbung, kein Tracking und keine Analyse-Cookies.
      </p>

      <h2>3. Welche Daten wir verarbeiten</h2>
      <ul>
        <li><strong>Konto:</strong> Firmen-E-Mail-Adresse, Name (aus der E-Mail-Adresse vorgeschlagen, änderbar), Rolle und Mitgliedschaft im Workspace.</li>
        <li><strong>Inhalte im Workspace:</strong> Projekte, Tickets, Beschreibungen, Labels und das Aktivitätsprotokoll („wer hat was wann geändert“).</li>
        <li><strong>Anmeldung:</strong> Für den Anmeldelink speichern wir einen einmal nutzbaren, verschlüsselt (gehasht) abgelegten Code für 15 Minuten.</li>
        <li><strong>Sitzungen:</strong> Für eine aktive Anmeldung speichern wir eine Sitzung mit IP-Adresse und Browser-Kennung (User-Agent), um Missbrauch erkennen zu können. Sitzungen laufen nach 30 Tagen ab und werden dann gelöscht.</li>
        <li><strong>Einladungen:</strong> E-Mail-Adresse der eingeladenen Person, wer eingeladen hat, Gültigkeit 7 Tage.</li>
      </ul>

      <h2>4. Zwecke und Rechtsgrundlagen</h2>
      <ul>
        <li>Bereitstellung des Dienstes und der Zusammenarbeit im Workspace: Art. 6 Abs. 1 lit. b DSGVO (Vertrag bzw. Nutzungsverhältnis).</li>
        <li>Sicherheit (Sitzungsdaten, Begrenzung von Anmeldeversuchen): Art. 6 Abs. 1 lit. f DSGVO, unser berechtigtes Interesse an einem sicheren Betrieb.</li>
        <li>Versand von Anmeldelinks und Einladungen per E-Mail: Art. 6 Abs. 1 lit. b DSGVO.</li>
      </ul>
      <p>
        Für die Inhalte, die ein Unternehmen in seinem Workspace anlegt, ist das jeweilige Unternehmen verantwortlich; wir verarbeiten sie in
        dessen Auftrag (Art. 28 DSGVO). Einen Auftragsverarbeitungsvertrag stellen wir auf Anfrage bereit.
      </p>

      <h2>5. Cookies</h2>
      <p>Wir setzen ausschließlich ein technisch notwendiges Cookie für die Anmeldung (Sitzung). Dafür ist keine Einwilligung erforderlich (§ 25 Abs. 2 TDDDG).</p>

      <h2>6. Hosting und E-Mail-Versand</h2>
      <p>
        inhouseticket läuft in einem Rechenzentrum in Deutschland bei der Mittwald CM Service GmbH &amp; Co. KG, Königsberger Straße 4–6,
        32339 Espelkamp, mit der ein Auftragsverarbeitungsvertrag besteht. Datenbank und E-Mail-Versand (Absender
        no-reply@inhouseticket.com) laufen ebenfalls dort. Beim Aufruf der Website verarbeitet der Hoster technisch notwendige Verbindungsdaten
        (z. B. IP-Adresse) zur Auslieferung. Schriftarten werden von unserem eigenen Server geladen, nicht von Drittanbietern.
      </p>

      <h2>7. Speicherdauer</h2>
      <p>
        Kontodaten und Workspace-Inhalte speichern wir, solange das Konto bzw. der Workspace besteht. Wird ein Mitglied aus einem Workspace
        entfernt, bleibt die Zuordnung früherer Tickets und Aktivitäten erhalten, damit der Verlauf nachvollziehbar bleibt. Sitzungen und
        Anmeldecodes löschen wir mit Ablauf automatisch.
      </p>

      <h2>8. Deine Rechte</h2>
      <p>
        Du hast das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit
        (Art. 20) und Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21 DSGVO). Schreib uns dazu an{" "}
        <a className="text-accent underline" href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>. Außerdem kannst du dich bei einer
        Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel beim Hamburgischen Beauftragten für Datenschutz und Informationsfreiheit.
      </p>
    </>
  );
}
