import type { Metadata } from "next";
import { GermanOnly } from "@/components/german-only";
import { OPERATOR } from "@/lib/legal";

export const metadata: Metadata = { title: "Datenschutz" };

// Describes what the app actually does; reviewed by a lawyer (2026-10-10). Added afterwards and not yet reviewed: section 5 (Matomo),
// and on 2026-10-17 password, reset, no-password link, rate limits (section 3/4), the lang cookie (section 7),
// and on 2026-10-18 registration with password and its pending data (sections 3, 4, 9; ADR 005).
// Keep in sync with new features.
export default function DatenschutzPage() {
  return (
    <GermanOnly>
      <h1>Datenschutzerklärung</h1>
      <p className="text-[13px] text-muted">Stand: 18. Oktober 2026</p>

      <h2>1. Verantwortlicher</h2>
      <p>
        {OPERATOR.name}, {OPERATOR.street}, {OPERATOR.city}, {OPERATOR.country}. Inhaber: {OPERATOR.owner}.
        E-Mail: <a className="text-accent underline" href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
      </p>

      <h2>2. Worum es geht</h2>
      <p>
        inhouseticket ist ein Ticketsystem für Teams einer Firma. Wir verarbeiten nur die Daten, die für Anmeldung, Zusammenarbeit im Workspace und
        einen sicheren Betrieb nötig sind. Es gibt keine Werbung, kein Tracking über Websites hinweg und keine Cookies zu Analysezwecken.
      </p>

      <h2>3. Welche Daten wir verarbeiten</h2>
      <ul>
        <li><strong>Konto:</strong> Firmen-E-Mail-Adresse, Name (bei der Registrierung angegeben, sonst aus der E-Mail-Adresse vorgeschlagen), Rolle und Mitgliedschaft im Workspace.</li>
        <li><strong>Registrierung:</strong> Registrierst du dich mit Name, Firmen-E-Mail-Adresse und Passwort, legen wir noch kein Konto an. Wir speichern die Angaben als offene Registrierung – das Passwort nur als Hash (scrypt), dazu einen einmal nutzbaren Bestätigungscode als Hash (SHA-256) und die Zahl falscher Bestätigungsversuche – und schicken dir einen Bestätigungslink. Erst wenn du ihn öffnest und dein Passwort noch einmal eingibst, entsteht das Konto. Gibt es für die Adresse schon ein Konto, legen wir nichts an und schicken stattdessen einen Hinweis mit Link zur Anmeldung; die Seite antwortet in beiden Fällen gleich.</li>
        <li><strong>Inhalte im Workspace:</strong> Projekte, Tickets, Beschreibungen, Labels und das Aktivitätsprotokoll („wer hat was wann geändert“).</li>
        <li><strong>Anmeldung:</strong> Jedes Konto hat ein Passwort. Wir speichern nicht das Passwort selbst, sondern nur einen Hash (Verfahren scrypt mit zufälligem Salt), aus dem es sich nicht zurückrechnen lässt. Alternativ ist die Anmeldung per Link an deine E-Mail-Adresse möglich; dafür speichern wir einen einmal nutzbaren, gehasht abgelegten Code für 15 Minuten. Wer sich per Link anmeldet und noch kein Passwort hat, legt danach eines fest.</li>
        <li><strong>Passwort zurücksetzen:</strong> Forderst du einen Link zum Zurücksetzen an (unter „Passwort vergessen“ oder in deinen Kontoeinstellungen), speichern wir einen einmal nutzbaren Code nur als Hash (SHA-256); er gilt 30 Minuten. Nach dem Zurücksetzen werden alle Sitzungen beendet.</li>
        <li><strong>Anmeldeversuch ohne Passwort:</strong> Versucht jemand, sich mit einem Passwort bei einem Konto anzumelden, das noch keins hat, schicken wir an dessen E-Mail-Adresse einen Anmeldelink, mit dem sich ein Passwort festlegen lässt – höchstens einmal je 15 Minuten. Die Anmeldeseite antwortet dabei genauso wie bei einem falschen Passwort.</li>
        <li><strong>Begrenzung von Anfragen:</strong> Gegen das Erraten von Passwörtern und massenhaften Mailversand zählen wir Anmelde-, Registrierungs- und Bestätigungsversuche sowie angeforderte E-Mails je IP-Adresse und je E-Mail-Adresse; die E-Mail-Adresse dabei nur pseudonymisiert (Hash der Adresse). Die Zähler liegen nur im Arbeitsspeicher des Servers, werden nicht dauerhaft gespeichert und zählen spätestens nach 15 Minuten nicht mehr.</li>
        <li><strong>Sitzungen:</strong> Für eine aktive Anmeldung speichern wir eine Sitzung mit IP-Adresse und Browser-Kennung (User-Agent), um Missbrauch erkennen zu können. Sitzungen laufen nach 30 Tagen ab und werden dann gelöscht.</li>
        <li><strong>Einladungen:</strong> E-Mail-Adresse der eingeladenen Person, wer eingeladen hat, Gültigkeit 7 Tage.</li>
        <li><strong>Kommentare, Unteraufgaben und Bild-Anhänge</strong> in Tickets sowie Erwähnungen (@Name).</li>
        <li><strong>Benachrichtigungen:</strong> Hinweise in der Inbox (z. B. Zuweisung, Erwähnung, Fälligkeit) und, sofern nicht abgeschaltet, eine tägliche Zusammenfassung per E-Mail.</li>
        <li><strong>Verbindungen zu KI-Assistenten:</strong> persönliche API-Tokens (nur als Hash gespeichert, mit Ablaufdatum und Zeitpunkt der letzten Nutzung) bzw. OAuth-Verbindungen (z. B. Claude) mit dem gewählten Workspace.</li>
      </ul>

      <h2>4. Zwecke und Rechtsgrundlagen</h2>
      <ul>
        <li>Bereitstellung des Dienstes und der Zusammenarbeit im Workspace: Art. 6 Abs. 1 lit. b DSGVO (Vertrag bzw. Nutzungsverhältnis).</li>
        <li>Sicherheit (Sitzungsdaten, Begrenzung von Anmeldeversuchen und E-Mails je IP- und je E-Mail-Adresse): Art. 6 Abs. 1 lit. f DSGVO, unser berechtigtes Interesse an einem sicheren Betrieb.</li>
        <li>Registrierung, Anmeldung mit Passwort sowie Versand von Bestätigungslinks, Anmeldelinks, Links zum Zurücksetzen des Passworts und Einladungen per E-Mail: Art. 6 Abs. 1 lit. b DSGVO (Anbahnung und Durchführung des Nutzungsverhältnisses).</li>
      </ul>
      <p>
        Für die Inhalte, die ein Unternehmen in seinem Workspace anlegt, ist das jeweilige Unternehmen verantwortlich; wir verarbeiten sie in
        dessen Auftrag (Art. 28 DSGVO). Einen Auftragsverarbeitungsvertrag stellen wir auf Anfrage bereit.
      </p>

      <h2>5. Anonyme Nutzungsstatistik</h2>
      <p>
        Um zu sehen, wie die Website genutzt wird, zählen wir vollständige Seitenaufrufe pro Tag – mit dem Pfad (Seiten innerhalb eines Workspace
        ohne dessen Namen, z. B. „/[workspace]/p/[key]“) und der Domain der verweisenden Website (z. B. „linkedin.com“). Wir speichern dabei
        weder IP-Adresse noch Browser-Kennung, setzen keine Cookies und können Aufrufe keiner Person zuordnen. Die Zählung findet auf unserem
        eigenen Server statt; Drittanbieter sind nicht beteiligt.
      </p>
      <p>
        Auf den öffentlichen Seiten (Startseite und Rechtstexte, nicht in Workspaces) messen wir die Reichweite zusätzlich mit Matomo, einer
        Open-Source-Software, die wir selbst bei Mittwald in Deutschland betreiben. Matomo läuft ohne Cookies und speichert nichts auf deinem
        Gerät. Dein Browser spricht dabei nur mit inhouseticket.com; unser Server kürzt deine IP-Adresse (IPv4 auf die ersten zwei, IPv6 auf die
        ersten sechs Bytes), bevor er den Aufruf an Matomo weitergibt. Erfasst werden die aufgerufene Seite, die verweisende Website, Uhrzeit,
        Browser, Betriebssystem, Bildschirmgröße, Sprache und das grob aus der gekürzten Adresse abgeleitete Land. Ist in deinem Browser „Do
        Not Track“ aktiviert, messen wir nicht. Rechtsgrundlage ist unser berechtigtes Interesse, das Angebot zu verbessern (Art. 6 Abs. 1
        lit. f DSGVO). Die Messdaten löschen wir nach 12 Monaten.
      </p>

      <h2>6. Verbindung mit KI-Assistenten (z. B. Claude)</h2>
      <p>
        Mitglieder können inhouseticket freiwillig mit einem KI-Assistenten verbinden. Der Assistent ruft dann im Auftrag des Mitglieds und nur
        mit dessen Rechten Tickets ab oder ändert sie; Änderungen sind im Aktivitätsprotokoll als „via Claude“ gekennzeichnet. Die Daten, die
        der Assistent abruft, verarbeitet dessen Anbieter (z. B. Anthropic) nach eigenen Bedingungen; über diese Nutzung entscheidet das
        Unternehmen, dem der Workspace gehört. Die Verbindung lässt sich jederzeit unter „Mit Claude verbinden“ trennen.
      </p>

      <h2>7. Cookies</h2>
      <p>
        Wir setzen ausschließlich Cookies, die für den Dienst unbedingt erforderlich sind: Cookies für die Anmeldung (Sitzung) und – nur wenn du
        über den Umschalter „DE | EN“ eine Sprache wählst – das Cookie <code>lang</code>. Es enthält nur „de“ oder „en“, keine Kennung, gilt ein
        Jahr, ist für Skripte im Browser nicht lesbar (HttpOnly), wird nur verschlüsselt übertragen (Secure) und nicht an fremde Seiten
        mitgeschickt (SameSite=Lax). Für diese Cookies ist keine Einwilligung erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG).
      </p>

      <h2>8. Hosting und E-Mail-Versand</h2>
      <p>
        inhouseticket läuft in einem Rechenzentrum in Deutschland bei der Mittwald CM Service GmbH &amp; Co. KG, Königsberger Straße 4–6,
        32339 Espelkamp, mit der ein Auftragsverarbeitungsvertrag besteht. Datenbank und E-Mail-Versand (Absender
        no-reply@inhouseticket.com) laufen ebenfalls dort. Beim Aufruf der Website verarbeitet der Hoster technisch notwendige Verbindungsdaten
        (z. B. IP-Adresse) zur Auslieferung. Schriftarten werden von unserem eigenen Server geladen, nicht von Drittanbietern.
      </p>

      <h2>9. Speicherdauer</h2>
      <p>
        Kontodaten und Workspace-Inhalte speichern wir, solange das Konto bzw. der Workspace besteht. Wird ein Mitglied aus einem Workspace
        entfernt, bleibt die Zuordnung früherer Tickets und Aktivitäten erhalten, damit der Verlauf nachvollziehbar bleibt. Offene
        Registrierungen löschen wir, sobald das Konto bestätigt ist, spätestens aber nach 24 Stunden; nach fünf falschen Passworteingaben
        oder einer neuen Registrierung für dieselbe Adresse sofort. Sitzungen,
        Anmeldecodes und Codes zum Zurücksetzen des Passworts werden mit Ablauf ungültig und automatisch gelöscht. Löscht der Besitzer einen Workspace, sind dessen Daten sofort aus der Anwendung entfernt;
        in Sicherungskopien, die wir zum Schutz vor Datenverlust täglich anlegen, verbleiben sie höchstens 30 Tage. Admins können alle Daten eines
        Workspace jederzeit exportieren.
      </p>

      <h2>10. Deine Rechte</h2>
      <p>
        Du hast das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit
        (Art. 20) und Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21 DSGVO). Schreib uns dazu an{" "}
        <a className="text-accent underline" href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>. Außerdem kannst du dich bei einer
        Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel beim Hamburgischen Beauftragten für Datenschutz und Informationsfreiheit.
      </p>
    </GermanOnly>
  );
}
