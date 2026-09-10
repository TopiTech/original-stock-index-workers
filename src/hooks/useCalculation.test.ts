import { describe, expect, it } from "vitest";
import { determineSyncForce, getMissingPriceDataTickers, parseLocalSyncCache } from "./useCalculation";

describe("parseLocalSyncCache", () => {
  it("ignores malformed and non-positive timestamps from browser storage", () => {
    expect(parseLocalSyncCache(JSON.stringify({
      AAPL: 1_700_000_000_000,
      aapl: 1_600_000_000_000,
      INVALID_TEXT: "fresh",
      ZERO: 0,
      NAN: null,
      NEGATIVE: -1,
    }))).toEqual({ AAPL: 1_700_000_000_000 });
  });

  it("returns an empty cache for non-object JSON values", () => {
    expect(parseLocalSyncCache("[]")).toEqual({});
    expect(parseLocalSyncCache("not-json")).toEqual({});
  });
});

describe("getMissingPriceDataTickers", () => {
  it("reports tickers that are returned without any usable price points", () => {
    const missing = getMissingPriceDataTickers(
      [
        { ticker: "7203", name: "Toyota", theme: "Auto", weight: 40 },
        { ticker: "9984", name: "SoftBank", theme: "AI", weight: 30 },
        { ticker: "8035", name: "Tokyo Electron", theme: "Semi", weight: 30 },
      ],
      [
        {
          ticker: "7203",
          name: "Toyota",
          theme: "Auto",
          sector: "Test",
          latestPrice: 0,
          series: [],
        },
        {
          ticker: "9984",
          name: "SoftBank",
          theme: "AI",
          sector: "Test",
          latestPrice: 100,
          series: [{ date: "2026-09-04", close: 100 }],
        },
      ],
    );

    expect(missing).toEqual(["7203", "8035"]);
  });

  it("matches ticker case-insensitively and ignores invalid price points", () => {
    const missing = getMissingPriceDataTickers(
      [
        { ticker: "abc", name: "A", theme: "T", weight: 50 },
        { ticker: "XYZ", name: "X", theme: "T", weight: 50 },
      ],
      [
        {
          ticker: "ABC",
          name: "A",
          theme: "T",
          sector: "Test",
          latestPrice: 0,
          series: [{ date: "2026-09-04", close: Number.NaN }],
        },
        {
          ticker: "xyz",
          name: "X",
          theme: "T",
          sector: "Test",
          latestPrice: 12,
          series: [{ date: "2026-09-04", close: 12 }],
        },
      ],
    );

    expect(missing).toEqual(["abc"]);
  });
});

describe("determineSyncForce", () => {
  it("returns false if force is false, regardless of session", () => {
    expect(determineSyncForce(false, null)).toBe(false);
    expect(determineSyncForce(false, { password: "admin-password" })).toBe(false);
  });

  it("returns false if force is true but session has no password (prevents 401 on unauthenticated retries)", () => {
    expect(determineSyncForce(true, null)).toBe(false);
    expect(determineSyncForce(true, undefined)).toBe(false);
    expect(determineSyncForce(true, { password: "" })).toBe(false);
  });

  it("returns true only if force is true and session has a password", () => {
    expect(determineSyncForce(true, { password: "valid-password" })).toBe(true);
  });
});

