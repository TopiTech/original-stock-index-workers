import { describe, it, expect } from "vitest";
import { buildChartData } from "./chartData";
import type { PricePoint } from "../types";

describe("buildChartData", () => {
  const base = 1000;

  it("uses date-aligned nikkei value when available", () => {
    const nikkei: PricePoint[] = [
      { date: "2026-04-01", close: 1000 },
      { date: "2026-04-02", close: 1100 },
    ];
    const custom: PricePoint[] = [
      { date: "2026-04-01", close: 100, value: 1000 },
      { date: "2026-04-02", close: 110, value: 1100 },
    ];
    const result = buildChartData(nikkei, custom, base);
    expect(result[0].nikkei).toBe(1000);
    expect(result[1].nikkei).toBe(1100);
  });

  it("does not use positional fallback when dates diverge (R2 regression)", () => {
    const nikkei: PricePoint[] = [
      { date: "2026-04-01", close: 1000 },
      { date: "2026-04-02", close: 2000 },
      { date: "2026-04-03", close: 3000 },
    ];
    const custom: PricePoint[] = [
      { date: "2026-04-01", close: 100, value: 1000 },
      { date: "2026-04-03", close: 120, value: 1200 },
    ];
    const result = buildChartData(nikkei, custom, base);
    expect(result[0].nikkei).toBe(1000);
    // 2026-04-03 should map to nikkei 3000, not positional nikkei[1]=2000
    expect(result[1].nikkei).toBe(3000);
  });

  it("forward-fills nikkei when date missing", () => {
    const nikkei: PricePoint[] = [
      { date: "2026-04-01", close: 1000 },
      { date: "2026-04-02", close: 1100 },
    ];
    const custom: PricePoint[] = [
      { date: "2026-04-01", close: 100, value: 1000 },
      { date: "2026-04-02", close: 110, value: 1100 },
      { date: "2026-04-03", close: 120, value: 1200 },
    ];
    const result = buildChartData(nikkei, custom, base);
    expect(result[2].nikkei).toBe(1100);
  });

  it("returns empty when either series is empty", () => {
    expect(buildChartData([], [{ date: "2026-04-01", close: 1, value: 1000 }], base)).toEqual([]);
    expect(buildChartData([{ date: "2026-04-01", close: 1000 }], [], base)).toEqual([]);
  });
});
