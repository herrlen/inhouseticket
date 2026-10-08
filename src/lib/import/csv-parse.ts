// RFC 4180 CSV reader for import files (Jira, ClickUp, Excel "Save as CSV"). Detects the
// delimiter (comma, semicolon, tab) from the header line; quoted cells may contain line breaks.

export type CsvResult = { ok: true; rows: string[][] } | { ok: false; error: "empty" | "too_many_rows" };

const DELIMITERS = [",", ";", "\t"] as const;

/** Delimiter that occurs most often outside quotes in the first line. */
export function detectDelimiter(text: string): string {
  const counts = new Map<string, number>(DELIMITERS.map((d) => [d, 0]));
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted && counts.has(ch)) counts.set(ch, counts.get(ch)! + 1);
  }
  let best: string = ",";
  for (const d of DELIMITERS) if (counts.get(d)! > counts.get(best)!) best = d;
  return best;
}

/** Parses CSV text into rows of cells. Fully empty lines are dropped. */
export function parseCsv(input: string, maxRows: number): CsvResult {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = 0;

  const endRow = () => {
    row.push(cell);
    cell = "";
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else cell += ch;
      i++;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      endRow();
      if (rows.length > maxRows) return { ok: false, error: "too_many_rows" };
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else cell += ch;
    i++;
  }
  if (cell !== "" || row.length > 0) endRow();
  if (rows.length > maxRows) return { ok: false, error: "too_many_rows" };
  return rows.length === 0 ? { ok: false, error: "empty" } : { ok: true, rows };
}

/** Decodes an uploaded file: UTF-8 if valid, else Windows-1252 (Excel on Windows). */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
