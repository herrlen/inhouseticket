// CSV for German Excel: semicolon-separated, UTF-8 with BOM, CRLF. Cells that Excel would read as
// a formula (=, +, -, @, tab, CR) get a leading apostrophe (CSV injection).

const FORMULA = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (FORMULA.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>): string {
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
