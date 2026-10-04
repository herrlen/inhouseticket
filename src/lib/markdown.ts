// Light Markdown (KONZEPT §2.3): **bold**, *italic*/_italic_, `code`, ```code blocks```,
// - / * lists, 1. lists, [links](https://…), bare URLs and @[Name](userId) mentions.
// Produces a small AST – rendering never uses raw HTML, so user text cannot inject markup.

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] }
  | { t: "mention"; userId: string; name: string };

export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][] }
  | { t: "pre"; v: string };

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

export function isSafeUrl(url: string): boolean {
  return SAFE_URL.test(url.trim());
}

/** Inline tokens, left to right; first matching pattern wins. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ t: "text", v: text });
    text = "";
  };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^`([^`\n]+)`/))) {
      flush();
      out.push({ t: "code", v: m[1]! });
    } else if ((m = rest.match(/^@\[([^\]\n]{1,100})\]\(([A-Za-z0-9_-]{1,100})\)/))) {
      flush();
      out.push({ t: "mention", name: m[1]!, userId: m[2]! });
    } else if ((m = rest.match(/^\[([^\]\n]+)\]\(([^)\s]+)\)/)) && isSafeUrl(m[2]!)) {
      flush();
      out.push({ t: "link", href: m[2]!, c: parseInline(m[1]!) });
    } else if ((m = rest.match(/^\*\*(?=\S)([^\n]*?\S)\*\*/))) {
      flush();
      out.push({ t: "strong", c: parseInline(m[1]!) });
    } else if ((m = rest.match(/^([*_])(?=\S)([^\n]*?\S)\1(?![A-Za-z0-9])/)) && !(m[1] === "_" && /[A-Za-z0-9]$/.test(text))) {
      flush();
      out.push({ t: "em", c: parseInline(m[2]!) });
    } else if ((m = rest.match(/^https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/)) && !/[A-Za-z0-9]$/.test(text)) {
      flush();
      out.push({ t: "link", href: m[0], c: [{ t: "text", v: m[0] }] });
    } else {
      text += src[i];
      i++;
      continue;
    }
    i += m[0].length;
  }
  flush();
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const endPara = () => {
    if (para.length) blocks.push({ t: "p", c: parseInline(para.join("\n")) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim().startsWith("```")) {
      endPara();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith("```")) code.push(lines[i++]!);
      blocks.push({ t: "pre", v: code.join("\n") });
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      endPara();
      const kind = bullet ? "ul" : "ol";
      const items: Inline[][] = [];
      while (i < lines.length) {
        const m = kind === "ul" ? lines[i]!.match(/^\s*[-*]\s+(.*)$/) : lines[i]!.match(/^\s*\d+[.)]\s+(.*)$/);
        if (!m) break;
        items.push(parseInline(m[1]!));
        i++;
      }
      i--;
      blocks.push({ t: kind, items });
      continue;
    }
    if (line.trim() === "") endPara();
    else para.push(line);
  }
  endPara();
  return blocks;
}

/** User ids mentioned in a text (unique). */
export function mentionedUserIds(src: string): string[] {
  return [...new Set([...src.matchAll(/@\[[^\]\n]{1,100}\]\(([A-Za-z0-9_-]{1,100})\)/g)].map((m) => m[1]!))];
}
