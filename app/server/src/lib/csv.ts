/**
 * CSV writer for admin exports. Fields are quoted when needed, and values that a
 * spreadsheet would run as a formula (=, +, -, @, tab, CR) are prefixed with an
 * apostrophe so an export can't be used to smuggle formulas into Excel or Sheets.
 */
const FORMULA = /^[=+\-@\t\r]/;

export function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  // BOM so Excel opens UTF-8 names (accents etc.) correctly.
  return '\uFEFF' + [header, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}
