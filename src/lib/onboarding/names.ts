// Suggestions the onboarding wizard pre-fills (docs/ONBOARDING.md §2.1). Plain, client-safe.
import { MAX_NAME } from "@/lib/limits";
import { slugFromDomain } from "@/lib/slug";
import { isPersonalWorkspaceDomain } from "@/lib/workspace-domain";

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** "max.mustermann@firma.de" → "Max Mustermann" (until the user sets a name). */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const name = local
    .split(/[._+-]+/)
    .filter(Boolean)
    .map(capitalize)
    .join(" ");
  return name || email;
}

/**
 * Workspace name suggested from its domain: "ursalz.de" → "Ursalz", "mein-shop.co.uk" → "Mein Shop".
 * A personal workspace (exempt address, keyed by the full address) gets the last part of the local
 * name: "len.mueller@gmail.com" → "Mueller".
 */
export function workspaceNameFromDomain(domain: string): string {
  const words = isPersonalWorkspaceDomain(domain)
    ? [(domain.split("@")[0] ?? "").split(/[._+-]+/).filter(Boolean).at(-1) ?? ""]
    : slugFromDomain(domain).split("-");
  const name = words.filter(Boolean).map(capitalize).join(" ").slice(0, MAX_NAME);
  return name.length >= 2 ? name : "Workspace";
}
