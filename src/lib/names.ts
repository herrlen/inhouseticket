/** "max.mustermann@firma.de" → "Max Mustermann" (until the user sets a name). */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const name = local
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
  return name || email;
}
