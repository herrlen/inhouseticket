import { notFound, redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { legalPage, type LegalKey } from "@/lib/instance";
import { INSTANCE } from "@/lib/site";

/**
 * Company instance (SELF_HOSTED): our legal texts do not apply there. Redirects to the company's
 * page (IMPRINT_URL / PRIVACY_URL), shows a neutral note without one, 404 for terms and DPA.
 * Returns null on the hosted service – the page renders its own text.
 */
export function instanceLegal(key: LegalKey): React.ReactNode | null {
  const page = legalPage(key, INSTANCE);
  if (page.kind === "own") return null;
  if (page.kind === "redirect") redirect(page.url);
  if (page.kind === "none") notFound();
  return <InstanceNote />;
}

async function InstanceNote() {
  const t = (await getT()).legal;
  return (
    <>
      <h1>{t.instanceTitle}</h1>
      <p>{INSTANCE.name ? t.instanceOperator(INSTANCE.name) : t.instanceOperatorUnnamed}</p>
      <p>{t.instanceContact}</p>
    </>
  );
}
