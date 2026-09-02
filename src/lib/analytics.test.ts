import { describe, it, expect } from "vitest";
import { calculateSMA, calculateRiskMetrics, calculateStockDetails } from "./analytics";
import type { BasketItem, PricePoint, StockSeries } from "../types";

describe("analytics library", () => {
  describe("calculateSMA", () => {
    it("correctly calculates 3-period SMA", () => {
      const data = [10, 20, 30, 40, 50];
      const sma = calculateSMA(data, 3);
      expect(sma).toEqual([null, null, 20, 30, 40]);
    });

    it("handles window larger than data length", () => {
      const data = [10, 20];
      const sma = calculateSMA(data, 5);
      expect(sma).toEqual([null, null]);
    });
  });

  describe("calculateRiskMetrics", () => {
    it("computes risk metrics correctly for sample series", () => {
      const custom: PricePoint[] = [
        { date: "2026-01-01", close: 1000, value: 1000 },
        { date: "2026-01-02", close: 1020, value: 1020 },
        { date: "2026-01-03", close: 1010, value: 1010 },
        { date: "2026-01-04", close: 1050, value: 1050 },
      ];
      const bench: PricePoint[] = [
        { date: "2026-01-01", close: 38000 },
        { date: "2026-01-02", close: 38380 },
        { date: "2026-01-03", close: 38000 },
        { date: "2026-01-04", close: 38760 },
      ];

      const metrics = calculateRiskMetrics(custom, bench);
      expect(metrics.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(metrics.winRate).toBeGreaterThan(0);
      expect(typeof metrics.beta).toBe("number");
      expect(typeof metrics.annualVolatility).toBe("number");
    });
  });

  describe("calculateStockDetails", () => {
    it("computes stock changes, contributions, and sparklines", () => {
      const basket: BasketItem[] = [
        { ticker: "7203", name: "トヨタ", weight: 50, theme: "自動車" },
        { ticker: "9984", name: "ソフトバンクG", weight: 50, theme: "AI" },
      ];
      const universe: StockSeries[] = [
        {
          ticker: "7203",
          name: "トヨタ",
          theme: "自動車",
          sector: "Auto",
          latestPrice: 2800,
          series: [
            { date: "2026-01-01", close: 2700 },
            { date: "2026-01-02", close: 2800 },
          ],
        },
        {
          ticker: "9984",
          name: "ソフトバンクG",
          theme: "AI",
          sector: "Tech",
          latestPrice: 8500,
          series: [
            { date: "2026-01-01", close: 8600 },
            { date: "2026-01-02", close: 8500 },
          ],
        },
      ];

      const details = calculateStockDetails(basket, universe, 1000, [
        { date: "2026-01-01", close: 1000, value: 1000 },
        { date: "2026-01-02", close: 1010, value: 1010 },
      ]);

      expect(details).toHaveLength(2);
      const toyota = details.find((d) => d.ticker === "7203")!;
      expect(toyota.change).toBe(100);
      expect(toyota.changePct).toBeCloseTo(3.7, 1);
      expect(toyota.contributionPt).toBeGreaterThan(0);
      expect(toyota.sparkline).toEqual([2700, 2800]);
    });
  });
});
