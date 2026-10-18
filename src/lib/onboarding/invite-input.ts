// Paste parser for the wizard's invite step (docs/ONBOARDING.md §2.3). Plain, client-safe: the
// wizard shows a chip per address while typing; the server action runs the same function again.
import { getEmailDomain, isFreemailDomain } from "@/lib/freemail";
import { isPersonalWorkspaceDomain } from "@/lib/workspace-domain";

/**
 * ok – company address of the workspace domain · external – other company domain (allowed, marked)
 * freemail – Gmail, GMX & Co. (refused) · invalid – not an address · duplicate – twice in the input or
 * already invited · member – already in the workspace.
 */
export type InviteStatus = "ok" | "external" | "freemail" | "invalid" | "duplicate" | "member";
export type InviteChip = { email: string; status: InviteStatus };

/** Statuses that turn into an invitation. */
export const SENDABLE: ReadonlySet<InviteStatus> = new Set(["ok", "external"]);

const MAX_TOKEN = 320;

/**
 * Splits pasted text into address candidates: commas, semicolons, whitespace and line breaks
 * separate; "Max Muster <max@firma.de>" (mail clients) yields the address in brackets, a
 * "mailto:" prefix and surrounding quotes are dropped.
 */
export function splitInviteInput(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/[,;\n\r]+/)) {
    const bracketed = [...part.matchAll(/<([^<>]*)>/g)].map((m) => m[1] ?? "");
    const tokens = bracketed.length > 0 ? bracketed : part.split(/\s+/);
    for (const raw of tokens) {
      const token = raw.trim().replace(/^mailto:/i, "").replace(/^["'(]+|["')]+$/g, "").trim().toLowerCase();
      if (token) out.push(token.slice(0, MAX_TOKEN));
    }
  }
  return out;
}

export type InviteContext = {
  /** Workspace key (`workspace.domain`); a personal workspace has no own domain → every address is external. */
  domain?: string | null;
  /** Addresses of active members (incl. the person inviting). */
  members?: Iterable<string>;
  /** Addresses with an open invitation or already on a chip. */
  existing?: Iterable<string>;
};

/** One chip per candidate, in input order. */
export function parseInviteInput(text: string, ctx: InviteContext = {}): InviteChip[] {
  const members = new Set([...(ctx.members ?? [])].map((e) => e.toLowerCase()));
  const seen = new Set([...(ctx.existing ?? [])].map((e) => e.toLowerCase()));
  const own = ctx.domain && !isPersonalWorkspaceDomain(ctx.domain) ? ctx.domain.toLowerCase() : null;
  return splitInviteInput(text).map((email) => {
    const status = classify(email, own, members, seen);
    seen.add(email);
    return { email, status };
  });
}

function classify(email: string, own: string | null, members: Set<string>, seen: Set<string>): InviteStatus {
  const domain = getEmailDomain(email);
  if (!domain) return "invalid";
  if (members.has(email)) return "member";
  if (seen.has(email)) return "duplicate";
  if (isFreemailDomain(domain)) return "freemail";
  return own && domain === own ? "ok" : "external";
}
