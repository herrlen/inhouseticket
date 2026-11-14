import type { Metadata } from "next";
import { GermanOnly } from "@/components/german-only";
import { instanceLegal } from "@/components/instance-legal";
import { MeasurementToggle } from "@/components/measurement-toggle";
import { OPERATOR } from "@/lib/legal";

export const metadata: Metadata = { title: "Datenschutz", alternates: { canonical: "/datenschutz" } };

// Describes what the app actually does; reviewed by a lawyer (2026-10-10). Added afterwards and not yet reviewed: section 5 (Matomo; extended to the app and events on 2026-10-18),
// and on 2026-10-17 password, reset, no-password link, rate limits (section 3/4), the lang cookie (section 7),
// and on 2026-10-18 registration with password and its pending data (sections 3, 4, 9; ADR 005),
// and on 2026-10-18 the measurement opt-out, DNT/GPC, no feature detection (section 5) and the
// cookie and storage table from e2e/storage-inventory.spec.ts (section 7),
// and on 2026-10-24 the app host app.inhouseticket.com, cookies shared by both hosts (section 7).
// Keep in sync with new features.
/** Every cookie the site sets – checked by e2e/storage-inventory.spec.ts (ALLOWED_COOKIES). */
const COOKIES = [
  {
    name: "better-auth.session_token",
    purpose: "Hält dich angemeldet (zufällige Sitzungskennung, signiert).",
    lifetime: "30 Tage ab der letzten Verlängerung; gelöscht beim Abmelden",
    basis: "§ 25 Abs. 2 Nr. 2 TDDDG; Art. 6 Abs. 1 lit. b DSGVO",
  },
  {
    name: "better-auth.session_data",
    purpose: "Zwischenspeicher der Sitzung (signiert), damit nicht jeder Aufruf die Datenbank fragen muss.",
    lifetime: "5 Minuten",
    basis: "§ 25 Abs. 2 Nr. 2 TDDDG; Art. 6 Abs. 1 lit. b DSGVO",
  },
  {
    name: "better-auth.session_token.oauth_logout_confirmation",
    purpose: "Nur wenn eine verbundene App (z. B. Claude) eine Abmeldung anstößt: merkt sich die Rückfrage.",
    lifetime: "5 Minuten",
    basis: "§ 25 Abs. 2 Nr. 2 TDDDG; Art. 6 Abs. 1 lit. b DSGVO",
  },
  {
    name: "lang",
    purpose: "Nur wenn du über „DE | EN“ eine Sprache wählst: „de“ oder „en“, keine Kennung.",
    lifetime: "1 Jahr",
    basis: "§ 25 Abs. 2 Nr. 2 TDDDG; Art. 6 Abs. 1 lit. f DSGVO",
  },
  {
    name: "iht_optout",
    purpose: "Nur wenn du die Messung deaktivierst (Abschnitt 5): Wert „1“, keine Kennung.",
    lifetime: "1 Jahr oder bis du die Messung wieder aktivierst",
    basis: "§ 25 Abs. 2 Nr. 2 TDDDG; Art. 6 Abs. 1 lit. c i. V. m. Art. 21 DSGVO",
  },
] as const;

export default function DatenschutzPage() {
  const instance = instanceLegal("privacy");
  if (instance) return instance;
  return (
    <GermanOnly>
      <h1>Datenschutzerklärung</h1>
      <p className="text-[13px] text-muted">Stand: 19. Oktober 2026</p>

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
        <li><strong>Konto:</strong> Firmen-E-Mail-Adresse, Name (bei der Registrierung angegeben, sonst aus der E-Mail-Adresse vorgeschlagen), Zeitzone (bei der Einrichtung aus deinem Browser vorgeschlagen, änderbar), Rolle und Mitgliedschaft im Workspace sowie deine bevorzugte Startansicht (Liste oder Board).</li>
        {/* ENTWURF – anwaltlich prüfen (2026-10-18: Onboarding-Wizard, freiwillige Fragen in Schritt 5, docs/ONBOARDING.md §3) */}
        <li><strong>Einrichtung (freiwillig):</strong> Beim Anlegen eines Workspace fragen wir optional, welche Werkzeuge ihr bisher genutzt habt (z. B. Excel, Jira) und wie du von inhouseticket erfahren hast (z. B. Suche, Empfehlung, bei „Andere“ ein kurzer Freitext bis 100 Zeichen). Die Antworten speichern wir zu deinem Konto im jeweiligen Workspace auf unserem Server – nicht in deinem Browser – und werten sie nur zusammengefasst aus, um das Angebot und unsere Bekanntheit zu verstehen. Du kannst die Fragen überspringen; dann speichern wir nichts. Dazu kommen der gewählte Team-Bereich (z. B. Marketing, IT), nach dem wir das erste Projekt anlegen, und der Stand der Einrichtung, damit sie nach einem Neuladen an derselben Stelle weitergeht.</li>
        <li><strong>Registrierung:</strong> Registrierst du dich mit Name, Firmen-E-Mail-Adresse und Passwort, legen wir noch kein Konto an. Wir speichern die Angaben als offene Registrierung – das Passwort nur als Hash (scrypt), dazu einen einmal nutzbaren Bestätigungscode als Hash (SHA-256) und die Zahl falscher Bestätigungsversuche – und schicken dir einen Bestätigungslink. Erst wenn du ihn öffnest und dein Passwort noch einmal eingibst, entsteht das Konto. Gibt es für die Adresse schon ein Konto, legen wir nichts an und schicken stattdessen einen Hinweis mit Link zur Anmeldung; die Seite antwortet in beiden Fällen gleich.</li>
        <li><strong>Inhalte im Workspace:</strong> Projekte, Tickets, Beschreibungen, Labels und das Aktivitätsprotokoll („wer hat was wann geändert“).</li>
        <li><strong>Anmeldung:</strong> Jedes Konto hat ein Passwort. Wir speichern nicht das Passwort selbst, sondern nur einen Hash (Verfahren scrypt mit zufälligem Salt), aus dem es sich nicht zurückrechnen lässt. Alternativ ist die Anmeldung per Link an deine E-Mail-Adresse möglich; dafür speichern wir einen einmal nutzbaren, gehasht abgelegten Code für 15 Minuten. Wer sich per Link anmeldet und noch kein Passwort hat, legt danach eines fest. Der Link meldet nur bestehende Konten an, ein Konto entsteht dabei nie: Gibt es für die Adresse noch keins, schicken wir stattdessen einen Hinweis mit Link zur Registrierung – höchstens einmal je 15 Minuten; die Anmeldeseite antwortet in beiden Fällen gleich.</li>
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
        {/* ENTWURF – anwaltlich prüfen (2026-10-18): freiwillige Antworten der Einrichtung */}
        <li>Freiwillige Antworten bei der Einrichtung (bisher genutzte Werkzeuge, wie du von uns erfahren hast): Art. 6 Abs. 1 lit. f DSGVO, unser berechtigtes Interesse, das Angebot zu verbessern und zu verstehen, wie Teams zu uns finden. Die Angabe ist freiwillig; du kannst der Verarbeitung jederzeit widersprechen (Art. 21 DSGVO), dann löschen wir deine Antworten.</li>
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
        eigenen Server statt; Drittanbieter sind nicht beteiligt. Hast du die Messung unten deaktiviert, zählen wir deine Aufrufe auch hier nicht.
      </p>
      {/* ENTWURF – anwaltlich prüfen (2026-10-18: Matomo auch in der Anwendung, Ereignisse; ohne Auslesen von Geräteinformationen,
          DNT/GPC, Widerspruch per Schalter; kein Einwilligungsbanner, siehe Abschnitt 7) */}
      <p>
        Zusätzlich messen wir mit Matomo, einer Open-Source-Software, die wir selbst unter analytics.klatxt.de bei Mittwald in Deutschland
        betreiben, wie die Website und die Anwendung genutzt werden – auf den öffentlichen Seiten ebenso wie bei Anmeldung, Registrierung und
        in Workspaces. Matomo setzt keine Cookies, speichert nichts auf deinem Gerät und liest dort nichts aus: Bildschirmauflösung, Plugins,
        Client Hints, Ortszeit und Ladezeiten werden nicht erfasst, Klicks auf Links und die Verweildauer („Heartbeat“) ebenfalls nicht. Dein
        Browser spricht dabei nur mit inhouseticket.com; unser Server kürzt deine IP-Adresse (IPv4 auf die ersten zwei, IPv6 auf die ersten
        sechs Bytes), bevor er den Aufruf an Matomo weitergibt.
      </p>
      <p>
        Erfasst werden die aufgerufene Seite, die verweisende Website, Uhrzeit, sowie aus den Angaben, die jeder Browser bei einem Aufruf
        ohnehin mitschickt, Browser, Betriebssystem und Sprache und das grob aus der gekürzten Adresse abgeleitete Land. Adressen erfassen wir
        nur vereinheitlicht: Namen und Kennungen von Workspaces, Projekten und Tickets sowie Tokens, E-Mail-Adressen und Suchbegriffe werden
        vorher entfernt (z. B. „/:id/p/:id“), als Seitentitel dient eine allgemeine Bezeichnung wie „Board“ oder „Ticket Detail“, nie ein
        Ticket- oder Projekttitel. Außerdem zählen wir einzelne Schritte als Ereignisse ohne personenbezogene Inhalte, etwa „Registrierung
        abgeschlossen“, „Workspace angelegt“, „Einrichtungsschritt abgeschlossen“ (nur
        der Name des Schritts, z. B. „Profil“) und „Einrichtung abgeschlossen“ (nur der gewählte Team-Bereich, z. B. „Marketing“), „Ticket erstellt“, „Status geändert“ (nur die Kategorie offen/in Arbeit/erledigt), „Ansicht
        gewechselt“, „Mitglieder eingeladen“ (nur die Anzahl) oder „Claude verbunden“. Namen, E-Mail-Adressen und Ticket-Inhalte gelangen nie
        zu Matomo; Zugriffe über API und MCP messen wir nicht. Einen Besuch fasst Matomo nur über einen täglich wechselnden, auf dem Server
        gebildeten Wert zusammen; über Tage hinweg erkennt es dich nicht wieder.
      </p>
      <p>
        Rechtsgrundlage ist unser berechtigtes Interesse, das Angebot zu verbessern und den Weg von der Startseite bis zur Nutzung zu verstehen
        (Art. 6 Abs. 1 lit. f DSGVO). Du kannst dem jederzeit widersprechen (Art. 21 DSGVO): mit dem Schalter unten oder, ganz ohne uns, mit
        „Do Not Track“ oder „Global Privacy Control“ in deinem Browser. Dann messen wir nicht – weder im Browser noch Ereignisse, die unser
        Server meldet. Die Messdaten löschen wir nach 12 Monaten.
      </p>
      <MeasurementToggle />
      <p className="text-[13px] text-muted">
        Der Schalter speichert das Cookie <code>iht_optout</code> mit dem Wert „1“ in diesem Browser (siehe Abschnitt 7). Er gilt für dieses
        Gerät und diesen Browser; löschst du deine Cookies, ist der Widerspruch ebenfalls gelöscht.
      </p>

      <h2>6. Verbindung mit KI-Assistenten (z. B. Claude)</h2>
      <p>
        Mitglieder können inhouseticket freiwillig mit einem KI-Assistenten verbinden. Der Assistent ruft dann im Auftrag des Mitglieds und nur
        mit dessen Rechten Tickets ab oder ändert sie; Änderungen sind im Aktivitätsprotokoll als „via Claude“ gekennzeichnet. Die Daten, die
        der Assistent abruft, verarbeitet dessen Anbieter (z. B. Anthropic) nach eigenen Bedingungen; über diese Nutzung entscheidet das
        Unternehmen, dem der Workspace gehört. Die Verbindung lässt sich jederzeit unter „Mit Claude verbinden“ trennen.
      </p>

      <h2>7. Cookies und Speicher im Browser</h2>
      {/* ENTWURF – anwaltlich prüfen (2026-10-18): Tabelle aus e2e/storage-inventory.spec.ts; kein Einwilligungsbanner. */}
      <p>
        Wir setzen ausschließlich Cookies, die für den Dienst unbedingt erforderlich sind, und nutzen weder Local Storage noch Session Storage
        noch IndexedDB. Vollständige Liste:
      </p>
      <div className="mb-3 overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px] [&_td]:border-t [&_td]:border-border [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top [&_th]:py-2 [&_th]:pr-3 [&_th]:font-semibold">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Zweck</th>
              <th scope="col">Speicherdauer</th>
              <th scope="col">Rechtsgrundlage</th>
            </tr>
          </thead>
          <tbody>
            {COOKIES.map((c) => (
              <tr key={c.name}>
                <td>
                  <code>{c.name}</code>
                </td>
                <td>{c.purpose}</td>
                <td>{c.lifetime}</td>
                <td>{c.basis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Alle Cookies gelten nur für inhouseticket.com und die App unter app.inhouseticket.com (damit du auf beiden angemeldet bleibst
        und deine Sprache und dein Widerspruch gegen die Messung überall gelten), werden im Betrieb nur verschlüsselt übertragen (Secure; die Anmelde-Cookies tragen
        dort das Präfix <code>__Secure-</code>) und nicht an fremde Seiten mitgeschickt (SameSite=Lax). Bis auf <code>iht_optout</code> sind
        sie für Skripte im Browser nicht lesbar (HttpOnly). Inhalte von Drittanbietern (Schriften, Skripte, Bilder) laden wir nicht.
      </p>
      <p>
        <strong>Warum es keinen Cookie-Banner gibt:</strong> Eine Einwilligung ist nur nötig, wenn Informationen auf deinem Gerät gespeichert
        oder dort ausgelesen werden, die für den von dir gewünschten Dienst nicht unbedingt erforderlich sind (§ 25 Abs. 1 TDDDG). Die Cookies
        oben sind erforderlich, damit du angemeldet bleibst und deine Wahl (Sprache, Widerspruch gegen die Messung) gilt (§ 25 Abs. 2 Nr. 2
        TDDDG). Die Messung nach Abschnitt 5 speichert nichts auf deinem Gerät und liest dort nichts aus; sie beruht auf unserem berechtigten
        Interesse, und du kannst ihr jederzeit widersprechen.
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
        entfernt, bleibt die Zuordnung früherer Tickets und Aktivitäten erhalten, damit der Verlauf nachvollziehbar bleibt. Freiwillige Antworten aus der Einrichtung löschen wir
        mit dem Workspace oder deinem Konto. Offene
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
