// Expiry of personal API tokens, chosen by the user on creation (Len, 2026-10-05).
// Dates are calendar days in Berlin; a token is valid until the end of its last day.

export const EXPIRY_CHOICES = ["30", "90", "365", "custom", "never"] as const;
export type ExpiryChoice = (typeof EXPIRY_CHOICES)[number];
export const DEFAULT_EXPIRY: ExpiryChoice = "90";
/** Custom dates may lie at most this far ahead. */
export const MAX_EXPIRY_DAYS = 2 * 365;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 23:59:59 Berlin time on `date`, DST-aware. */
export function endOfBerlinDay(date: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const utcGuess = Date.UTC(y, m - 1, d, 23, 59, 59);
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", timeZoneName: "shortOffset" })
    .formatToParts(new Date(utcGuess))
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  const offsetMin = match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) : 60;
  return new Date(utcGuess - offsetMin * 60_000);
}

export function resolveExpiry(choice: string, customDate: string | null, today: string): { ok: true; expiresAt: Date | null } | { ok: false } {
  switch (choice) {
    case "never":
      return { ok: true, expiresAt: null };
    case "30":
    case "90":
    case "365":
      return { ok: true, expiresAt: endOfBerlinDay(addDays(today, Number(choice))) };
    case "custom": {
      if (!customDate || !DATE.test(customDate) || Number.isNaN(Date.parse(customDate))) return { ok: false };
      if (customDate <= today || customDate > addDays(today, MAX_EXPIRY_DAYS)) return { ok: false };
      return { ok: true, expiresAt: endOfBerlinDay(customDate) };
    }
    default:
      return { ok: false };
  }
}
