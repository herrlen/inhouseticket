"use server";

import { cookies } from "next/headers";
import { OPTOUT_COOKIE, OPTOUT_MAX_AGE } from "@/lib/optout";
import { COOKIE_DOMAIN } from "@/lib/site";

/**
 * "Messung auf diesem Gerät deaktivieren/aktivieren" (privacy policy section 5). Stores the
 * opt-out as a first-party cookie; Next.js re-renders the current page with it. Not HttpOnly on
 * purpose: the tracker checks it in the browser, too. It holds no identifier, only "1".
 */
export async function setMeasurement(formData: FormData) {
  const value = formData.get("measurement");
  const jar = await cookies();
  if (value === "off") {
    jar.set(OPTOUT_COOKIE, "1", {
      path: "/",
      // An opt-out on inhouseticket.com also holds on app.inhouseticket.com and vice versa.
      domain: COOKIE_DOMAIN,
      maxAge: OPTOUT_MAX_AGE,
      sameSite: "lax",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
    });
  } else if (value === "on") {
    jar.delete({ name: OPTOUT_COOKIE, path: "/", domain: COOKIE_DOMAIN });
  }
}
