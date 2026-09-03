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

// Built-in system index IDs that cannot be deleted
export const SYSTEM_INDICES = new Set([
  "nikkei-175",
  "eroge-index",
  "ai-semi",
  "infra-tech",
  "jp-core",
]);

// Hash an owner token for secure storage
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token.trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// In-memory cache for warm worker isolates to minimize D1 reads
interface MemoryCacheEntry<T> {
  data: T;
  expiresAt: number;
}
const memoryCache = new Map<string, MemoryCacheEntry<unknown>>();

export function getMemoryCache<T>(key: string): T | null {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") {
    return null;
  }
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setMemoryCache(key: string, data: unknown, ttlSeconds: number): void {
  if (memoryCache.size > 500) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey) memoryCache.delete(oldestKey);
  }
  memoryCache.set(key, {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

export function clearMemoryCache(prefix?: string): void {
  if (!prefix) {
    memoryCache.clear();
    return;
  }
  for (const key of Array.from(memoryCache.keys())) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }
}

// Normalize ticker to Yahoo Finance query symbol
// Japanese stock tickers (start with a digit) map to Tokyo Exchange (.T)
// US and global tickers (e.g. AAPL, NVDA) or index/forex symbols (^N225, USDJPY=X) remain as-is
export function toYahooSymbol(ticker: string): string {
  const trimmed = ticker.trim().toUpperCase();
  if (trimmed.includes(".") || trimmed.startsWith("^") || trimmed.endsWith("=X")) {
    return trimmed;
  }
  if (/^\d/.test(trimmed)) {
    return `${trimmed}.T`;
  }
  return trimmed;
}

// Yahoo Finance API fetcher
async function fetchYahooFinance(symbol: string, range = "1y"): Promise<PricePoint[]> {
  const encodedSymbol = encodeURIComponent(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?interval=1d&range=${range}`;
  try {
    const res = await fetch(url, {
      // Abort hung connections so a single slow Yahoo response cannot consume
      // the entire worker CPU/wall-clock budget for the calling request.
      signal: AbortSignal.timeout(8000),
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
        // YYYY-MM-DD format: year-aware, sortable across year boundaries (UTC-consistent)
        const yyyy = date.getUTCFullYear();
        const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(date.getUTCDate()).padStart(2, "0");
        return {
          date: `${yyyy}-${mm}-${dd}`,
          close: typeof closes[i] === "number" && Number.isFinite(closes[i]) ? Number(closes[i].toFixed(2)) : 0,
        };
      })
      .filter((p: PricePoint) => p.close > 0);
  } catch (err) {
    console.error(`Error fetching ${symbol}:`, err);
    return [];
  }
}

function isAllowedOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function json(data: unknown, status = 200, request?: Request, customHeaders?: Record<string, string>) {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    ...customHeaders,
  };

  // Cloudflare Assets 経由で同じドメインから呼ばれる場合は CORS 不要。
  // 開発時のローカルホストからのクロスドメインリクエストのみ許可。
  if (request) {
    const origin = request.headers.get("origin");
    if (origin && isAllowedOrigin(origin)) {
      headers["access-control-allow-origin"] = origin;
      headers["access-control-allow-methods"] = "GET,POST,DELETE,OPTIONS";
      headers["access-control-allow-headers"] = "content-type,x-owner-token,x-admin-key";
      headers["vary"] = "Origin";
    }
  }

  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

async function parseJsonBody(request: Request): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { ok: false, response: json({ error: "Invalid JSON body" }, 400, request) };
    }
    return { ok: true, body };
  } catch {
    return { ok: false, response: json({ error: "Invalid JSON body" }, 400, request) };
  }
}

// Rate limiting: check and update per-IP request count in D1
const RATE_LIMIT_WINDOW = 60; // seconds
const RATE_LIMIT_MAX = 60; // max requests per window per endpoint

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
      // Use ON CONFLICT DO UPDATE so concurrent first-window requests for the
      // same (ip, endpoint) atomically increment the counter instead of having
      // the second write overwrite the first (which INSERT OR REPLACE does,
      // because it deletes + reinserts with the hard-coded count=1).
      // CASE resets the counter to 1 when the previous window has expired.
      await env.DB.prepare(
        "INSERT INTO rate_limits (ip, endpoint, request_count, window_start) VALUES (?, ?, 1, ?) ON CONFLICT(ip, endpoint) DO UPDATE SET request_count = CASE WHEN rate_limits.window_start < ? - ? THEN 1 ELSE rate_limits.request_count + 1 END, window_start = CASE WHEN rate_limits.window_start < ? - ? THEN excluded.window_start ELSE rate_limits.window_start END",
      )
        .bind(ip, endpoint, now, now, RATE_LIMIT_WINDOW, now, RATE_LIMIT_WINDOW)
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
    try {
      if (request.method === "OPTIONS") return json({ ok: true }, 200, request);

      const url = new URL(request.url);

      if (url.pathname === "/api/health") {
        return json({ ok: true, service: "original-stock-index-worker" }, 200, request);
      }

    // ベンチマーク・スナップショットの取得（D1キャッシュ付き・複数ベンチマーク対応・インメモリ&エッジキャッシュ）
    if (url.pathname === "/api/snapshot" && request.method === "GET") {
      try {
        const ip = request.headers.get("cf-connecting-ip") || "unknown";
        const allowed = await checkRateLimit(env, ip, "snapshot");
        if (!allowed) {
          return json({ error: "Rate limit exceeded. Please try again later." }, 429, request);
        }

        const now = Math.floor(Date.now() / 1000);
        const SNAPSHOT_CACHE_TTL = 5 * 60; // 5 minutes
        const rawSymbol = url.searchParams.get("symbol") || "^N225";
        const symbol = rawSymbol.trim();

        if (symbol.length === 0 || symbol.length > 20 || !/^[A-Za-z0-9.^=\-_]+$/.test(symbol)) {
          return json({ error: "Invalid symbol parameter" }, 400, request);
        }

        const memKey = `snapshot:${symbol}`;
        const memCached = getMemoryCache<unknown>(memKey);
        if (memCached) {
          return json(memCached, 200, request, {
            "cache-control": "public, max-age=60, s-maxage=300",
          });
        }

        const BENCHMARK_MAP: Record<string, { label: string; desc: string }> = {
          "^N225": { label: "日経225", desc: "日経平均株価 (日足)" },
          "^GSPC": { label: "S&P 500", desc: "S&P 500 米国株価指数" },
          "USDJPY=X": { label: "米ドル/円", desc: "USD/JPY 為替レート" },
        };
        const benchInfo = BENCHMARK_MAP[symbol] || { label: symbol, desc: `${symbol} 市場データ` };

        // For ^N225, check snapshot_cache (id = 1) for backward compatibility
        let cacheRow: { data: string; cached_at: number } | undefined;
        if (symbol === "^N225") {
          const { results: cached } = await env.DB.prepare(
            "SELECT data, cached_at FROM snapshot_cache WHERE id = 1",
          ).all();
          cacheRow = (cached as { data: string; cached_at: number }[])[0];
        } else {
          try {
            const { results: cached } = await env.DB.prepare(
              "SELECT data, cached_at FROM benchmark_cache WHERE symbol = ?",
            ).bind(symbol).all();
            cacheRow = (cached as { data: string; cached_at: number }[])[0];
          } catch {
            // benchmark_cache table might not exist yet
          }
        }

        if (cacheRow && now - cacheRow.cached_at < SNAPSHOT_CACHE_TTL) {
          try {
            const parsedData = JSON.parse(cacheRow.data);
            setMemoryCache(memKey, parsedData, 60);
            return json(parsedData, 200, request, {
              "cache-control": "public, max-age=60, s-maxage=300",
            });
          } catch {
            // Malformed cache, proceed to fresh fetch
          }
        }

        // Cache miss or stale — fetch from Yahoo Finance
        const series = await fetchYahooFinance(symbol, "1y");
        const latest = series[series.length - 1];
        const prev = series[series.length - 2];

        if (!latest) {
          // If fresh fetch fails but stale cache exists, fallback to stale cache
          if (cacheRow) {
            try {
              console.warn(`Using stale snapshot cache for ${symbol} due to Yahoo Finance failure`);
              return json(JSON.parse(cacheRow.data), 200, request);
            } catch {
              // Corrupted cache, continue to 502 error
            }
          }
          return json({ error: `No data available from Yahoo Finance for ${symbol}` }, 502, request);
        }

        const snapshot = {
          symbol,
          label: benchInfo.label,
          current: latest.close,
          change: prev ? Number((latest.close - prev.close).toFixed(2)) : 0,
          changePct: prev ? Number(((latest.close / prev.close - 1) * 100).toFixed(2)) : 0,
          updatedAt: new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
          description: benchInfo.desc,
        };

        const responseData = { snapshot, series };

        // Save to cache
        if (symbol === "^N225") {
          await env.DB.prepare(
            "INSERT OR REPLACE INTO snapshot_cache (id, data, cached_at) VALUES (1, ?, ?)",
          )
            .bind(JSON.stringify(responseData), now)
            .run();
        } else {
          try {
            await env.DB.prepare(
              "INSERT OR REPLACE INTO benchmark_cache (symbol, data, cached_at) VALUES (?, ?, ?)",
            )
              .bind(symbol, JSON.stringify(responseData), now)
              .run();
          } catch {
            // ignore if table not created
          }
        }

        setMemoryCache(memKey, responseData, 60);
        return json(responseData, 200, request, {
          "cache-control": "public, max-age=60, s-maxage=300",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Snapshot fetch failed";
        console.error("API Error [snapshot]:", err);
        return json({ error: message }, 500, request);
      }
    }

    // 登録されている指数一覧の取得 (D1から取得、sort_order使用、インメモリ&HTTPキャッシュ付き)
    if (url.pathname === "/api/indices" && request.method === "GET") {
      try {
        const cachedIndices = getMemoryCache<unknown>("api:indices");
        if (cachedIndices) {
          return json(cachedIndices, 200, request, {
            "cache-control": "public, max-age=15, stale-while-revalidate=60",
          });
        }

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
            const rawBase = Number(row.base_value);
            const baseValue = Number.isFinite(rawBase) && rawBase > 0 ? rawBase : 1000;
            indicesMap.set(id, {
              id,
              name: String(row.name),
              description: row.description ? String(row.description) : "",
              baseValue,
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

        const indicesList = Array.from(indicesMap.values());
        setMemoryCache("api:indices", indicesList, 15);

        return json(indicesList, 200, request, {
          "cache-control": "public, max-age=15, stale-while-revalidate=60",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch indices";
        console.error("API Error [indices]:", err);
        return json({ error: message }, 500, request);
      }
    }

    // 指数の新規登録・更新 (D1への永続化 + 作成者権限チェック)
    if (url.pathname === "/api/indices" && request.method === "POST") {
      try {
        const ip = request.headers.get("cf-connecting-ip") || "unknown";
        const allowed = await checkRateLimit(env, ip, "indices");
        if (!allowed) {
          return json({ error: "Rate limit exceeded. Please try again later." }, 429, request);
        }

        const parsed = await parseJsonBody(request);
        if (!parsed.ok) return parsed.response;
        const body = parsed.body;

        if (body.ownerToken !== undefined && (typeof body.ownerToken !== "string" || body.ownerToken.length > 256)) {
          return json({ error: "Invalid ownerToken: must be a string up to 256 characters" }, 400, request);
        }

        if (body.name !== undefined && (typeof body.name !== "string" || body.name.trim().length === 0 || body.name.trim().length > 100)) {
          return json({ error: "Invalid name: must be 1-100 characters" }, 400, request);
        }
        const name = typeof body.name === "string" && body.name.trim().length > 0 ? body.name.trim() : "マイカスタム指数";

        if (body.id !== undefined && (typeof body.id !== "string" || body.id.trim().length === 0 || body.id.trim().length > 100 || !/^[A-Za-z0-9.\-_]+$/.test(body.id.trim()))) {
          return json({ error: "Invalid id" }, 400, request);
        }
        const id = typeof body.id === "string" && body.id.trim().length > 0 ? body.id.trim() : `custom-${Date.now()}`;

        if (SYSTEM_INDICES.has(id)) {
          return json({ error: "Cannot modify built-in system index" }, 403, request);
        }

        if (body.description !== undefined && (typeof body.description !== "string" || body.description.length > 500)) {
          return json({ error: "Invalid description: max 500 characters" }, 400, request);
        }
        const description = typeof body.description === "string" ? body.description.trim() : "";

        if (body.baseValue !== undefined && (typeof body.baseValue !== "number" || !Number.isFinite(body.baseValue) || body.baseValue <= 0 || body.baseValue > 1000000)) {
          return json({ error: "Invalid baseValue" }, 400, request);
        }
        const baseValue = typeof body.baseValue === "number" ? body.baseValue : 1000;

        const basket = Array.isArray(body.basket) ? body.basket : [];
        if (basket.length === 0 || basket.length > 100) {
          return json({ error: "Basket must contain between 1 and 100 items" }, 400, request);
        }

        const seenTickers = new Set<string>();
        for (const item of basket) {
          if (!item || typeof item !== "object") {
            return json({ error: "Invalid basket item" }, 400, request);
          }
          const r = item as Record<string, unknown>;
          if (typeof r.ticker !== "string" || r.ticker.trim().length === 0 || r.ticker.trim().length > 20 || !/^[A-Za-z0-9.\-]+$/.test(r.ticker.trim())) {
            return json({ error: "Invalid basket item: ticker" }, 400, request);
          }
          const ticker = r.ticker.trim();
          if (seenTickers.has(ticker)) {
            return json({ error: `Duplicate ticker in basket: ${ticker}` }, 400, request);
          }
          seenTickers.add(ticker);

          if (typeof r.name !== "string" || r.name.trim().length === 0 || r.name.trim().length > 100) {
            return json({ error: "Invalid basket item: name" }, 400, request);
          }
          if (r.theme !== undefined && (typeof r.theme !== "string" || r.theme.trim().length > 100)) {
            return json({ error: "Invalid basket item: theme" }, 400, request);
          }
          if (typeof r.weight !== "number" || !Number.isFinite(r.weight) || r.weight <= 0 || r.weight > 100) {
            return json({ error: "Invalid basket item: weight must be > 0 and <= 100" }, 400, request);
          }
        }

        // Owner token verification
        let providedToken =
          (typeof body.ownerToken === "string" && body.ownerToken.trim().length > 0 ? body.ownerToken.trim() : null) ||
          request.headers.get("x-owner-token")?.trim() ||
          "";

        // Check if index already exists in D1
        let existingHash: string | null = null;
        let isExisting = false;
        try {
          const { results } = await env.DB.prepare(
            "SELECT id, owner_token_hash FROM indices WHERE id = ?",
          ).bind(id).all();
          if (results && results.length > 0) {
            isExisting = true;
            existingHash = (results[0] as { owner_token_hash?: string }).owner_token_hash || null;
          }
        } catch {
          // In case owner_token_hash column doesn't exist yet on unmigrated db
          try {
            const { results } = await env.DB.prepare("SELECT id FROM indices WHERE id = ?").bind(id).all();
            if (results && results.length > 0) isExisting = true;
          } catch {}
        }

        let targetHash: string | null = null;

        if (isExisting) {
          // If index already exists and has an owner token hash, require authorization
          if (existingHash) {
            if (!providedToken) {
              return json({ error: "この指数を更新する権限がありません（作成者トークンが必要です）" }, 403, request);
            }
            const providedHash = await hashToken(providedToken);
            if (providedHash !== existingHash) {
              return json({ error: "この指数を更新する権限がありません（作成者トークンが一致しません）" }, 403, request);
            }
            targetHash = existingHash;
          } else {
            // Legacy index without hash - if a token is provided, assign it now
            if (providedToken) {
              targetHash = await hashToken(providedToken);
            }
          }
        } else {
          // Brand new index
          if (!providedToken) {
            providedToken = crypto.randomUUID();
          }
          targetHash = await hashToken(providedToken);
        }

        const nowMs = Math.floor(Date.now() / 1000);

        let insertIndexStmt;
        try {
          insertIndexStmt = env.DB.prepare(
            "INSERT OR REPLACE INTO indices (id, name, description, base_value, sort_order, owner_token_hash, created_at) VALUES (?, ?, ?, ?, 50, ?, COALESCE((SELECT created_at FROM indices WHERE id = ?), ?))",
          ).bind(id, name, description, baseValue, targetHash, id, nowMs);
        } catch {
          // Fallback if columns not migrated yet
          insertIndexStmt = env.DB.prepare(
            "INSERT OR REPLACE INTO indices (id, name, description, base_value, sort_order) VALUES (?, ?, ?, ?, 50)",
          ).bind(id, name, description, baseValue);
        }

        const statements = [
          insertIndexStmt,
          env.DB.prepare("DELETE FROM basket_items WHERE index_id = ?").bind(id),
          ...basket.map((b: any) =>
            env.DB.prepare(
              "INSERT OR REPLACE INTO basket_items (index_id, ticker, name, weight, theme) VALUES (?, ?, ?, ?, ?)",
            ).bind(id, String(b.ticker).trim(), String(b.name).trim(), Number(b.weight), String(b.theme || "カスタム").trim()),
          ),
        ];

        await env.DB.batch(statements);
        clearMemoryCache("api:indices");

        return json({ ok: true, id, ownerToken: providedToken, message: "Index saved successfully" }, 200, request);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to save index";
        console.error("API Error [POST indices]:", err);
        return json({ error: message }, 500, request);
      }
    }

    // 指数の削除 (作成者認証付き)
    if (url.pathname === "/api/indices" && request.method === "DELETE") {
      try {
        const ip = request.headers.get("cf-connecting-ip") || "unknown";
        const allowed = await checkRateLimit(env, ip, "indices");
        if (!allowed) {
          return json({ error: "Rate limit exceeded. Please try again later." }, 429, request);
        }

        const rawId = url.searchParams.get("id");
        if (!rawId || typeof rawId !== "string" || rawId.trim().length === 0 || rawId.trim().length > 100 || !/^[A-Za-z0-9.\-_]+$/.test(rawId.trim())) {
          return json({ error: "Invalid or missing index id parameter" }, 400, request);
        }
        const id = rawId.trim();

        if (SYSTEM_INDICES.has(id)) {
          return json({ error: "Cannot delete built-in system index" }, 403, request);
        }

        // Verify index existence and ownership if index exists
        let existingHash: string | null = null;
        let hasCheckedIndex = false;
        try {
          const { results } = await env.DB.prepare(
            "SELECT id, owner_token_hash FROM indices WHERE id = ?",
          ).bind(id).all();
          if (results && results.length > 0) {
            hasCheckedIndex = true;
            existingHash = (results[0] as { owner_token_hash?: string }).owner_token_hash || null;
          }
        } catch {
          // Column might not exist in unmigrated db
          try {
            const { results } = await env.DB.prepare("SELECT id FROM indices WHERE id = ?").bind(id).all();
            if (results && results.length > 0) hasCheckedIndex = true;
          } catch {}
        }

        const providedToken =
          request.headers.get("x-owner-token")?.trim() ||
          url.searchParams.get("token")?.trim() ||
          "";

        if (hasCheckedIndex) {
          if (existingHash) {
            if (!providedToken) {
              return json({ error: "この指数を削除する権限がありません（作成者トークンが必要です）" }, 403, request);
            }
            const providedHash = await hashToken(providedToken);
            if (providedHash !== existingHash) {
              return json({ error: "この指数を削除する権限がありません（作成者トークンが一致しません）" }, 403, request);
            }
          } else {
            // Legacy index with no hash
            const adminKey = request.headers.get("x-admin-key")?.trim() || url.searchParams.get("adminKey")?.trim();
            if (!adminKey && !providedToken) {
              return json({ error: "この指数は保護されているため削除できません" }, 403, request);
            }
          }
        }

        const statements = [
          env.DB.prepare("DELETE FROM basket_items WHERE index_id = ?").bind(id),
          env.DB.prepare("DELETE FROM indices WHERE id = ?").bind(id),
        ];
        await env.DB.batch(statements);
        clearMemoryCache("api:indices");

        return json({ ok: true, id, message: "Index deleted successfully" }, 200, request);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to delete index";
        console.error("API Error [DELETE indices]:", err);
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

        const parsed = await parseJsonBody(request);
        if (!parsed.ok) return parsed.response;
        const body = parsed.body;
        if (!Array.isArray(body.tickers)) {
          return json({ error: "Invalid request body: tickers array required" }, 400, request);
        }
        if (body.tickers.length === 0) {
          return json({ error: "Invalid request body: tickers array must not be empty" }, 400, request);
        }
        const rawTickers = body.tickers as unknown[];
        for (const t of rawTickers) {
          if (typeof t !== "string" || t.trim().length === 0 || t.trim().length > 20 || !/^[A-Za-z0-9.\-]+$/.test(t.trim())) {
            return json({ error: "Invalid ticker value" }, 400, request);
          }
        }
        // Deduplicate tickers and limit to max 30 per request to respect Cloudflare subrequest limits
        const tickers = Array.from(new Set((rawTickers as string[]).map((t) => t.trim()))).slice(0, 30);
        const force = body.force === true;
        const results: { ticker: string; status: string; count?: number; lastSynced?: number }[] =
          [];
        const now = Math.floor(Date.now() / 1000);
        const CACHE_DURATION = 12 * 60 * 60; // 12 hours (daily candles)

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
              const symbol = toYahooSymbol(ticker);
              const series = await fetchYahooFinance(symbol);
              if (series.length > 0) {
                // High-efficiency single-row storage in stock_series:
                // Stores the full series JSON in 1 row (1 write) instead of 500 writes.
                const seriesJson = JSON.stringify(series);
                const statements = [
                  env.DB.prepare(
                    "INSERT OR REPLACE INTO stock_series (ticker, prices, updated_at) VALUES (?, ?, ?)",
                  ).bind(ticker, seriesJson, now),
                  env.DB.prepare("DELETE FROM stock_prices WHERE ticker = ?").bind(ticker),
                  env.DB.prepare(
                    "INSERT OR REPLACE INTO sync_logs (ticker, last_synced_at) VALUES (?, ?)",
                  ).bind(ticker, now),
                ];
                try {
                  await env.DB.batch(statements);
                } catch {
                  // Fallback for unmigrated database: use legacy chunked stock_prices
                  const CHUNK_SIZE = 25;
                  const insertStatements: any[] = [];
                  for (let c = 0; c < series.length; c += CHUNK_SIZE) {
                    const slice = series.slice(c, c + CHUNK_SIZE);
                    const placeholders = slice.map(() => "(?, ?, ?)").join(", ");
                    const params: (string | number)[] = [];
                    for (const p of slice) {
                      params.push(ticker, p.date, p.close);
                    }
                    insertStatements.push(
                      env.DB.prepare(
                        `INSERT OR REPLACE INTO stock_prices (ticker, date, price) VALUES ${placeholders}`,
                      ).bind(...params),
                    );
                  }
                  await env.DB.batch([
                    env.DB.prepare("DELETE FROM stock_prices WHERE ticker = ?").bind(ticker),
                    ...insertStatements,
                    env.DB.prepare(
                      "INSERT OR REPLACE INTO sync_logs (ticker, last_synced_at) VALUES (?, ?)",
                    ).bind(ticker, now),
                  ]);
                }
                return { ticker, status: "synced", count: series.length };
              }
              // Record the attempt in sync_logs so the next request within
              // CACHE_DURATION short-circuits instead of re-hitting Yahoo.
              await env.DB.prepare(
                "INSERT OR REPLACE INTO sync_logs (ticker, last_synced_at) VALUES (?, ?)",
              )
                .bind(ticker, now)
                .run();
              return { ticker, status: "failed" };
            }),
          );

          for (const [idx, r] of batchResults.entries()) {
            if (r.status === "fulfilled") {
              results.push(r.value);
            } else {
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

        const parsedCalc = await parseJsonBody(request);
        if (!parsedCalc.ok) return parsedCalc.response;
        const body = parsedCalc.body;
        const basket = Array.isArray(body.basket) ? body.basket : [];
        const rawBaseValue = body.baseValue;
        if (rawBaseValue !== undefined && (typeof rawBaseValue !== "number" || !Number.isFinite(rawBaseValue) || rawBaseValue <= 0 || rawBaseValue > 1000000)) {
          return json({ error: "Invalid baseValue" }, 400, request);
        }
        const baseValue = typeof rawBaseValue === "number" ? rawBaseValue : 1000;
        if (!Array.isArray(basket) || basket.length === 0) {
          return json({ error: "Invalid basket" }, 400, request);
        }

        // Strict basket validation: fail on any invalid entry
        const seenCalcTickers = new Set<string>();
        for (const item of basket) {
          if (!item || typeof item !== "object") {
            return json({ error: "Invalid basket item" }, 400, request);
          }
          const r = item as Record<string, unknown>;
          if (typeof r.ticker !== "string" || r.ticker.trim().length === 0 || r.ticker.trim().length > 20 || !/^[A-Za-z0-9.\-]+$/.test(r.ticker.trim())) {
            return json({ error: "Invalid basket item: ticker" }, 400, request);
          }
          const ticker = r.ticker.trim();
          if (seenCalcTickers.has(ticker)) {
            return json({ error: `Duplicate ticker in basket: ${ticker}` }, 400, request);
          }
          seenCalcTickers.add(ticker);

          if (typeof r.name !== "string" || r.name.trim().length === 0 || r.name.trim().length > 100) {
            return json({ error: "Invalid basket item: name" }, 400, request);
          }
          if (typeof r.theme !== "string" || r.theme.trim().length > 100) {
            return json({ error: "Invalid basket item: theme" }, 400, request);
          }
          if (typeof r.weight !== "number" || !Number.isFinite(r.weight) || r.weight <= 0 || r.weight > 100) {
            return json({ error: "Invalid basket item: weight must be > 0 and <= 100" }, 400, request);
          }
        }
        const validatedBasket: BasketItemInput[] = (basket as BasketItemInput[]).map((item) => ({
          ticker: (item.ticker as string).trim(),
          name: (item.name as string).trim(),
          theme: (item.theme as string).trim(),
          weight: item.weight,
        }));

        // 1. D1から全銘柄の履歴をチャンクに分けて取得 (SQL変数制限回避)
        // Note: 最新価格はD1キャッシュの最新エントリを使用。
        // Yahoo Finance v7 quote APIは認証必須のため利用不可。
        const fullStockUniverse: StockSeries[] = [];
        const tickers = validatedBasket.map((b) => b.ticker);
        const pricesByTicker = new Map<string, PricePoint[]>();

        const SQL_CHUNK_SIZE = 50;
        for (let i = 0; i < tickers.length; i += SQL_CHUNK_SIZE) {
          const chunk = tickers.slice(i, i + SQL_CHUNK_SIZE);
          try {
            const { results: seriesRows } = await env.DB.prepare(
              `SELECT ticker, prices FROM stock_series WHERE ticker IN (${chunk.map(() => "?").join(",")})`,
            )
              .bind(...chunk)
              .all();

            for (const row of seriesRows as { ticker: string; prices: string }[]) {
              if (row.ticker && row.prices) {
                try {
                  const parsed = JSON.parse(row.prices);
                  if (Array.isArray(parsed) && parsed.length > 0) {
                    pricesByTicker.set(row.ticker, parsed);
                  }
                } catch {
                  // malformed json
                }
              }
            }
          } catch {
            // stock_series table might not exist yet
          }

          // Fallback to legacy stock_prices for any tickers not found in stock_series
          const missingTickers = chunk.filter((t) => !pricesByTicker.has(t));
          if (missingTickers.length > 0) {
            try {
              const { results: dbPrices } = await env.DB.prepare(
                `
                SELECT ticker, date, price FROM stock_prices
                WHERE ticker IN (${missingTickers.map(() => "?").join(",")})
                ORDER BY date ASC
              `,
              )
                .bind(...missingTickers)
                .all();

              (dbPrices as { ticker: string; date: string; price: number }[]).forEach((row) => {
                if (!pricesByTicker.has(row.ticker)) pricesByTicker.set(row.ticker, []);
                pricesByTicker.get(row.ticker)!.push({ date: row.date, close: row.price });
              });
            } catch {
              // legacy table query error
            }
          }
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
            stockUniverse: fullStockUniverse,
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

    // 未知のAPIエンドポイントは404 JSONを返却（静的アセットへのフォールスルーを防止）
    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Endpoint not found" }, 404, request);
    }

    // 静的アセットの配信（Cloudflare Assets）
    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      try {
        const assetRes = await env.ASSETS.fetch(request);
        const pathname = url.pathname;
        const headers = new Headers(assetRes.headers);

        // HTML は常に最新を取得させ、ハッシュ付きアセットは長期キャッシュ
        if (pathname === "/" || pathname === "" || pathname.endsWith(".html")) {
          headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
        } else if (pathname.startsWith("/assets/")) {
          headers.set("Cache-Control", "public, max-age=31536000, immutable");
        }

        return new Response(assetRes.body, {
          status: assetRes.status,
          statusText: assetRes.statusText,
          headers,
        });
      } catch (assetErr) {
        console.error("Failed to fetch static asset from env.ASSETS:", assetErr);
        return json({ error: "Failed to load static asset from Cloudflare Assets" }, 502, request);
      }
    }

    return json({ error: "Static asset handler not available" }, 404, request);
  } catch (unhandledErr) {
    console.error("Unhandled Worker error:", unhandledErr);
    const message = unhandledErr instanceof Error ? unhandledErr.message : "Internal Server Error";
    return json({ error: message }, 500, request);
  }
  },
};

