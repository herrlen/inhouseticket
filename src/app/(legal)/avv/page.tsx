import type { Metadata } from "next";
import { DraftNotice } from "@/components/draft-notice";
import { OPERATOR } from "@/lib/legal";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Auftragsverarbeitungsvertrag", robots: { index: false } };

// Draft data processing agreement (Art. 28 GDPR). The technical measures describe what the code and
// operations actually do (docs/security-review.md, docs/betrieb.md). Review by a lawyer before use.
export default function AvvPage() {
  return (
    <>
      <h1>Auftragsverarbeitungsvertrag (AVV)</h1>
      <p className="text-[13px] text-muted">nach Art. 28 DSGVO · Stand: Oktober 2026</p>
      <DraftNotice />
      <PrintButton />

      <p>
        zwischen dem Kunden, der einen Workspace auf inhouseticket.com nutzt („Verantwortlicher“), und der {OPERATOR.name}, {OPERATOR.street},{" "}
        {OPERATOR.city} („Auftragsverarbeiter“). Der Vertrag gilt mit dem Anlegen eines Workspace als geschlossen und endet mit dessen Löschung.
      </p>

      <h2>1. Gegenstand, Art und Zweck</h2>
      <p>
        Der Auftragsverarbeiter betreibt für den Verantwortlichen das Ticketsystem inhouseticket: Speichern, Anzeigen, Ändern, Durchsuchen,
        Exportieren und Löschen der Inhalte des Workspace sowie Versand von Anmeldelinks, Einladungen und Benachrichtigungen per E-Mail.
      </p>

      <h2>2. Daten und betroffene Personen</h2>
      <ul>
        <li><strong>Betroffene:</strong> Mitglieder und eingeladene Personen des Workspace; Personen, die in Tickets oder Kommentaren genannt werden.</li>
        <li><strong>Daten:</strong> Name, geschäftliche E-Mail-Adresse, Rolle; Inhalte von Projekten, Tickets, Unteraufgaben, Kommentaren und Bild-Anhängen; Aktivitätsprotokoll; Benachrichtigungen; technische Daten der Anmeldung (Sitzung mit IP-Adresse und Browser-Kennung, API-Tokens als Hash).</li>
        <li>Besondere Kategorien (Art. 9 DSGVO) sind nicht vorgesehen; der Verantwortliche stellt sicher, dass solche Daten nicht eingegeben werden.</li>
      </ul>

      <h2>3. Weisungen</h2>
      <p>
        Der Auftragsverarbeiter verarbeitet die Daten nur auf dokumentierte Weisung des Verantwortlichen. Weisungen sind die Nutzung der Anwendung
        durch berechtigte Mitglieder sowie Anweisungen per E-Mail an {OPERATOR.email}. Hält der Auftragsverarbeiter eine Weisung für rechtswidrig,
        teilt er das unverzüglich mit.
      </p>

      <h2>4. Pflichten des Auftragsverarbeiters</h2>
      <ul>
        <li>Personen mit Zugang zu den Daten sind zur Vertraulichkeit verpflichtet.</li>
        <li>Er trifft die technischen und organisatorischen Maßnahmen nach Anlage 1 und passt sie dem Stand der Technik an, ohne das Schutzniveau zu senken.</li>
        <li>Er unterstützt den Verantwortlichen bei Anfragen Betroffener (Art. 15–22 DSGVO), insbesondere durch Export und Löschung in der Anwendung, sowie bei den Pflichten nach Art. 32–36 DSGVO.</li>
        <li>Verletzungen des Schutzes personenbezogener Daten meldet er unverzüglich, spätestens innerhalb von 48 Stunden nach Kenntnis, an den Besitzer des Workspace.</li>
        <li>Er stellt die zum Nachweis nötigen Informationen bereit und ermöglicht Überprüfungen nach angemessener Ankündigung; bevorzugt durch schriftliche Auskunft.</li>
      </ul>

      <h2>5. Unterauftragsverarbeiter</h2>
      <p>Der Verantwortliche stimmt dem Einsatz folgender Unterauftragsverarbeiter zu:</p>
      <ul>
        <li>Mittwald CM Service GmbH &amp; Co. KG, Königsberger Straße 4–6, 32339 Espelkamp – Hosting der Anwendung und Datenbank, Sicherungskopien, E-Mail-Versand; Rechenzentrum in Deutschland.</li>
      </ul>
      <p>
        Über neue oder geänderte Unterauftragsverarbeiter informiert der Auftragsverarbeiter mindestens vier Wochen vorher per E-Mail; der
        Verantwortliche kann aus wichtigem Grund widersprechen und den Workspace löschen. Eine Übermittlung in Drittländer findet nicht statt.
      </p>
      <p>
        Verbindet ein Mitglied den Workspace mit einem KI-Assistenten (z. B. Claude von Anthropic), ruft dieser Daten im Namen und mit den Rechten
        des Mitglieds ab. Der Anbieter des Assistenten ist kein Unterauftragsverarbeiter des Auftragsverarbeiters; über diese Nutzung entscheidet der Verantwortliche.
      </p>

      <h2>6. Löschung und Rückgabe</h2>
      <p>
        Der Verantwortliche kann alle Daten jederzeit exportieren (JSON/CSV). Mit dem Löschen des Workspace werden die Daten aus der laufenden
        Anwendung sofort entfernt; in Sicherungskopien verbleiben sie höchstens 30 Tage und werden dann überschrieben.
      </p>

      <h2>Anlage 1: Technische und organisatorische Maßnahmen</h2>
      <ul>
        <li><strong>Standort:</strong> Betrieb ausschließlich in einem Rechenzentrum in Deutschland (mittwald); dessen Maßnahmen zur physischen Sicherheit gelten ergänzend.</li>
        <li><strong>Mandantentrennung:</strong> Jede Datenbankabfrage ist auf den Workspace beschränkt; zusammengesetzte Fremdschlüssel verhindern Verknüpfungen über Workspaces hinweg; Zugriff nur für aktive Mitglieder.</li>
        <li><strong>Zugang:</strong> Anmeldung ohne Passwort per einmaligem, 15 Minuten gültigem Link; nur geschäftliche E-Mail-Adressen; Rollen (Besitzer, Admin, Mitglied); Begrenzung von Anmelde-, Einladungs- und API-Anfragen.</li>
        <li><strong>Geheimnisse:</strong> Anmeldecodes, API- und OAuth-Tokens nur als Hash gespeichert; API-Tokens widerrufbar und mit wählbarem Ablauf; Verbindungen zu KI-Assistenten jederzeit trennbar.</li>
        <li><strong>Übertragung:</strong> ausschließlich verschlüsselt (TLS); Sicherheits-Header und Content-Security-Policy gegen eingeschleuste Inhalte; Prüfung der Herkunft bei schreibenden Anfragen.</li>
        <li><strong>Eingaben:</strong> Prüfung aller Eingaben auf dem Server; Bild-Anhänge werden am Dateiinhalt erkannt, nur WebP, JPEG und PNG bis 100 KB; Inhalte werden ohne ausführbares HTML dargestellt.</li>
        <li><strong>Nachvollziehbarkeit:</strong> Aktivitätsprotokoll je Ticket (wer, was, wann, ob über einen KI-Assistenten).</li>
        <li><strong>Verfügbarkeit:</strong> tägliche Sicherung der Datenbank (konsistenter Dump) und tägliches Projekt-Backup beim Hoster, Aufbewahrung 30 Tage; dokumentiertes Wiederherstellungsverfahren.</li>
        <li><strong>Betrieb:</strong> Änderungen werden vor dem Ausrollen automatisch getestet; administrativer Zugang nur für Personen des Auftragsverarbeiters; die Betreiberübersicht zeigt nur Kennzahlen, keine Inhalte.</li>
      </ul>
    </>
  );
}
