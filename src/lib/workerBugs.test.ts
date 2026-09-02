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
}

function createStatefulEnv(): StatefulEnv {
  const env: StatefulEnv = {
    ASSETS: {
      fetch: vi.fn().mockResolvedValue(new Response("Asset", { status: 200 })),
    },
    _syncLogs: new Map(),
    _rateLimits: new Map(),
    _stockPrices: new Map(),
    DB: undefined as unknown as StatefulEnv["DB"],
    batch: vi.fn(),
  } as StatefulEnv;

  const execute = (query: string, params: unknown[]): { results: unknown[] } => {
    if (query.includes("FROM rate_limits") && query.includes("SELECT request_count")) {
      const [ip, endpoint] = params as [string, string];
      const r = env._rateLimits.get(`${ip}::${endpoint}`);
      return { results: r ? [r] : [] };
    }
    if (query.includes("UPDATE rate_limits")) {
      const [ip, endpoint] = params as [string, string];
      const k = `${ip}::${endpoint}`;
      const r = env._rateLimits.get(k);
      if (r) r.request_count += 1;
      return { results: [] };
    }
    if (query.includes("INSERT INTO rate_limits")) {
      // INSERT INTO ... ON CONFLICT DO UPDATE SET request_count = CASE WHEN ...
      // Params: [ip, endpoint, now, now, RATE_LIMIT_WINDOW, now, RATE_LIMIT_WINDOW]
      const [ip, endpoint, , now, rateLimitWindow] = params as [string, string, number, number, number];
      const k = `${ip}::${endpoint}`;
      const existing = env._rateLimits.get(k);
      if (existing) {
        if (existing.window_start < now - rateLimitWindow) {
          existing.request_count = 1;
          existing.window_start = now;
        } else {
          existing.request_count += 1;
        }
      } else {
        env._rateLimits.set(k, { ip, endpoint, request_count: 1, window_start: now });
      }
      return { results: [] };
    }
    if (query.includes("INSERT OR REPLACE INTO rate_limits")) {
      // INSERT OR REPLACE: delete+insert, hard-coded count=1 (the buggy form).
      const [ip, endpoint, , now] = params as [string, string, number, number];
      env._rateLimits.set(`${ip}::${endpoint}`, { ip, endpoint, request_count: 1, window_start: now });
      return { results: [] };
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
        run: () => Promise.resolve(execute(query, params)),
      }),
      all: () => Promise.resolve(execute(query, [])),
      run: () => Promise.resolve(execute(query, [])),
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

describe("worker: R1 sync_logs write on Yahoo failure", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("records a sync_logs entry even when Yahoo fetch fails so retries are short-circuited", async () => {
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

    // After failure, sync_logs MUST contain a row for 7203 (any timestamp), so the
    // second call short-circuits with "cached" instead of re-hitting Yahoo.
    expect(env._syncLogs.has("7203")).toBe(true);

    const res2 = await worker.fetch(
      new Request("http://localhost/api/sync-prices", {
        method: "POST",
        headers: { "cf-connecting-ip": "1.2.3.4" },
        body: JSON.stringify({ tickers: ["7203"] }),
      }),
      env as any,
    );
    const data2 = await res2.json();
    expect(data2.results[0].status).toBe("cached");
    // Only the first call should have hit Yahoo.
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
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
      headers: { "cf-connecting-ip": "1.2.3.4" },
      body: JSON.stringify({ tickers: ["7203"], force: true }),
    });

    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results[0].status).toBe("synced");

    // Old price from April should have been deleted
    expect(env._stockPrices.has("7203::2026-04-01")).toBe(false);
    // New price from August should be present
    expect(env._stockPrices.has("7203::2026-08-01")).toBe(true);
  });
});
