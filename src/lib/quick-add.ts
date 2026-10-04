// Quick add (KONZEPT §2.7): "Bug Login kaputt @max !hoch ^freitag"
//   @name     → assignee (first name, full name without spaces, or @ich)
//   !prio     → !dringend !hoch !mittel !niedrig, !1–!4, English synonyms
//   ^datum    → ^heute ^morgen ^übermorgen ^montag…^sonntag ^mo…^so ^24.12. ^24.12.2026 ^2026-12-24 ^+3 ^nächste-woche
// Unknown tokens stay in the title, so nothing typed is silently lost.

export type QuickAddMember = { id: string; name: string };
export type QuickAddToken = { kind: "assignee" | "priority" | "due"; raw: string; label: string };
export type QuickAddResult = {
  title: string;
  assigneeId?: string;
  priority?: number;
  dueDate?: string;
  tokens: QuickAddToken[];
};

const fold = (s: string) =>
  s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").normalize("NFKD").replace(/[̀-ͯ]/g, "");

const PRIORITIES: Record<string, number> = {
  dringend: 4, urgent: 4, "1": 4,
  hoch: 3, high: 3, "2": 3,
  mittel: 2, medium: 2, "3": 2,
  niedrig: 1, low: 1, "4": 1,
};
const PRIORITY_LABEL = ["Keine", "Niedrig", "Mittel", "Hoch", "Dringend"];

const WEEKDAYS: Record<string, number> = {
  montag: 1, mo: 1, dienstag: 2, di: 2, mittwoch: 3, mi: 3, donnerstag: 4, do: 4, freitag: 5, fr: 5, samstag: 6, sa: 6, sonntag: 0, so: 0,
};

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function validDate(y: number, m: number, d: number): string | null {
  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const t = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().startsWith(iso) ? iso : null;
}

/** Resolves a ^date word relative to `today` (YYYY-MM-DD, Europe/Berlin). */
export function parseDueWord(word: string, today: string): string | null {
  const w = fold(word);
  if (w === "heute") return today;
  if (w === "morgen") return addDays(today, 1);
  if (w === "uebermorgen") return addDays(today, 2);
  if (w === "naechste-woche" || w === "naechstewoche") {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    return addDays(today, ((8 - dow) % 7) || 7); // next Monday
  }
  const plus = w.match(/^\+(\d{1,3})$/);
  if (plus) return addDays(today, Number(plus[1]));
  if (w in WEEKDAYS) {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    return addDays(today, (WEEKDAYS[w]! - dow + 7) % 7); // same weekday = today
  }
  const iso = w.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return validDate(+iso[1]!, +iso[2]!, +iso[3]!);
  const de = w.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})?$/);
  if (de) {
    const [y0] = today.split("-").map(Number) as [number];
    let year = de[3] ? Number(de[3].length === 2 ? `20${de[3]}` : de[3]) : y0;
    let result = validDate(year, +de[2]!, +de[1]!);
    // "24.12." without year: next occurrence (this year or next).
    if (result && !de[3] && result < today) {
      year += 1;
      result = validDate(year, +de[2]!, +de[1]!);
    }
    return result;
  }
  return null;
}

function findMember(word: string, members: QuickAddMember[], currentUserId?: string): QuickAddMember | null {
  const w = fold(word);
  if ((w === "ich" || w === "me") && currentUserId) return members.find((m) => m.id === currentUserId) ?? null;
  const exact = members.filter((m) => fold(m.name).replace(/\s+/g, "") === w.replace(/[._-]/g, ""));
  if (exact.length === 1) return exact[0]!;
  const first = members.filter((m) => fold(m.name).split(/\s+/)[0] === w);
  if (first.length === 1) return first[0]!;
  const prefix = members.filter((m) => fold(m.name).startsWith(w));
  return prefix.length === 1 ? prefix[0]! : null; // ambiguous → no match
}

const dateFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });

export function parseQuickAdd(input: string, opts: { members: QuickAddMember[]; today: string; currentUserId?: string }): QuickAddResult {
  const result: QuickAddResult = { title: "", tokens: [] };
  const kept: string[] = [];
  for (const part of input.split(/\s+/).filter(Boolean)) {
    const m = part.match(/^([@!^])(.+)$/);
    if (m) {
      const [, sigil, word] = m as unknown as [string, string, string];
      if (sigil === "@" && result.assigneeId === undefined) {
        const member = findMember(word, opts.members, opts.currentUserId);
        if (member) {
          result.assigneeId = member.id;
          result.tokens.push({ kind: "assignee", raw: part, label: member.name });
          continue;
        }
      }
      if (sigil === "!" && result.priority === undefined) {
        const p = PRIORITIES[fold(word)];
        if (p !== undefined) {
          result.priority = p;
          result.tokens.push({ kind: "priority", raw: part, label: PRIORITY_LABEL[p]! });
          continue;
        }
      }
      if (sigil === "^" && result.dueDate === undefined) {
        const d = parseDueWord(word, opts.today);
        if (d) {
          result.dueDate = d;
          result.tokens.push({ kind: "due", raw: part, label: dateFmt.format(new Date(`${d}T00:00:00Z`)) });
          continue;
        }
      }
    }
    kept.push(part);
  }
  result.title = kept.join(" ");
  return result;
}
