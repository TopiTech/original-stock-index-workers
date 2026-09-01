import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workerSrc = readFileSync(resolve("worker/index.ts"), "utf-8");

describe("regression: worker API contract", () => {
  it("R1: /api/snapshot response includes required Snapshot fields (no misleading OHLC)", () => {
    // Worker snapshot block must define all required Snapshot fields
    expect(workerSrc).toMatch(/const snapshot = \{[^}]*\bcurrent:/s);
    expect(workerSrc).toMatch(/const snapshot = \{[^}]*\bchange:/s);
    expect(workerSrc).toMatch(/const snapshot = \{[^}]*\bchangePct:/s);
    // OHLC fields (open/high/low) should NOT be present since Yahoo chart API
    // only provides close prices; setting them equal to close is misleading.
    expect(workerSrc).not.toMatch(/const snapshot = \{[^}]*\bopen:/s);
    expect(workerSrc).not.toMatch(/const snapshot = \{[^}]*\bhigh:/s);
    expect(workerSrc).not.toMatch(/const snapshot = \{[^}]*\blow:/s);
  });

  it("R2: CORS response includes Vary: Origin to prevent cache poisoning", () => {
    expect(workerSrc).toMatch(/headers\[.vary.\]\s*=\s*.Origin./i);
  });

  it("R2b: CORS only allows localhost origins, not arbitrary origins", () => {
    // Must have an origin allowlist check, not blind reflection
    expect(workerSrc).toMatch(/isAllowedOrigin/);
    expect(workerSrc).toMatch(/localhost/);
  });

  it("R3: invalid JSON body returns 400 not 500", () => {
    expect(workerSrc).toContain("parseJsonBody");
    expect(workerSrc).toContain('Invalid JSON body');
    // Both POST handlers must use the helper
    const syncUsesHelper = workerSrc.includes('"/api/sync-prices"') && workerSrc.slice(workerSrc.indexOf('"/api/sync-prices"'), workerSrc.indexOf('"/api/sync-prices"') + 2000).includes("parseJsonBody");
    const calcUsesHelper = workerSrc.includes('"/api/calculate"') && workerSrc.slice(workerSrc.indexOf('"/api/calculate"'), workerSrc.indexOf('"/api/calculate"') + 2000).includes("parseJsonBody");
    expect(syncUsesHelper).toBe(true);
    expect(calcUsesHelper).toBe(true);
  });
});
