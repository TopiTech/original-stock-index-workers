import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index";

type SyncLogRow = { ticker: string; last_synced_at: number };
type RateLimitRow = { ip: string; endpoint: string; request_count: number; window_start: number };

interface StatefulEnv {
  ASSETS: { fetch: ReturnType<typeof vi.fn> };
  DB: {
    prepare: ReturnType<typeof vi.fn>;
    batch: ReturnType<typeof vi.fn>;
  };
  _syncLogs: Map<string, SyncLogRow>;
  _rateLimits: Map<string, RateLimitRow>;
  _stockPrices: Map<string, { ticker: string; date: string; price: number }>;
  _stockSeries: Map<string, { ticker: string; prices: string; updated_at: number }>;
}

function createStatefulEnv(): StatefulEnv {
  const env: StatefulEnv = {
    ASSETS: {
      fetch: vi.fn().mockResolvedValue(new Response("Asset", { status: 200 })),
    },
    _syncLogs: new Map(),
    _rateLimits: new Map(),
    _stockPrices: new Map(),
    _stockSeries: new Map(),
    DB: undefined as unknown as StatefulEnv["DB"],
    batch: vi.fn(),
  } as StatefulEnv;

  const execute = (query: string, params: unknown[]): { results: unknown[]; changes?: number } => {
    if (query.includes("INSERT INTO rate_limits")) {
      // Params: [ip, endpoint, now, expiryThreshold, expiryThreshold,
      // expiryThreshold, maxRequests]
      const [ip, endpoint, now, expiryThreshold, , , maxRequests] = params as [string, string, number, number, number, number, number];
      const k = `${ip}::${endpoint}`;
      const existing = env._rateLimits.get(k);
      if (existing) {
        if (existing.window_start <= expiryThreshold) {
          existing.request_count = 1;
          existing.window_start = now;
          return { results: [], changes: 1 };
        }
        if (existing.request_count < maxRequests) {
          existing.request_count += 1;
          return { results: [], changes: 1 };
        }
        return { results: [], changes: 0 };
      } else {
        env._rateLimits.set(k, { ip, endpoint, request_count: 1, window_start: now });
        return { results: [], changes: 1 };
      }
    }
    if (query.includes("FROM sync_logs") && query.includes("SELECT")) {
      const tickers = params as string[];
      const rows: SyncLogRow[] = [];
      for (const t of tickers) {
        const r = env._syncLogs.get(t);
        if (r) rows.push(r);
      }
      return { results: rows };
    }
    if (query.includes("DELETE") && query.includes("stock_prices")) {
      const [ticker] = params as [string];
      for (const key of Array.from(env._stockPrices.keys())) {
        if (key.startsWith(`${ticker}::`)) env._stockPrices.delete(key);
      }
      return { results: [] };
    }
    if (query.includes("INSERT") && query.includes("sync_logs")) {
      const [ticker, lastSyncedAt] = params as [string, number];
      env._syncLogs.set(ticker, { ticker, last_synced_at: lastSyncedAt });
      return { results: [] };
    }
    if (query.includes("INSERT") && query.includes("stock_series")) {
      const [ticker, prices, updatedAt] = params as [string, string, number];
      env._stockSeries.set(ticker, { ticker, prices, updated_at: updatedAt });
      return { results: [] };
    }
    if (query.includes("INSERT") && query.includes("stock_prices")) {
      for (let p = 0; p < params.length; p += 3) {
        const [ticker, date, price] = params.slice(p, p + 3) as [string, string, number];
        if (ticker && date) {
          env._stockPrices.set(`${ticker}::${date}`, { ticker, date, price });
        }
      }
      return { results: [] };
    }
    if (query.includes("FROM indices")) {
      return { results: [] };
    }
    if (query.includes("FROM stock_prices")) {
      return { results: [] };
    }
    if (query.includes("FROM snapshot_cache")) {
      return { results: [] };
    }
    return { results: [] };
  };

  const prepare = vi.fn().mockImplementation((query: string) => {
    return {
      bind: (...params: unknown[]) => ({
        all: () => Promise.resolve(execute(query, params)),
        run: () => {
          const result = execute(query, params);
          return Promise.resolve({ ...result, meta: { changes: result.changes ?? 1 } });
        },
      }),
      all: () => Promise.resolve(execute(query, [])),
      run: () => {
        const result = execute(query, []);
        return Promise.resolve({ ...result, meta: { changes: result.changes ?? 1 } });
      },
    };
  });

  env.DB = {
    prepare,
    batch: vi.fn().mockImplementation(async (stmts: Array<{ run: () => Promise<unknown> }>) => {
      for (const s of stmts) await s.run();
      return [];
    }),
  };

  return env;
}

describe("worker: failed Yahoo synchronization backoff", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("records a short failure backoff without reporting missing prices as cached", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ chart: { error: { code: "Too Many Requests" } } }), {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
    );

    const env = createStatefulEnv();
    const req = new Request("http://localhost/api/sync-prices", {
      method: "POST",
      headers: { "cf-connecting-ip": "1.2.3.4" },
      body: JSON.stringify({ tickers: ["7203"] }),
    });

    const res1 = await worker.fetch(req, env as any);
    const data1 = await res1.json();
    expect(data1.results[0].status).toBe("failed");

    // A negative timestamp distinguishes a failed fetch from a successful
    // synchronization. It prevents a retry storm without making the client
    // believe its price data is fresh.
    expect(env._syncLogs.has("7203")).toBe(true);
    expect(env._syncLogs.get("7203")?.last_synced_at).toBeLessThan(0);

    const res2 = await worker.fetch(
      new Request("http://localhost/api/sync-prices", {
        method: "POST",
        headers: { "cf-connecting-ip": "1.2.3.4" },
        body: JSON.stringify({ tickers: ["7203"] }),
      }),
      env as any,
    );
    const data2 = await res2.json();
    expect(data2.results[0].status).toBe("failed");
    // Only the first call should have hit Yahoo.
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it("retries Yahoo after the short failure backoff expires", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ chart: { error: { code: "Too Many Requests" } } }), { status: 429 }),
    );
    const env = createStatefulEnv();
    const request = () => new Request("http://localhost/api/sync-prices", {
      method: "POST",
      headers: { "cf-connecting-ip": "1.2.3.5" },
      body: JSON.stringify({ tickers: ["7203"] }),
    });

    try {
      await worker.fetch(request(), env as any);
      clock.mockReturnValue(1_800_000_300_001);
      const response = await worker.fetch(request(), env as any);

      expect((await response.json()).results[0].status).toBe("failed");
      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
    } finally {
      clock.mockRestore();
    }
  });
});

describe("worker: R2 fetch timeout on Yahoo Finance", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("passes an AbortSignal-bound timeout to fetch so hung requests are aborted", async () => {
    let observedSignal: AbortSignal | undefined;
    globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      observedSignal = init?.signal as AbortSignal | undefined;
      // Simulate the request responding cleanly (so the rest of the flow runs).
      return Promise.resolve(
        new Response(
          JSON.stringify({
            chart: { result: [{ timestamp: [], indicators: { quote: [{ close: [] }] } }] },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    });

    const env = createStatefulEnv();
    const req = new Request("http://localhost/api/sync-prices", {
      method: "POST",
      headers: { "cf-connecting-ip": "5.6.7.8" },
      body: JSON.stringify({ tickers: ["7203"] }),
    });
    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(200);

    // The worker must pass an AbortSignal so a hung Yahoo connection can be aborted
    // instead of consuming the entire worker CPU/wall-clock budget.
    expect(observedSignal).toBeDefined();
    expect(typeof observedSignal!.aborted).toBe("boolean");
  });
});

describe("worker: R3 checkRateLimit first-window race", () => {
  it("does not lose increments when many concurrent first-window requests arrive", async () => {
    const env = createStatefulEnv();
    const calls = Array.from({ length: 5 }, () =>
      worker.fetch(
        new Request("http://localhost/api/sync-prices", {
          method: "POST",
          headers: { "cf-connecting-ip": "9.9.9.9" },
          body: JSON.stringify({ tickers: ["7203"] }),
        }),
        env as any,
      ),
    );
    const responses = await Promise.all(calls);
    for (const r of responses) expect(r.status).toBe(200);

    // After 5 parallel first-window requests from the same IP, the counter
    // should be 5 (one increment per request). With the current race, it
    // collapses to 1 because INSERT OR REPLACE overwrites the prior row.
    const row = env._rateLimits.get("9.9.9.9::sync-prices");
    expect(row?.request_count).toBe(5);
  });
});

describe("worker: R5 rate limit counter resets after window expires", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("resets the rate limit counter to 1 when the window expires instead of incrementing from old count", async () => {
    const env = createStatefulEnv();

    // Pre-populate rate limit state as if 60 requests were made in a previous window
    // that has now expired (window_start is 120 seconds ago, window is 60 seconds)
    env._rateLimits.set("10.0.0.1::sync-prices", {
      ip: "10.0.0.1",
      endpoint: "sync-prices",
      request_count: 60,
      window_start: Math.floor(Date.now() / 1000) - 120,
    });

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          chart: { result: [{ timestamp: [1785542400], indicators: { quote: [{ close: [2500] }] } }] },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    // Make a request after the window expired
    const res = await worker.fetch(
      new Request("http://localhost/api/sync-prices", {
        method: "POST",
        headers: { "cf-connecting-ip": "10.0.0.1" },
        body: JSON.stringify({ tickers: ["7203"] }),
      }),
      env as any,
    );
    expect(res.status).toBe(200);

    // The counter should be reset to 1, not incremented to 61
    const row = env._rateLimits.get("10.0.0.1::sync-prices");
    expect(row?.request_count).toBe(1);
  });
});

describe("worker: R6 atomic rate-limit reservation", () => {
  it("admits only one of two concurrent requests when a window has one slot remaining", async () => {
    const env = createStatefulEnv();
    const now = Math.floor(Date.now() / 1000);
    env._rateLimits.set("10.0.0.2::sync-prices", {
      ip: "10.0.0.2",
      endpoint: "sync-prices",
      request_count: 59,
      window_start: now,
    });

    const makeRequest = () => worker.fetch(
      new Request("http://localhost/api/sync-prices", {
        method: "POST",
        headers: { "cf-connecting-ip": "10.0.0.2" },
        // An empty array avoids Yahoo calls; a 400 proves the rate-limit slot
        // was reserved before payload validation.
        body: JSON.stringify({ tickers: [] }),
      }),
      env as any,
    );

    const responses = await Promise.all([makeRequest(), makeRequest()]);
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([400, 429]);
    expect(env._rateLimits.get("10.0.0.2::sync-prices")?.request_count).toBe(60);
  });
});

describe("worker: R4 sync-prices replaces stale stock_prices", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("deletes older cached stock_prices for a ticker when fresh 1-month data is synced", async () => {
    // Old price from 5 months ago
    const env = createStatefulEnv();
    (env as StatefulEnv & { ADMIN_PASSWORD: string }).ADMIN_PASSWORD = "test-admin-password";
    env._stockPrices.set("7203::2026-04-01", { ticker: "7203", date: "2026-04-01", price: 2000 });

    // Yahoo returns fresh 1-month series (August 2026)
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          chart: {
            result: [
              {
                timestamp: [1785542400], // 2026-08-01
                indicators: { quote: [{ close: [2500] }] },
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const req = new Request("http://localhost/api/sync-prices", {
      method: "POST",
      headers: { "cf-connecting-ip": "1.2.3.4", "x-auth-password": "test-admin-password" },
      body: JSON.stringify({ tickers: ["7203"], force: true }),
    });

    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results[0].status).toBe("synced");

    // Old price from April should have been deleted from legacy stock_prices
    expect(env._stockPrices.has("7203::2026-04-01")).toBe(false);
    // New price from August should be present in stock_series (1 row atomic write)
    const seriesRow = env._stockSeries.get("7203");
    expect(seriesRow).toBeDefined();
    const parsedPrices = JSON.parse(seriesRow!.prices);
    expect(parsedPrices[0].date).toBe("2026-08-01");
    expect(parsedPrices[0].close).toBe(2500);
  });
});

describe("worker: sync-prices request guardrails", () => {
  it("rejects more than 30 tickers instead of silently dropping the excess", async () => {
    const env = createStatefulEnv();
    const tickers = Array.from({ length: 31 }, (_, index) => `T${index}`);
    const res = await worker.fetch(
      new Request("http://localhost/api/sync-prices", {
        method: "POST",
        headers: { "cf-connecting-ip": "11.11.11.11" },
        body: JSON.stringify({ tickers }),
      }),
      env as any,
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("30");
  });

  it("requires authentication before a caller can bypass the market-aware cache", async () => {
    const env = createStatefulEnv();
    const res = await worker.fetch(
      new Request("http://localhost/api/sync-prices", {
        method: "POST",
        headers: { "cf-connecting-ip": "12.12.12.12" },
        body: JSON.stringify({ tickers: ["7203"], force: true }),
      }),
      env as any,
    );

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain("強制同期");
  });
});
