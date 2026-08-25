import { describe, it, expect } from "vitest";
import { normalizeWeights, calculateCustomIndex } from "../lib/indexEngine";
import type { BasketItem, StockSeries } from "../types";

describe("normalizeWeights", () => {
  it("normalizes weights to sum to 100", () => {
    const items: BasketItem[] = [
      { ticker: "A", name: "Stock A", theme: "tech", weight: 30 },
      { ticker: "B", name: "Stock B", theme: "tech", weight: 20 },
    ];
    const result = normalizeWeights(items);
    const total = result.reduce((s, i) => s + i.weight, 0);
    expect(total).toBeCloseTo(100, 2);
    expect(result[0].weight).toBeCloseTo(60, 2);
    expect(result[1].weight).toBeCloseTo(40, 2);
  });

  it("returns items unchanged when total is 0", () => {
    const items: BasketItem[] = [
      { ticker: "A", name: "Stock A", theme: "tech", weight: 0 },
    ];
    const result = normalizeWeights(items);
    expect(result).toEqual(items);
  });

  it("handles single item", () => {
    const items: BasketItem[] = [
      { ticker: "A", name: "Stock A", theme: "tech", weight: 50 },
    ];
    const result = normalizeWeights(items);
    expect(result[0].weight).toBeCloseTo(100, 2);
  });

  it("handles negative and NaN weights safely", () => {
    const items: BasketItem[] = [
      { ticker: "A", name: "Stock A", theme: "tech", weight: 50 },
      { ticker: "B", name: "Stock B", theme: "tech", weight: -10 },
      { ticker: "C", name: "Stock C", theme: "tech", weight: NaN as any },
    ];
    const result = normalizeWeights(items);
    expect(result[0].weight).toBe(100);
    expect(result[1].weight).toBe(0);
    expect(result[2].weight).toBe(0);
  });
});

describe("calculateCustomIndex", () => {
  const makeStock = (ticker: string, basePrice: number, multipliers: number[]): StockSeries => ({
    ticker,
    name: ticker,
    theme: "test",
    sector: "Test",
    latestPrice: basePrice * multipliers[multipliers.length - 1],
    series: multipliers.map((m, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, "0")}`,
      close: Number((basePrice * m).toFixed(2)),
    })),
  });

  it("returns empty for empty basket", () => {
    const result = calculateCustomIndex([], [], 1000);
    expect(result).toEqual([]);
  });

  it("returns empty when no stock data is available", () => {
    const basket: BasketItem[] = [
      { ticker: "X", name: "X", theme: "t", weight: 100 },
    ];
    const result = calculateCustomIndex(basket, [], 1000);
    expect(result).toEqual([]);
  });

  it("calculates index value correctly for a single stock and includes close property", () => {
    const basket: BasketItem[] = [
      { ticker: "A", name: "Stock A", theme: "t", weight: 100 },
    ];
    const universe: StockSeries[] = [
      makeStock("A", 1000, [1.0, 1.1, 1.2]),
    ];
    const result = calculateCustomIndex(basket, universe, 1000);
    expect(result.length).toBe(3);
    // Day 0: base = 1000 * (1000/1000) = 1000
    expect(result[0].value).toBe(1000);
    expect(result[0].close).toBe(1000);
    // Day 1: 1000 * (1100/1000) = 1100
    expect(result[1].value).toBe(1100);
    expect(result[1].close).toBe(1100);
    // Day 2: 1000 * (1200/1000) = 1200
    expect(result[2].value).toBe(1200);
    expect(result[2].close).toBe(1200);
  });

  it("calculates weighted index for two stocks", () => {
    const basket: BasketItem[] = [
      { ticker: "A", name: "Stock A", theme: "t", weight: 50 },
      { ticker: "B", name: "Stock B", theme: "t", weight: 50 },
    ];
    // A: 1000 → 1100 (10% up), B: 2000 → 2000 (0% change)
    const universe: StockSeries[] = [
      makeStock("A", 1000, [1.0, 1.1]),
      makeStock("B", 2000, [1.0, 1.0]),
    ];
    const result = calculateCustomIndex(basket, universe, 1000);
    // Day 0: 1000 * (0.5 * 1.0 + 0.5 * 1.0) = 1000
    expect(result[0].value).toBe(1000);
    // Day 1: 1000 * (0.5 * 1.1 + 0.5 * 1.0) = 1050
    expect(result[1].value).toBe(1050);
  });

  it("skips stocks with no data and re-normalizes weights", () => {
    const basket: BasketItem[] = [
      { ticker: "A", name: "Stock A", theme: "t", weight: 50 },
      { ticker: "B", name: "Stock B", theme: "t", weight: 50 },
    ];
    // Only A has data; B is missing from universe
    const universe: StockSeries[] = [
      makeStock("A", 1000, [1.0, 1.2]),
    ];
    const result = calculateCustomIndex(basket, universe, 1000);
    // A's weight gets re-normalized to 100%
    expect(result[0].value).toBe(1000);
    expect(result[1].value).toBe(1200);
  });

  it("sorts dates correctly in YYYY-MM-DD format", () => {
    const basket: BasketItem[] = [
      { ticker: "A", name: "Stock A", theme: "t", weight: 100 },
    ];
    const universe: StockSeries[] = [{
      ticker: "A",
      name: "A",
      theme: "t",
      sector: "Test",
      latestPrice: 1100,
      series: [
        { date: "2026-03-28", close: 900 },
        { date: "2026-04-01", close: 1000 },
        { date: "2026-04-02", close: 1100 },
      ],
    }];
    const result = calculateCustomIndex(basket, universe, 1000);
    expect(result.length).toBe(3);
    expect(result[0].date).toBe("2026-03-28");
    expect(result[1].date).toBe("2026-04-01");
    expect(result[2].date).toBe("2026-04-02");
  });

  it("handles custom base values and invalid baseValue fallback", () => {
    const basket: BasketItem[] = [
      { ticker: "A", name: "Stock A", theme: "t", weight: 100 },
    ];
    const universe: StockSeries[] = [
      makeStock("A", 100, [1.0, 1.5]),
    ];
    const result500 = calculateCustomIndex(basket, universe, 500);
    expect(result500[0].value).toBe(500);
    expect(result500[1].value).toBe(750);

    const resultInvalid = calculateCustomIndex(basket, universe, -100 as any);
    expect(resultInvalid[0].value).toBe(1000);
    expect(resultInvalid[1].value).toBe(1500);
  });

  it("forward-fills missing dates correctly across multiple stocks", () => {
    const basket: BasketItem[] = [
      { ticker: "A", name: "Stock A", theme: "t", weight: 50 },
      { ticker: "B", name: "Stock B", theme: "t", weight: 50 },
    ];
    const universe: StockSeries[] = [
      {
        ticker: "A",
        name: "Stock A",
        theme: "t",
        sector: "Test",
        latestPrice: 120,
        series: [
          { date: "2026-04-01", close: 100 },
          { date: "2026-04-02", close: 110 },
          { date: "2026-04-03", close: 120 },
        ],
      },
      {
        ticker: "B",
        name: "Stock B",
        theme: "t",
        sector: "Test",
        latestPrice: 200,
        series: [
          { date: "2026-04-01", close: 200 },
          // Day 2 (2026-04-02) is missing for stock B: forward fills 200
          { date: "2026-04-03", close: 220 },
        ],
      },
    ];
    const result = calculateCustomIndex(basket, universe, 1000);
    expect(result.length).toBe(3);
    // Day 0: 1000 * (0.5 * 1.0 + 0.5 * 1.0) = 1000
    expect(result[0].value).toBe(1000);
    // Day 1: A is 110 (1.10), B is forward-filled 200 (1.00) -> 1000 * (0.55 + 0.50) = 1050
    expect(result[1].value).toBe(1050);
    // Day 2: A is 120 (1.20), B is 220 (1.10) -> 1000 * (0.60 + 0.55) = 1150
    expect(result[2].value).toBe(1150);
  });
});
