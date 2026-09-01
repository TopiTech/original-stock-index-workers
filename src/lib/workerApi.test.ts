import { describe, it, expect, vi } from "vitest";
import worker from "../../worker/index";

function createMockEnv(overrides?: Partial<any>) {
  const executeQuery = async (query: string) => {
    if (query.includes("rate_limits")) {
      return { results: [] };
    }
    if (query.includes("snapshot_cache")) {
      return { results: [] };
    }
    if (query.includes("indices")) {
      return {
        results: [
          {
            id: "test-index",
            name: "Test Index",
            description: "Desc",
            base_value: 1000,
            sort_order: 1,
            ticker: "9984",
            stock_name: "SoftBank",
            weight: 100,
            theme: "AI",
          },
        ],
      };
    }
    if (query.includes("stock_prices")) {
      return {
        results: [
          { ticker: "9984", date: "2026-04-01", price: 1000 },
          { ticker: "9984", date: "2026-04-02", price: 1100 },
        ],
      };
    }
    if (query.includes("sync_logs")) {
      return { results: [] };
    }
    return { results: [] };
  };

  const prepareMock = vi.fn().mockImplementation((query: string) => {
    return {
      bind: vi.fn().mockImplementation((..._params: any[]) => {
        return {
          all: () => executeQuery(query),
          run: vi.fn().mockResolvedValue({ success: true }),
        };
      }),
      all: () => executeQuery(query),
      run: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  return {
    ASSETS: {
      fetch: vi.fn().mockResolvedValue(new Response("Asset", { status: 200 })),
    },
    DB: {
      prepare: prepareMock,
      batch: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
}

describe("worker fetch handlers", () => {
  it("handles OPTIONS request with CORS headers for localhost origin", async () => {
    const env = createMockEnv();
    const req = new Request("http://localhost/api/health", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173" },
    });
    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(res.headers.get("vary")).toBe("Origin");
  });

  it("does not set CORS headers for non-localhost origins", async () => {
    const env = createMockEnv();
    const req = new Request("http://localhost/api/health", {
      method: "OPTIONS",
      headers: { Origin: "http://example.com" },
    });
    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("handles GET /api/health", async () => {
    const env = createMockEnv();
    const req = new Request("http://localhost/api/health");
    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true, service: "original-stock-index-worker" });
  });

  it("handles GET /api/indices", async () => {
    const env = createMockEnv();
    const req = new Request("http://localhost/api/indices");
    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.length).toBe(1);
    expect(data[0].id).toBe("test-index");
    expect(data[0].basket.length).toBe(1);
    expect(data[0].basket[0].ticker).toBe("9984");
  });

  it("validates POST /api/sync-prices inputs", async () => {
    const env = createMockEnv();

    // Invalid JSON
    const res1 = await worker.fetch(
      new Request("http://localhost/api/sync-prices", {
        method: "POST",
        body: "invalid-json",
      }),
      env as any,
    );
    expect(res1.status).toBe(400);

    // Empty tickers
    const res2 = await worker.fetch(
      new Request("http://localhost/api/sync-prices", {
        method: "POST",
        body: JSON.stringify({ tickers: [] }),
      }),
      env as any,
    );
    expect(res2.status).toBe(400);

    // Invalid ticker characters
    const res3 = await worker.fetch(
      new Request("http://localhost/api/sync-prices", {
        method: "POST",
        body: JSON.stringify({ tickers: ["invalid ticker!!"] }),
      }),
      env as any,
    );
    expect(res3.status).toBe(400);
  });

  it("validates POST /api/calculate inputs", async () => {
    const env = createMockEnv();

    // Invalid baseValue
    const res1 = await worker.fetch(
      new Request("http://localhost/api/calculate", {
        method: "POST",
        body: JSON.stringify({ basket: [{ ticker: "9984", name: "SBG", theme: "AI", weight: 100 }], baseValue: -5 }),
      }),
      env as any,
    );
    expect(res1.status).toBe(400);

    // Invalid weight (>100)
    const res2 = await worker.fetch(
      new Request("http://localhost/api/calculate", {
        method: "POST",
        body: JSON.stringify({ basket: [{ ticker: "9984", name: "SBG", theme: "AI", weight: 150 }] }),
      }),
      env as any,
    );
    expect(res2.status).toBe(400);
  });

  it("executes POST /api/calculate successfully", async () => {
    const env = createMockEnv();
    const req = new Request("http://localhost/api/calculate", {
      method: "POST",
      body: JSON.stringify({
        basket: [{ ticker: "9984", name: "SoftBank", theme: "AI", weight: 100 }],
        baseValue: 1000,
      }),
    });
    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.baseValue).toBe(1000);
    expect(data.series.length).toBe(2);
    expect(data.series[0].value).toBe(1000);
    expect(data.series[1].value).toBe(1100);
  });
});
