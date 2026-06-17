import { calculateCustomIndex } from "../src/lib/indexEngine";
import type { BasketItem, PricePoint, StockSeries } from "../src/types";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
}

interface YahooChartResponse {
  chart?: {
    result?: {
      timestamp: number[];
      indicators: {
        quote: { close: (number | null)[] }[];
      };
    }[];
  };
}

interface D1Row {
  [key: string]: unknown;
}

interface BasketItemInput {
  ticker: string;
  name: string;
  theme: string;
  weight: number;
}

// Yahoo Finance API fetcher
async function fetchYahooFinance(symbol: string): Promise<PricePoint[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1mo`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) throw new Error(`Yahoo Finance error: ${res.status}`);

    const data: YahooChartResponse = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) return [];

    const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
    const closes = Array.isArray(result.indicators?.quote)
      ? (result.indicators.quote[0]?.close ?? [])
      : [];

    return timestamps
      .map((ts: number, i: number) => {
        const date = new Date(ts * 1000);
        // YYYY-MM-DD format: year-aware, sortable across year boundaries
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        return {
          date: `${yyyy}-${mm}-${dd}`,
          close: typeof closes[i] === "number" ? Number(closes[i].toFixed(2)) : 0,
        };
      })
      .filter((p: PricePoint) => p.close > 0);
  } catch (err) {
    console.error(`Error fetching ${symbol}:`, err);
    return [];
  }
}

function json(data: unknown, status = 200, request?: Request) {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
  };

  // Cloudflare Assets 経由で同じドメインから呼ばれる場合は CORS 不要だが、
  // 開発時やクロスドメインを許容したい場合に備えて Origin をチェックして返す。
  if (request) {
    const origin = request.headers.get("origin");
    if (origin) {
      headers["access-control-allow-origin"] = origin;
      headers["access-control-allow-methods"] = "GET,POST,OPTIONS";
      headers["access-control-allow-headers"] = "content-type";
    }
  }

  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

// Rate limiting: check and update per-IP request count in D1
const RATE_LIMIT_WINDOW = 60; // seconds
const RATE_LIMIT_MAX = 30; // max requests per window per endpoint

async function checkRateLimit(env: Env, ip: string, endpoint: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  try {
    const { results } = await env.DB.prepare(
      "SELECT request_count, window_start FROM rate_limits WHERE ip = ? AND endpoint = ?",
    )
      .bind(ip, endpoint)
      .all();

    const row = (results as { request_count: number; window_start: number }[])[0];
    if (row && now - row.window_start < RATE_LIMIT_WINDOW) {
      if (row.request_count >= RATE_LIMIT_MAX) return false;
      await env.DB.prepare(
        "UPDATE rate_limits SET request_count = request_count + 1 WHERE ip = ? AND endpoint = ?",
      )
        .bind(ip, endpoint)
        .run();
    } else {
      await env.DB.prepare(
        "INSERT OR REPLACE INTO rate_limits (ip, endpoint, request_count, window_start) VALUES (?, ?, 1, ?)",
      )
        .bind(ip, endpoint, now)
        .run();
    }
    return true;
  } catch {
    // If rate limit check fails, allow the request rather than blocking
    return true;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return json({ ok: true }, 200, request);

    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "original-stock-index-worker" }, 200, request);
    }

    // 日経225スナップショットの取得（D1キャッシュ付き）
    if (url.pathname === "/api/snapshot" && request.method === "GET") {
      try {
        const now = Math.floor(Date.now() / 1000);
        const SNAPSHOT_CACHE_TTL = 5 * 60; // 5 minutes

        // Check D1 cache first
        const { results: cached } = await env.DB.prepare(
          "SELECT data, cached_at FROM snapshot_cache WHERE id = 1",
        ).all();

        const cacheRow = (cached as { data: string; cached_at: number }[])[0];
        if (cacheRow && now - cacheRow.cached_at < SNAPSHOT_CACHE_TTL) {
          return json(JSON.parse(cacheRow.data), 200, request);
        }

        // Cache miss or stale — fetch from Yahoo Finance
        const series = await fetchYahooFinance("^N225");
        const latest = series[series.length - 1];
        const prev = series[series.length - 2];

        if (!latest) {
          return json({ error: "No data available from Yahoo Finance" }, 502, request);
        }

        const snapshot = {
          label: "日経225",
          current: latest.close,
          change: prev ? Number((latest.close - prev.close).toFixed(2)) : 0,
          changePct: prev ? Number(((latest.close / prev.close - 1) * 100).toFixed(2)) : 0,
          updatedAt: new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
          description: "Yahoo Finance から取得したリアルタイム（遅延あり）データです。",
        };

        const responseData = { snapshot, series };

        // Save to cache
        await env.DB.prepare(
          "INSERT OR REPLACE INTO snapshot_cache (id, data, cached_at) VALUES (1, ?, ?)",
        )
          .bind(JSON.stringify(responseData), now)
          .run();

        return json(responseData, 200, request);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Snapshot fetch failed";
        console.error("API Error [snapshot]:", err);
        return json({ error: message }, 500, request);
      }
    }

    // 登録されている指数一覧の取得 (D1から取得、sort_order使用)
    if (url.pathname === "/api/indices" && request.method === "GET") {
      try {
        const { results } = await env.DB.prepare(
          `
          SELECT
            i.id, i.name, i.description, i.base_value,
            b.ticker, b.name as stock_name, b.weight, b.theme
          FROM indices i
          LEFT JOIN basket_items b ON i.id = b.index_id
          ORDER BY
            COALESCE(i.sort_order, 99),
            i.name,
            b.ticker
        `,
        ).all();

        const indicesMap = new Map<
          string,
          { id: string; name: string; description: string; baseValue: number; basket: BasketItem[] }
        >();
        for (const row of results as D1Row[]) {
          const id = String(row.id);
          if (!indicesMap.has(id)) {
            indicesMap.set(id, {
              id,
              name: String(row.name),
              description: row.description ? String(row.description) : "",
              baseValue: Number(row.base_value),
              basket: [],
            });
          }
          if (row.ticker) {
            indicesMap.get(id)!.basket.push({
              ticker: String(row.ticker),
              name: String(row.stock_name),
              weight: Number(row.weight),
              theme: row.theme ? String(row.theme) : "",
            });
          }
        }

        return json(Array.from(indicesMap.values()), 200, request);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch indices";
        console.error("API Error [indices]:", err);
        return json({ error: message }, 500, request);
      }
    }

    // 銘柄データの同期 (履歴をD1に保存、並列バッチ処理)
    if (url.pathname === "/api/sync-prices" && request.method === "POST") {
      try {
        const ip = request.headers.get("cf-connecting-ip") || "unknown";
        const allowed = await checkRateLimit(env, ip, "sync-prices");
        if (!allowed) {
          return json({ error: "Rate limit exceeded. Please try again later." }, 429, request);
        }

        const body: Record<string, unknown> = await request.json();
        if (!body || typeof body !== "object" || !Array.isArray(body.tickers)) {
          return json({ error: "Invalid request body: tickers array required" }, 400, request);
        }
        const tickers = (body.tickers as string[]).slice(0, 100); // Max 100 tickers per request
        const force = body.force === true;
        const results: { ticker: string; status: string; count?: number; lastSynced?: number }[] =
          [];
        const now = Math.floor(Date.now() / 1000);
        const CACHE_DURATION = 4 * 60 * 60; // 4 hours

        // すでに同期済みの銘柄を確認
        const { results: syncLogs } = await env.DB.prepare(
          `SELECT ticker, last_synced_at FROM sync_logs WHERE ticker IN (${tickers.map(() => "?").join(",")})`,
        )
          .bind(...tickers)
          .all();

        const lastSyncedMap = new Map(
          (syncLogs as { ticker: string; last_synced_at: number }[]).map((l) => [
            l.ticker,
            l.last_synced_at,
          ]),
        );

        // Collect tickers that need fetching
        const toFetch: string[] = [];
        for (const ticker of tickers) {
          const lastSynced = lastSyncedMap.get(ticker);
          if (!force && lastSynced && now - lastSynced < CACHE_DURATION) {
            results.push({ ticker, status: "cached", lastSynced });
          } else {
            toFetch.push(ticker);
          }
        }

        // Fetch in parallel batches (concurrency = 5)
        const CONCURRENCY = 5;
        for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
          const batch = toFetch.slice(i, i + CONCURRENCY);
          const batchResults = await Promise.allSettled(
            batch.map(async (ticker) => {
              const symbol = ticker.includes(".") ? ticker : `${ticker}.T`;
              const series = await fetchYahooFinance(symbol);
              if (series.length > 0) {
                const statements = [
                  ...series.map((p) =>
                    env.DB.prepare(
                      "INSERT OR REPLACE INTO stock_prices (ticker, date, price) VALUES (?, ?, ?)",
                    ).bind(ticker, p.date, p.close),
                  ),
                  env.DB.prepare(
                    "INSERT OR REPLACE INTO sync_logs (ticker, last_synced_at) VALUES (?, ?)",
                  ).bind(ticker, now),
                ];
                await env.DB.batch(statements);
                return { ticker, status: "synced", count: series.length };
              }
              return { ticker, status: "failed" };
            }),
          );

          for (const r of batchResults) {
            if (r.status === "fulfilled") {
              results.push(r.value);
            } else {
              // Extract ticker from the failed batch
              const idx = batchResults.indexOf(r);
              results.push({ ticker: batch[idx], status: "failed" });
            }
          }
        }

        return json({ ok: true, results }, 200, request);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Sync failed";
        console.error("API Error [sync-prices]:", err);
        return json({ error: message }, 500, request);
      }
    }

    // 独自指数の計算（D1キャッシュ優先）
    if (url.pathname === "/api/calculate" && request.method === "POST") {
      try {
        const ip = request.headers.get("cf-connecting-ip") || "unknown";
        const allowed = await checkRateLimit(env, ip, "calculate");
        if (!allowed) {
          return json({ error: "Rate limit exceeded. Please try again later." }, 429, request);
        }

        const body: Record<string, unknown> = await request.json();
        const basket = Array.isArray(body.basket) ? body.basket : [];
        const baseValue = typeof body.baseValue === "number" ? body.baseValue : 1000;
        if (!Array.isArray(basket) || basket.length === 0) {
          return json({ error: "Invalid basket" }, 400, request);
        }

        // Validate basket items
        const validatedBasket: BasketItemInput[] = basket.filter(
          (item): item is BasketItemInput =>
            item &&
            typeof item === "object" &&
            typeof (item as Record<string, unknown>).ticker === "string" &&
            typeof (item as Record<string, unknown>).name === "string" &&
            typeof (item as Record<string, unknown>).theme === "string" &&
            typeof (item as Record<string, unknown>).weight === "number",
        );

        // 1. D1から全銘柄の履歴をチャンクに分けて取得 (SQL変数制限回避)
        // Note: 最新価格はD1キャッシュの最新エントリを使用。
        // Yahoo Finance v7 quote APIは認証必須のため利用不可。
        const fullStockUniverse: StockSeries[] = [];
        const tickers = validatedBasket.map((b) => b.ticker);
        const pricesByTicker = new Map<string, PricePoint[]>();

        const SQL_CHUNK_SIZE = 50;
        for (let i = 0; i < tickers.length; i += SQL_CHUNK_SIZE) {
          const chunk = tickers.slice(i, i + SQL_CHUNK_SIZE);
          const { results: dbPrices } = await env.DB.prepare(
            `
            SELECT ticker, date, price FROM stock_prices
            WHERE ticker IN (${chunk.map(() => "?").join(",")})
            ORDER BY date ASC
          `,
          )
            .bind(...chunk)
            .all();

          (dbPrices as { ticker: string; date: string; price: number }[]).forEach((row) => {
            if (!pricesByTicker.has(row.ticker)) pricesByTicker.set(row.ticker, []);
            pricesByTicker.get(row.ticker)!.push({ date: row.date, close: row.price });
          });
        }

        // 3. データを整形
        for (const item of validatedBasket) {
          const series = pricesByTicker.get(item.ticker) || [];
          fullStockUniverse.push({
            ticker: item.ticker,
            name: item.name,
            theme: item.theme,
            sector: "Unknown",
            latestPrice: series.length > 0 ? series[series.length - 1].close : 0,
            series,
          });
        }

        const series = calculateCustomIndex(validatedBasket, fullStockUniverse, baseValue);

        return json(
          {
            ok: true,
            baseValue,
            basket: validatedBasket,
            series,
            latest: series[series.length - 1] ?? null,
            syncStatus: {
              total: validatedBasket.length,
              found: Array.from(pricesByTicker.keys()).length,
            },
          },
          200,
          request,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Calculation failed";
        console.error("API Error [calculate]:", err);
        return json({ error: message }, 500, request);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
