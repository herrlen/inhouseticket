// Zod-free on purpose: imported by client components (bundle budget).

/** Suggests a ticket key from a project name: "Kampagne Q4" → "KQ", "Marketing" → "MAR". */
export function suggestProjectKey(name: string): string {
  const clean = name
    .toUpperCase()
    .replace(/Ä/g, "AE")
    .replace(/Ö/g, "OE")
    .replace(/Ü/g, "UE")
    .replace(/ß/g, "SS")
    .normalize("NFKD")
    .replace(/[^A-Z0-9 ]/g, " ")
    .trim();
  const words = clean.split(/\s+/).filter(Boolean);
  let key = words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "").slice(0, 3);
  key = key.replace(/^[0-9]+/, "").slice(0, 10);
  return key.length >= 2 ? key : (key + "PRJ").slice(0, 3);
}
