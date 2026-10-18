import { cookies, headers } from "next/headers";
import { setMeasurement } from "@/app/actions/measurement";
import { Button } from "@/components/ui/button";
import { OPTOUT_COOKIE } from "@/lib/optout";

/**
 * Opt-out switch on the privacy page. A plain form with a Server Action, like the language toggle:
 * works with keyboard and without JS. The status line is a live region, so the change is announced.
 * German only, like the legal texts around it.
 */
export async function MeasurementToggle() {
  const optedOut = (await cookies()).get(OPTOUT_COOKIE)?.value === "1";
  const h = await headers();
  const browserRefuses = h.get("dnt") === "1" || h.get("sec-gpc") === "1";
  return (
    <form action={setMeasurement} className="my-4 flex flex-col gap-2 rounded-[var(--radius-card)] border border-border p-4">
      <p role="status">
        {optedOut
          ? "Die Messung ist auf diesem Gerät deaktiviert."
          : browserRefuses
            ? "Dein Browser sendet „Do Not Track“ oder „Global Privacy Control“ – wir messen deshalb nicht."
            : "Die Messung ist auf diesem Gerät aktiv."}
      </p>
      <div>
        <Button type="submit" name="measurement" value={optedOut ? "on" : "off"} variant="secondary">
          {optedOut ? "Messung auf diesem Gerät aktivieren" : "Messung auf diesem Gerät deaktivieren"}
        </Button>
      </div>
    </form>
  );
}
