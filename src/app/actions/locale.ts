"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/locale";
import { COOKIE_DOMAIN } from "@/lib/site";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Language toggle: stores the choice; Next.js re-renders the current page with it. */
export async function setLocale(formData: FormData) {
  const value = formData.get("locale");
  if (!isLocale(value)) return;
  (await cookies()).set(LOCALE_COOKIE, value, {
    path: "/",
    // The language chosen on the landing page carries over to the app host.
    domain: COOKIE_DOMAIN,
    maxAge: ONE_YEAR,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}
