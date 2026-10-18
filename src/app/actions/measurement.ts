"use server";

import { cookies } from "next/headers";
import { OPTOUT_COOKIE, OPTOUT_MAX_AGE } from "@/lib/optout";

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
      maxAge: OPTOUT_MAX_AGE,
      sameSite: "lax",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
    });
  } else if (value === "on") {
    jar.delete(OPTOUT_COOKIE);
  }
}
