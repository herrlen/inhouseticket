import type { Metadata } from "next";
import { OPERATOR } from "@/lib/legal";

export const metadata: Metadata = { title: "Impressum" };

export default function ImpressumPage() {
  return (
    <>
      <h1>Impressum</h1>
      <h2>Angaben gemäß § 5 DDG</h2>
      <p>
        {OPERATOR.name}
        <br />
        {OPERATOR.street}
        <br />
        {OPERATOR.city}
      </p>
      <p>Vertretungsberechtigte Geschäftsführerin: {OPERATOR.managingDirector}</p>

      <h2>Kontakt</h2>
      <p>
        E-Mail: <a className="text-accent underline" href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
      </p>

      <h2>Eintragung im Handelsregister</h2>
      <p>
        Registergericht: {OPERATOR.registerCourt}
        <br />
        Registernummer: {OPERATOR.registerNumber}
      </p>

      <h2>Umsatzsteuer-Identifikationsnummer</h2>
      <p>Umsatzsteuer-Identifikationsnummer gemäß § 27 a Umsatzsteuergesetz: {OPERATOR.vatId}</p>

      {/* No EU-OS-platform notice: the platform was shut down on 2025-07-20 (Regulation (EU) 524/2013
          repealed); a link to it can be misleading. Do not re-add. */}
      <h2>Verbraucherstreitbeilegung / Universalschlichtungsstelle</h2>
      <p>Zur Teilnahme an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle sind wir nicht verpflichtet und nicht bereit.</p>
    </>
  );
}
