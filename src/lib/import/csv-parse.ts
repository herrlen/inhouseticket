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

/**
 * Rows of cells, one at a time – a large export never exists as one big array of rows. Fully
 * empty lines are dropped. Cells are built from slices, not char by char (a 50 MB file stays fast).
 */
export function* csvRows(input: string): Generator<string[]> {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  const n = text.length;
  let row: string[] = [];
  let i = 0;
  while (i < n) {
    let cell: string;
    if (text[i] === '"') {
      // Quoted cell: up to the closing quote; "" is an escaped quote.
      let out = "";
      let start = ++i;
      for (;;) {
        const q = text.indexOf('"', i);
        if (q < 0) {
          out += text.slice(start);
          i = n;
          break;
        }
        if (text[q + 1] === '"') {
          out += text.slice(start, q + 1);
          i = start = q + 2;
          continue;
        }
        out += text.slice(start, q);
        i = q + 1;
        break;
      }
      // Lenient: anything between the closing quote and the next delimiter belongs to the cell.
      let j = i;
      while (j < n && text[j] !== delimiter && text[j] !== "\n" && text[j] !== "\r") j++;
      cell = out + text.slice(i, j);
      i = j;
    } else {
      let j = i;
      while (j < n && text[j] !== delimiter && text[j] !== "\n" && text[j] !== "\r") j++;
      cell = text.slice(i, j);
      i = j;
    }
    row.push(cell);
    if (i >= n) break;
    const ch = text[i];
    if (ch === delimiter) {
      i++;
      if (i >= n) row.push("");
      continue;
    }
    // Line break.
    if (ch === "\r" && text[i + 1] === "\n") i++;
    i++;
    if (row.length > 1 || row[0] !== "") yield row;
    row = [];
  }
  if (row.length > 1 || (row.length === 1 && row[0] !== "")) yield row;
}

/** Parses CSV text into rows of cells. Fully empty lines are dropped. */
export function parseCsv(input: string, maxRows: number): CsvResult {
  const rows: string[][] = [];
  for (const row of csvRows(input)) {
    rows.push(row);
    if (rows.length > maxRows) return { ok: false, error: "too_many_rows" };
  }
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
