/**
 * Escapes a value for a CSV cell that may be opened in spreadsheet software.
 *
 * Quoting alone does not stop Excel-compatible programs from evaluating a
 * leading formula character, so prefix potentially executable cells with an
 * apostrophe before applying RFC 4180-style quote escaping.
 */
export function escapeCsvCell(value: unknown): string {
  const raw = String(value ?? "");
  const formulaSafe = /^[\s\uFEFF]*[=+\-@]/u.test(raw) ? `'${raw}` : raw;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
}
