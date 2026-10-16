import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // The token sits in the URL: keep it out of search indexes and Referer headers.
  return { title: (await getT()).login.confirmTitle, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const FIELDS = ["token", "callbackURL", "errorCallbackURL", "newUserCallbackURL"] as const;

/**
 * Landing page of the sign-in mail. Mail scanners and link previews open links before the person
 * does, and the verify endpoint consumes the token on the first GET. A plain form only a person
 * submits keeps the link valid until then – works without JavaScript.
 */
export default async function ConfirmLinkPage({ searchParams }: Props) {
  const t = await getT();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  if (!one(params.token)) redirect("/login?error=link");

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">{t.login.confirmTitle}</h1>
      <p className="mb-6 text-muted">{t.login.confirmText}</p>
      <form method="get" action="/api/auth/magic-link/verify">
        {FIELDS.map((name) => {
          const value = one(params[name]);
          return value ? <input key={name} type="hidden" name={name} value={value} /> : null;
        })}
        <Button type="submit" variant="primary" className="w-full">
          {t.login.confirmSubmit}
        </Button>
      </form>
    </>
  );
}
