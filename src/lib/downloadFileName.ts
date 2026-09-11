/**
 * Builds a safe download file name from arbitrary user-supplied text.
 *
 * Control characters and reserved filesystem characters are replaced with "_",
 * the result is trimmed, clamped to a conservative length, and a fallback is
 * used when nothing usable remains. Download file names flow into DOM
 * attributes and OS-level paths, so unbounded or control-character input from
 * an index name must never reach them verbatim.
 */
export function toSafeDownloadFileName(raw: string, fallback = "download"): string {
  const cleaned = Array.from(raw ?? "", (character) => {
    const code = character.charCodeAt(0);
    // C0/C1 control characters, DEL, and BOM/RTL overrides are unusable in file names.
    if (code <= 31 || (code >= 127 && code <= 159)) return "_";
    return character;
  })
    .join("")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .trim()
    // The suffix (_constituents_YYYY-MM-DD.csv) adds roughly 30 characters;
    // keep the user portion modest so total length stays filesystem-safe.
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : fallback;
}

/**
 * Parses a numeric input value without ever producing NaN.
 *
 * `<input type="number">` reports "" while the user is clearing the field and
 * partial values such as "12." while typing; Number("") is 0 (not the intended
 * fallback) and Number("12.") is NaN. A NaN that reaches state would poison
 * saved baskets, quota settings, and index calculations, so every numeric
 * input handler funnels through this helper.
 */
export function toFiniteNumberOr(raw: string, fallback: number): number {
  if (raw === null || raw === undefined) return fallback;
  const trimmed = String(raw).trim();
  if (trimmed === "") return fallback;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}
