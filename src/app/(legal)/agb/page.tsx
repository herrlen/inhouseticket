import type { Metadata } from "next";
import { GermanOnly } from "@/components/german-only";
import { instanceLegal } from "@/components/instance-legal";
import Link from "next/link";
import { OPERATOR } from "@/lib/legal";
import { MAX_USERS_PER_WORKSPACE } from "@/lib/limits";

export const metadata: Metadata = { title: "AGB", alternates: { canonical: "/agb" } };

// Terms for a free B2B service, reviewed by a lawyer (2026-10-10). Changes need another review.
export default function AgbPage() {
  const instance = instanceLegal("terms");
  if (instance) return instance;
  return (
    <GermanOnly>
      <h1>Allgemeine Geschäftsbedingungen</h1>
      <p className="text-[13px] text-muted">Stand: Oktober 2026</p>

      <h2>1. Anbieter und Geltungsbereich</h2>
      <p>
        Anbieter von inhouseticket ist {OPERATOR.name}, Inhaber {OPERATOR.owner}, {OPERATOR.street}, {OPERATOR.city}, {OPERATOR.country} („wir“). Diese Bedingungen gelten für die
        Nutzung von inhouseticket.com durch Unternehmen, Selbstständige und öffentliche Stellen („Kunde“). inhouseticket richtet sich nicht an
        Verbraucher im Sinne von § 13 BGB. Abweichende Bedingungen des Kunden gelten nur, wenn wir ihnen ausdrücklich zustimmen.
      </p>

      <h2>2. Leistung</h2>
      <ul>
        <li>inhouseticket ist ein webbasiertes Ticketsystem für Teams. Die Nutzung ist kostenlos.</li>
        <li>Ein Workspace umfasst bis zu {MAX_USERS_PER_WORKSPACE} aktive Mitglieder. Weitere technische Grenzen (z. B. Länge von Texten, Größe und Zahl von Anhängen) sind in der Anwendung angegeben.</li>
        <li>Wir entwickeln den Dienst laufend weiter und dürfen Funktionen ändern, wenn der Kern – Tickets anlegen, bearbeiten und gemeinsam verwalten – erhalten bleibt.</li>
        <li>Wir bemühen uns um eine hohe Verfügbarkeit, schulden aber keine bestimmte Verfügbarkeit. Wartungen kündigen wir nach Möglichkeit vorher an.</li>
      </ul>

      <h2>3. Registrierung und Workspace</h2>
      <ul>
        <li>Die Registrierung erfolgt mit Name, geschäftlicher E-Mail-Adresse und Passwort; das Konto entsteht erst, wenn die Adresse über den zugeschickten Link bestätigt ist. Die Anmeldung erfolgt mit E-Mail-Adresse und Passwort oder per Anmeldelink. Adressen von Freemail-Anbietern sind ausgeschlossen.</li>
        <li>Wer einen Workspace anlegt, wird dessen Besitzer und handelt für den Kunden. Der Besitzer verwaltet Mitglieder und Rollen und kann den Workspace löschen.</li>
        <li>Der Kunde sorgt dafür, dass nur berechtigte Personen Zugang erhalten, und hält Passwörter, Anmeldelinks, API-Tokens und Zugänge geheim.</li>
      </ul>

      <h2>4. Pflichten des Kunden</h2>
      <p>
        Der Kunde ist für die Inhalte in seinem Workspace verantwortlich. Er stellt keine rechtswidrigen Inhalte ein, verletzt keine Rechte Dritter
        und nutzt den Dienst nicht in einer Weise, die seinen Betrieb gefährdet (z. B. automatisierte Massenanfragen außerhalb der vorgesehenen
        Schnittstellen). Bei schweren Verstößen dürfen wir einen Workspace vorübergehend sperren; wir informieren den Besitzer darüber.
      </p>

      <h2>5. Daten, Export und Datenschutz</h2>
      <ul>
        <li>Die Inhalte im Workspace gehören dem Kunden. Wir nutzen sie nur, um den Dienst zu erbringen.</li>
        <li>Admins können alle Daten eines Workspace jederzeit als JSON oder CSV exportieren.</li>
        <li>Für personenbezogene Daten in Workspaces verarbeiten wir als Auftragsverarbeiter; es gilt der <Link className="text-accent underline" href="/avv">Auftragsverarbeitungsvertrag</Link>, der Bestandteil dieser Bedingungen ist. Im Übrigen gilt die <Link className="text-accent underline" href="/datenschutz">Datenschutzerklärung</Link>.</li>
        <li>Verbindet ein Nutzer inhouseticket mit einem KI-Assistenten (z. B. Claude), entscheidet der Kunde über diese Übermittlung; das Verhältnis zum Anbieter des Assistenten besteht zwischen Kunde und Anbieter.</li>
      </ul>

      <h2>6. Laufzeit und Beendigung</h2>
      <ul>
        <li>Die Nutzung läuft auf unbestimmte Zeit. Der Kunde kann sie jederzeit beenden, indem der Besitzer den Workspace löscht.</li>
        <li>Wir können den Dienst mit einer Frist von drei Monaten ganz oder für einen Kunden beenden; der Kunde kann seine Daten bis dahin exportieren. Das Recht zur fristlosen Kündigung aus wichtigem Grund bleibt unberührt.</li>
        <li>Nach dem Löschen eines Workspace sind die Daten sofort aus der laufenden Anwendung entfernt; in Sicherungskopien verbleiben sie bis zu 30 Tage.</li>
      </ul>

      <h2>7. Haftung</h2>
      <p>
        Da der Dienst unentgeltlich ist, haften wir nur für Vorsatz und grobe Fahrlässigkeit. Diese Beschränkung gilt nicht bei der Verletzung von
        Leben, Körper oder Gesundheit, bei arglistig verschwiegenen Mängeln und soweit eine Haftung nach dem Produkthaftungsgesetz zwingend ist.
        Der Kunde ist dafür verantwortlich, geschäftskritische Daten regelmäßig zu exportieren.
      </p>

      <h2>8. Änderungen dieser Bedingungen</h2>
      <p>
        Änderungen teilen wir dem Besitzer jedes Workspace mindestens sechs Wochen vor Inkrafttreten per E-Mail mit. Widerspricht der Kunde nicht
        bis dahin, gelten sie als angenommen; auf diese Folge weisen wir in der Mitteilung hin. Widerspricht er, können beide Seiten die Nutzung beenden.
      </p>

      <h2>9. Schlussbestimmungen</h2>
      <p>
        Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts. Gerichtsstand ist Hamburg, soweit der Kunde Kaufmann, juristische Person des
        öffentlichen Rechts oder öffentlich-rechtliches Sondervermögen ist. Sollte eine Bestimmung unwirksam sein, bleibt der Rest wirksam.
      </p>
    </GermanOnly>
  );
}
