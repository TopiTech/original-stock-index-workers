import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workerSrc = readFileSync(resolve("worker/index.ts"), "utf-8");

describe("regression: worker API contract", () => {
  it("R1: /api/snapshot response includes open/high/low required by src/types Snapshot", () => {
    // Worker snapshot block must define all required Snapshot fields
    expect(workerSrc).toMatch(/const snapshot = \{[^}]*\bopen:/s);
    expect(workerSrc).toMatch(/const snapshot = \{[^}]*\bhigh:/s);
    expect(workerSrc).toMatch(/const snapshot = \{[^}]*\blow:/s);
  });

  it("R2: CORS response includes Vary: Origin to prevent cache poisoning", () => {
    expect(workerSrc).toMatch(/headers\[.vary.\]\s*=\s*.Origin./i);
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
