import { calculateCustomIndex } from "../src/lib/indexEngine";

type BasketItem = {
  ticker: string;
  name: string;
  theme: string;
  weight: number;
};

type PricePoint = {
  date: string;
  close: number;
};

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
}

// Yahoo Finance API fetcher
async function fetchYahooFinance(symbol: string): Promise<PricePoint[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1mo`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!res.ok) throw new Error(`Yahoo Finance error: ${res.status}`);

    const data = (await res.json()) as any;
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
    }).filter((p: any) => p.close > 0);
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

    //日経225スナップショットの取得
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
        const indicesMap = new Map();
        for (const row of results as any[]) {
          if (!indicesMap.has(row.id)) {
            indicesMap.set(row.id, {
              id: row.id,
              name: row.name,
              description: row.description,
              baseValue: row.base_value,
              basket: []
            });
          }
          if (row.ticker) {
            indicesMap.get(row.id).basket.push({
              ticker: row.ticker,
              name: row.stock_name,
              weight: row.weight,
              theme: row.theme
            });
          }
        }

        return json(Array.from(indicesMap.values()));
      } catch (err: any) {
        console.error("API Error [indices]:", err);
        return json({ error: "Failed to fetch indices" }, 500);
      }
    }

    // 銘柄データの同期 (履歴をD1に保存)
    if (url.pathname === "/api/sync-prices" && request.method === "POST") {
      try {
        const body = (await request.json()) as { tickers: string[] };
        const results = [];

        for (const ticker of body.tickers) {
          const symbol = ticker.includes(".") ? ticker : `${ticker}.T`;
          const series = await fetchYahooFinance(symbol);
          
          if (series.length > 0) {
            // D1に保存
            const statements = series.map(p => 
              env.DB.prepare("INSERT OR REPLACE INTO stock_prices (ticker, date, price) VALUES (?, ?, ?)")
                .bind(ticker, p.date, p.close)
            );
            await env.DB.batch(statements);
            results.push({ ticker, status: "synced", count: series.length });
          } else {
            results.push({ ticker, status: "failed" });
          }
        }

        return json({ ok: true, results });
      } catch (err: any) {
        console.error("API Error [sync-prices]:", err);
        return json({ error: "Sync failed" }, 500);
      }
    }

    // 独自指数の計算（D1キャッシュ優先）
    if (url.pathname === "/api/calculate" && request.method === "POST") {
      try {
        const body = (await request.json()) as { basket: BasketItem[]; baseValue?: number };
        const baseValue = body.baseValue || 1000;
        
        // 1. 最新価格を一括取得 (Subrequest 1回で済ませる)
        const allTickers = body.basket.map(item => item.ticker.includes(".") ? item.ticker : `${item.ticker}.T`);
        const latestPricesMap = new Map<string, number>();
        
        try {
          const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${allTickers.join(",")}`;
          const qRes = await fetch(quoteUrl, {
            headers: { "User-Agent": "Mozilla/5.0" }
          });
          if (qRes.ok) {
            const qData = await qRes.json() as any;
            qData.quoteResponse?.result?.forEach((q: any) => {
              const ticker = q.symbol.split(".")[0];
              latestPricesMap.set(ticker, q.regularMarketPrice);
            });
          }
        } catch (e) {
          console.error("Batch quote failed, falling back to history for latest price", e);
        }

        // 2. D1から全銘柄の履歴をチャンクに分けて取得 (SQL変数制限回避)
        const fullStockUniverse: any[] = [];
        const tickers = body.basket.map(b => b.ticker);
        const pricesByTicker = new Map<string, PricePoint[]>();
        
        const SQL_CHUNK_SIZE = 50;
        for (let i = 0; i < tickers.length; i += SQL_CHUNK_SIZE) {
          const chunk = tickers.slice(i, i + SQL_CHUNK_SIZE);
          const { results: dbPrices } = await env.DB.prepare(`
            SELECT ticker, date, price FROM stock_prices 
            WHERE ticker IN (${chunk.map(() => "?").join(",")})
            ORDER BY date ASC
          `).bind(...chunk).all();

          (dbPrices as any[]).forEach(row => {
            if (!pricesByTicker.has(row.ticker)) pricesByTicker.set(row.ticker, []);
            pricesByTicker.get(row.ticker)!.push({ date: row.date, close: row.price });
          });
        }

        // 3. データを整形
        for (const item of body.basket) {
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

        const series = calculateCustomIndex(body.basket, fullStockUniverse, baseValue);

        return json({
          ok: true,
          baseValue,
          basket: body.basket,
          series,
          latest: series[series.length - 1] ?? null,
          syncStatus: {
            total: body.basket.length,
            found: Array.from(pricesByTicker.keys()).length
          }
        });
      } catch (err: any) {
        console.error("API Error [calculate]:", err);
        return json({ error: "Calculation failed" }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  }
};

