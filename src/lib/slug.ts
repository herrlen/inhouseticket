// Workspace URL segments. Reserved words collide with top-level routes.
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "api", "app", "auth", "login", "logout", "start", "onboarding", "invite", "dev",
  "settings", "admin", "mcp", "docs", "help", "static", "public", "_next",
  "impressum", "datenschutz", "agb", "avv",
]);

const MAX_SLUG = 63;

/** "firma.de" → "firma", "Müller & Söhne" → "mueller-soehne". */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, "");
}

/** Slug candidate for a company domain: the label before the public suffix. */
export function slugFromDomain(domain: string): string {
  const labels = domain.toLowerCase().split(".");
  // Handle two-level suffixes like co.uk / com.au.
  const sld = labels.length >= 3 && ["co", "com", "or", "ac", "gv"].includes(labels.at(-2)!);
  const base = labels.slice(0, sld ? -2 : -1).join("-");
  return slugify(base) || "workspace";
}

/** Returns the first free candidate: base, base-2, base-3, … */
export async function uniqueSlug(base: string, isTaken: (slug: string) => Promise<boolean>): Promise<string> {
  const clean = slugify(base) || "workspace";
  for (let i = 1; ; i++) {
    const suffix = i === 1 ? "" : `-${i}`;
    const candidate = clean.slice(0, MAX_SLUG - suffix.length).replace(/-+$/, "") + suffix;
    if (!RESERVED_SLUGS.has(candidate) && !(await isTaken(candidate))) return candidate;
  }
}
