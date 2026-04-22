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

interface YahooQuoteResponse {
  quoteResponse?: {
    result?: { symbol: string; regularMarketPrice: number }[];
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
async function fetchYahooFinance(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1mo`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!res.ok) throw new Error(`Yahoo Finance error: ${res.status}`);

    const data: YahooChartResponse = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) return [];

    const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
    const closes = Array.isArray(result.indicators?.quote)
      ? result.indicators.quote[0]?.close ?? []
      : [];

    return timestamps.map((ts: number, i: number) => {
      const date = new Date(ts * 1000);
      return {
        date: `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`,
        close: typeof closes[i] === "number" ? Number(closes[i].toFixed(2)) : 0
      };
    }).filter((p: PricePoint) => p.close > 0);
  } catch (err) {
    console.error(`Error fetching ${symbol}:`, err);
    return [];
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return json({ ok: true });

    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "original-stock-index-worker" });
    }

    // 日経225スナップショットの取得
    if (url.pathname === "/api/snapshot" && request.method === "GET") {
      const series = await fetchYahooFinance("^N225");
      const latest = series[series.length - 1];
      const prev = series[series.length - 2];
      
      const snapshot = {
        label: "日経225",
        current: latest?.close || 0,
        change: latest && prev ? Number((latest.close - prev.close).toFixed(2)) : 0,
        changePct: latest && prev ? Number(((latest.close / prev.close - 1) * 100).toFixed(2)) : 0,
        updatedAt: new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
        description: "Yahoo Finance から取得したリアルタイム（遅延あり）データです。"
      };

      return json({ snapshot, series });
    }

    // 登録されている指数一覧の取得 (D1から取得)
    if (url.pathname === "/api/indices" && request.method === "GET") {
      try {
        // インデックスとバスケットアイテムをJOINして取得
        const { results } = await env.DB.prepare(`
          SELECT 
            i.id, i.name, i.description, i.base_value,
            b.ticker, b.name as stock_name, b.weight, b.theme
          FROM indices i
          LEFT JOIN basket_items b ON i.id = b.index_id
        `).all();

        // データをネストされた構造に変換
        const indicesMap = new Map<string, { id: string; name: string; description: string; baseValue: number; basket: BasketItem[] }>();
        for (const row of results as D1Row[]) {
          if (!indicesMap.has(row.id as string)) {
            indicesMap.set(row.id as string, {
              id: row.id as string,
              name: row.name as string,
              description: row.description as string,
              baseValue: row.base_value as number,
              basket: []
            });
          }
          if (row.ticker) {
            indicesMap.get(row.id as string)!.basket.push({
              ticker: row.ticker as string,
              name: row.stock_name as string,
              weight: row.weight as number,
              theme: row.theme as string
            });
          }
        }

        return json(Array.from(indicesMap.values()));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch indices";
        console.error("API Error [indices]:", err);
        return json({ error: message }, 500);
      }
    }

    // 銘柄データの同期 (履歴をD1に保存)
    if (url.pathname === "/api/sync-prices" && request.method === "POST") {
      try {
        const body: Record<string, unknown> = await request.json();
        if (!body || typeof body !== "object" || !Array.isArray(body.tickers)) {
          return json({ error: "Invalid request body: tickers array required" }, 400);
        }
        const tickers = body.tickers as string[];
        const force = body.force === true;
        const results = [];
        const now = Math.floor(Date.now() / 1000);
        const CACHE_DURATION = 4 * 60 * 60; // 4 hours

        // すでに同期済みの銘柄を確認
        const { results: syncLogs } = await env.DB.prepare(
          `SELECT ticker, last_synced_at FROM sync_logs WHERE ticker IN (${tickers.map(() => "?").join(",")})`
        ).bind(...tickers).all();

        const lastSyncedMap = new Map((syncLogs as { ticker: string; last_synced_at: number }[]).map(l => [l.ticker, l.last_synced_at]));

        for (const ticker of tickers) {
          const lastSynced = lastSyncedMap.get(ticker);
          if (!force && lastSynced && (now - lastSynced < CACHE_DURATION)) {
            results.push({ ticker, status: "cached", lastSynced });
            continue;
          }

          const symbol = ticker.includes(".") ? ticker : `${ticker}.T`;
          const series = await fetchYahooFinance(symbol);
          
          if (series.length > 0) {
            // 価格データと同期ログをバッチ保存
            const statements = [
              ...series.map(p => 
                env.DB.prepare("INSERT OR REPLACE INTO stock_prices (ticker, date, price) VALUES (?, ?, ?)")
                  .bind(ticker, p.date, p.close)
              ),
              env.DB.prepare("INSERT OR REPLACE INTO sync_logs (ticker, last_synced_at) VALUES (?, ?)")
                .bind(ticker, now)
            ];
            await env.DB.batch(statements);
            results.push({ ticker, status: "synced", count: series.length });
          } else {
            results.push({ ticker, status: "failed" });
          }
        }

        return json({ ok: true, results });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Sync failed";
        console.error("API Error [sync-prices]:", err);
        return json({ error: message }, 500);
      }
    }

    // 独自指数の計算（D1キャッシュ優先）
    if (url.pathname === "/api/calculate" && request.method === "POST") {
      try {
        const body: Record<string, unknown> = await request.json();
        const basket = Array.isArray(body.basket) ? body.basket : [];
        const baseValue = typeof body.baseValue === "number" ? body.baseValue : 1000;
        if (!Array.isArray(basket) || basket.length === 0) {
          return json({ error: "Invalid basket" }, 400);
        }
        
        // Validate basket items
        const validatedBasket: BasketItemInput[] = basket.filter((item): item is BasketItemInput =>
          item && typeof item === "object" &&
          typeof (item as Record<string, unknown>).ticker === "string" &&
          typeof (item as Record<string, unknown>).name === "string" &&
          typeof (item as Record<string, unknown>).theme === "string" &&
          typeof (item as Record<string, unknown>).weight === "number"
        );

        // 1. 最新価格を一括取得 (Subrequest 1回で済ませる)
        const allTickers = validatedBasket.map(item => item.ticker.includes(".") ? item.ticker : `${item.ticker}.T`);
        const latestPricesMap = new Map<string, number>();
        
        try {
          const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${allTickers.join(",")}`;
          const qRes = await fetch(quoteUrl, {
            headers: { "User-Agent": "Mozilla/5.0" }
          });
          if (qRes.ok) {
            const qData: YahooQuoteResponse = await qRes.json();
            qData.quoteResponse?.result?.forEach((q) => {
              const ticker = q.symbol.split(".")[0];
              latestPricesMap.set(ticker, q.regularMarketPrice);
            });
          }
        } catch (e) {
          console.error("Batch quote failed, falling back to history for latest price", e);
        }

        // 2. D1から全銘柄の履歴をチャンクに分けて取得 (SQL変数制限回避)
        const fullStockUniverse: StockSeries[] = [];
        const tickers = validatedBasket.map(b => b.ticker);
        const pricesByTicker = new Map<string, PricePoint[]>();
        
        const SQL_CHUNK_SIZE = 50;
        for (let i = 0; i < tickers.length; i += SQL_CHUNK_SIZE) {
          const chunk = tickers.slice(i, i + SQL_CHUNK_SIZE);
          const { results: dbPrices } = await env.DB.prepare(`
            SELECT ticker, date, price FROM stock_prices 
            WHERE ticker IN (${chunk.map(() => "?").join(",")})
            ORDER BY date ASC
          `).bind(...chunk).all();

          (dbPrices as { ticker: string; date: string; price: number }[]).forEach(row => {
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
            latestPrice: latestPricesMap.get(item.ticker) || (series.length > 0 ? series[series.length - 1].close : 0),
            series
          });
        }

        const series = calculateCustomIndex(validatedBasket, fullStockUniverse, baseValue);

        return json({
          ok: true,
          baseValue,
          basket: validatedBasket,
          series,
          latest: series[series.length - 1] ?? null,
          syncStatus: {
            total: validatedBasket.length,
            found: Array.from(pricesByTicker.keys()).length
          }
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Calculation failed";
        console.error("API Error [calculate]:", err);
        return json({ error: message }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
