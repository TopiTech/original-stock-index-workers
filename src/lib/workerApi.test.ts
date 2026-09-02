import { describe, it, expect, vi } from "vitest";
import worker, { toYahooSymbol, SYSTEM_INDICES } from "../../worker/index";

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

  it("serves static assets with immutable cache headers for /assets/*", async () => {
    const env = createMockEnv({
      ASSETS: {
        fetch: vi.fn().mockResolvedValue(
          new Response("console.log('asset')", {
            status: 200,
            headers: { "content-type": "application/javascript" },
          }),
        ),
      },
    });
    const req = new Request("http://localhost/assets/index-DAfVT__E.js");
    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
  });

  it("serves HTML with no-cache headers for root", async () => {
    const env = createMockEnv({
      ASSETS: {
        fetch: vi.fn().mockResolvedValue(
          new Response("<!doctype html><html></html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
        ),
      },
    });
    const req = new Request("http://localhost/");
    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-store, must-revalidate");
  });

  it("returns 404 JSON for unmatched /api/* endpoints instead of falling through to static assets", async () => {
    const env = createMockEnv();
    const req = new Request("http://localhost/api/nonexistent-endpoint");
    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Endpoint not found");
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it("validates POST /api/indices inputs strictly", async () => {
    const env = createMockEnv();

    // Invalid baseValue
    const res1 = await worker.fetch(
      new Request("http://localhost/api/indices", {
        method: "POST",
        body: JSON.stringify({
          name: "Test",
          baseValue: -100,
          basket: [{ ticker: "7203", name: "Toyota", weight: 100 }],
        }),
      }),
      env as any,
    );
    expect(res1.status).toBe(400);

    // Invalid ticker characters
    const res2 = await worker.fetch(
      new Request("http://localhost/api/indices", {
        method: "POST",
        body: JSON.stringify({
          name: "Test",
          basket: [{ ticker: "7203<script>", name: "Toyota", weight: 100 }],
        }),
      }),
      env as any,
    );
    expect(res2.status).toBe(400);

    // Invalid weight
    const res3 = await worker.fetch(
      new Request("http://localhost/api/indices", {
        method: "POST",
        body: JSON.stringify({
          name: "Test",
          basket: [{ ticker: "7203", name: "Toyota", weight: 0 }],
        }),
      }),
      env as any,
    );
    expect(res3.status).toBe(400);

    // Empty basket
    const res4 = await worker.fetch(
      new Request("http://localhost/api/indices", {
        method: "POST",
        body: JSON.stringify({ name: "Test", basket: [] }),
      }),
      env as any,
    );
    expect(res4.status).toBe(400);
  });

  it("validates DELETE /api/indices parameter", async () => {
    const env = createMockEnv();

    // Missing id
    const res1 = await worker.fetch(
      new Request("http://localhost/api/indices", {
        method: "DELETE",
      }),
      env as any,
    );
    expect(res1.status).toBe(400);

    // Invalid id characters
    const res2 = await worker.fetch(
      new Request("http://localhost/api/indices?id=invalid;id", {
        method: "DELETE",
      }),
      env as any,
    );
    expect(res2.status).toBe(400);
  });

  it("validates GET /api/snapshot symbol parameter", async () => {
    const env = createMockEnv();

    // Invalid characters in symbol
    const res = await worker.fetch(
      new Request("http://localhost/api/snapshot?symbol=INVALID/SYMBOL<script>"),
      env as any,
    );
    expect(res.status).toBe(400);
  });

  it("safely handles missing env.ASSETS", async () => {
    const env = createMockEnv({ ASSETS: undefined });
    const req = new Request("http://localhost/assets/index.js");
    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(404);
  });

  it("safely catches and handles env.ASSETS.fetch exception without crashing", async () => {
    const env = createMockEnv({
      ASSETS: {
        fetch: vi.fn().mockRejectedValue(new Error("Cloudflare Assets internal failure")),
      },
    });
    const req = new Request("http://localhost/assets/index-DAfVT__E.js");
    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toContain("Failed to load static asset");
  });

  it("normalizes Japanese TSE tickers and US/global tickers correctly with toYahooSymbol", () => {
    // Japanese numeric and new alphanumeric codes
    expect(toYahooSymbol("7203")).toBe("7203.T");
    expect(toYahooSymbol("9984")).toBe("9984.T");
    expect(toYahooSymbol("130A")).toBe("130A.T");
    expect(toYahooSymbol("256A")).toBe("256A.T");
    expect(toYahooSymbol("7203.T")).toBe("7203.T");

    // US and global tickers
    expect(toYahooSymbol("AAPL")).toBe("AAPL");
    expect(toYahooSymbol("NVDA")).toBe("NVDA");
    expect(toYahooSymbol("MSFT")).toBe("MSFT");

    // Benchmarks and Forex
    expect(toYahooSymbol("^N225")).toBe("^N225");
    expect(toYahooSymbol("^GSPC")).toBe("^GSPC");
    expect(toYahooSymbol("USDJPY=X")).toBe("USDJPY=X");
  });

  it("rejects duplicate tickers in POST /api/indices with 400 Bad Request", async () => {
    const env = createMockEnv();
    const req = new Request("http://localhost/api/indices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "custom-dup",
        name: "Duplicate Test",
        basket: [
          { ticker: "7203", name: "Toyota 1", weight: 50, theme: "Auto" },
          { ticker: "7203", name: "Toyota 2", weight: 50, theme: "Auto" },
        ],
      }),
    });
    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Duplicate ticker in basket");
  });

  it("rejects duplicate tickers in POST /api/calculate with 400 Bad Request", async () => {
    const env = createMockEnv();
    const req = new Request("http://localhost/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseValue: 1000,
        basket: [
          { ticker: "9984", name: "SBG 1", weight: 50, theme: "AI" },
          { ticker: "9984", name: "SBG 2", weight: 50, theme: "AI" },
        ],
      }),
    });
    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Duplicate ticker in basket");
  });

  it("prevents deletion of built-in system indices and returns 403 Forbidden", async () => {
    const env = createMockEnv();

    for (const sysId of Array.from(SYSTEM_INDICES)) {
      const req = new Request(`http://localhost/api/indices?id=${sysId}`, {
        method: "DELETE",
      });
      const res = await worker.fetch(req, env as any);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Cannot delete built-in system index");
    }
  });

  it("safely handles corrupted snapshot cache JSON without throwing a 500 error", async () => {
    const env = createMockEnv({
      DB: {
        prepare: vi.fn().mockImplementation((query: string) => {
          return {
            bind: vi.fn().mockReturnThis(),
            all: vi.fn().mockImplementation(() => {
              if (query.includes("rate_limits")) return { results: [] };
              if (query.includes("snapshot_cache")) {
                return {
                  results: [{ data: "INVALID_JSON_CORRUPT{", cached_at: Math.floor(Date.now() / 1000) }],
                };
              }
              return { results: [] };
            }),
            run: vi.fn().mockResolvedValue({ success: true }),
          };
        }),
        batch: vi.fn().mockResolvedValue([]),
      },
    });

    // Mock fetch to return empty series (fresh fetch fails)
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ chart: { result: [] } }), { status: 200 }),
    );

    try {
      const req = new Request("http://localhost/api/snapshot?symbol=%5EN225");
      const res = await worker.fetch(req, env as any);
      // Because cache is corrupt and fresh fetch returns no data, it cleanly returns 502 instead of unhandled 500 crash
      expect(res.status).toBe(502);
      const data = await res.json();
      expect(data.error).toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

