import { getEmailDomain, isFreemailDomain } from "@/lib/freemail";

/**
 * Key a workspace is claimed under (`workspace.domain`). Normally the company domain; a freemail
 * address can only get here via the superadmin or tester exception and then claims a personal workspace keyed
 * by the full address, so nobody else with that provider can ever match it or join by domain.
 */
export function workspaceDomainOf(email: string): string | null {
  const domain = getEmailDomain(email);
  if (!domain) return null;
  return isFreemailDomain(domain) ? email.trim().toLowerCase() : domain;
}

export function isPersonalWorkspaceDomain(domain: string): boolean {
  return domain.includes("@");
}
