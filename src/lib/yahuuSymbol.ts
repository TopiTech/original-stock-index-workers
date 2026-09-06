/**
 * Normalize a ticker to the form used by the backend Worker's Yahoo Finance
 * fetcher. This keeps the external link in the UI aligned with the market data
 * source, including Japanese Tokyo exchange suffixes (`.T`) and passthrough
 * for index/forex symbols.
 */
export function toYahooSymbol(ticker: string): string {
  const trimmed = ticker.trim().toUpperCase();
  if (trimmed.includes(".") || trimmed.startsWith("^") || trimmed.endsWith("=X")) {
    return trimmed;
  }
  if (/^\\d/.test(trimmed)) {
    return `${trimmed}.T`;
  }
  return trimmed;
}
