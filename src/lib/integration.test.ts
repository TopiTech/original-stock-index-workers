import { describe, it, expect, vi } from "vitest";
import worker from "../../worker/index";
import { buildChartData } from "./chartData";
import { normalizeWeights, calculateCustomIndex } from "./indexEngine";
import type { BasketItem, PricePoint, StockSeries } from "../types";

describe("integration: end-to-end index engine & chart pipeline", () => {
  it("processes a multi-theme basket through normalization, engine calculation, and chart alignment", () => {
    const basket: BasketItem[] = [
      { ticker: "7203", name: "Toyota", theme: "Auto", weight: 40 },
      { ticker: "9984", name: "SoftBank", theme: "Tech", weight: 60 },
    ];

    const normalized = normalizeWeights(basket);
    expect(normalized[0].weight).toBe(40);
    expect(normalized[1].weight).toBe(60);

    const universe: StockSeries[] = [
      {
        ticker: "7203",
        name: "Toyota",
        theme: "Auto",
        sector: "Auto",
        latestPrice: 2200,
        series: [
          { date: "2026-04-01", close: 2000 },
          { date: "2026-04-02", close: 2100 },
          { date: "2026-04-03", close: 2200 },
        ],
      },
      {
        ticker: "9984",
        name: "SoftBank",
        theme: "Tech",
        sector: "Tech",
        latestPrice: 8800,
        series: [
          { date: "2026-04-01", close: 8000 },
          { date: "2026-04-02", close: 8400 },
          { date: "2026-04-03", close: 8800 },
        ],
      },
    ];

    const customSeries = calculateCustomIndex(basket, universe, 1000);
    expect(customSeries.length).toBe(3);
    // Day 1: base = 1000
    expect(customSeries[0].value).toBe(1000);
    // Day 2: 1000 * (0.4 * 2100/2000 + 0.6 * 8400/8000) = 1000 * (0.4 * 1.05 + 0.6 * 1.05) = 1050
    expect(customSeries[1].value).toBe(1050);
    // Day 3: 1000 * (0.4 * 2200/2000 + 0.6 * 8800/8000) = 1000 * (0.4 * 1.10 + 0.6 * 1.10) = 1100
    expect(customSeries[2].value).toBe(1100);

    const nikkeiSeries: PricePoint[] = [
      { date: "2026-04-01", close: 38000 },
      { date: "2026-04-02", close: 38760 }, // +2%
      { date: "2026-04-03", close: 39900 }, // +5%
    ];

    const chartPoints = buildChartData(nikkeiSeries, customSeries, 1000);
    expect(chartPoints.length).toBe(3);
    expect(chartPoints[0].value).toBe(1000);
    expect(chartPoints[0].nikkei).toBe(1000);
    expect(chartPoints[1].value).toBe(1050);
    expect(chartPoints[1].nikkei).toBe(1020);
    expect(chartPoints[2].value).toBe(1100);
    expect(chartPoints[2].nikkei).toBe(1050);
  });

  it("handles unsorted dates gracefully in buildChartData", () => {
    const nikkei: PricePoint[] = [
      { date: "2026-04-03", close: 39900 },
      { date: "2026-04-01", close: 38000 },
      { date: "2026-04-02", close: 38760 },
    ];
    const custom: PricePoint[] = [
      { date: "2026-04-02", close: 1050, value: 1050 },
      { date: "2026-04-01", close: 1000, value: 1000 },
      { date: "2026-04-03", close: 1100, value: 1100 },
    ];

    const chart = buildChartData(nikkei, custom, 1000);
    expect(chart.length).toBe(3);
    expect(chart[0].date).toBe("2026-04-01");
    expect(chart[0].nikkei).toBe(1000);
    expect(chart[1].date).toBe("2026-04-02");
    expect(chart[1].nikkei).toBe(1020);
    expect(chart[2].date).toBe("2026-04-03");
    expect(chart[2].nikkei).toBe(1050);
  });
});

describe("integration: worker indices query edge cases", () => {
  it("safely handles indices with null or zero base_value in database", async () => {
    const mockEnv = {
      ASSETS: { fetch: vi.fn() },
      DB: {
        prepare: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({
            results: [
              {
                id: "zero-base-idx",
                name: "Zero Base Index",
                description: "Test",
                base_value: 0,
                ticker: "7203",
                stock_name: "Toyota",
                weight: 100,
                theme: "Auto",
              },
            ],
          }),
        }),
      },
    };

    const req = new Request("http://localhost/api/indices");
    const res = await worker.fetch(req, mockEnv as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data[0].baseValue).toBe(1000); // defaulted safely to 1000
  });

  it("safely handles indices with no constituents (empty basket)", async () => {
    const mockEnv = {
      ASSETS: { fetch: vi.fn() },
      DB: {
        prepare: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({
            results: [
              {
                id: "empty-idx",
                name: "Empty Index",
                description: "No stocks",
                base_value: 1000,
                ticker: null,
                stock_name: null,
                weight: null,
                theme: null,
              },
            ],
          }),
        }),
      },
    };

    const req = new Request("http://localhost/api/indices");
    const res = await worker.fetch(req, mockEnv as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data[0].basket).toEqual([]);
  });
});
