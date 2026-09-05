import { calculateCustomIndex } from "../src/lib/indexEngine";
import type { BasketItem, PricePoint, StockSeries } from "../src/types";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  ADMIN_PASSWORD?: string;
}

export interface AuthResult {
  authenticated: boolean;
  role?: "admin" | "user";
  name?: string;
  maxStocks?: number | null;
  maxIndices?: number | null;
  id?: string;
  error?: string;
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

// Upper bound for a single index basket. Must stay below D1 batch/query
// limits (each basket item becomes one INSERT statement in the save batch)
// while comfortably accommodating the largest built-in index (175 stocks).
const MAX_BASKET_ITEMS = 500;
const PASSWORD_HASH_PREFIX = "pbkdf2-sha256";
const PASSWORD_HASH_ITERATIONS = 100_000;
const AUTH_RATE_LIMIT_MAX = 10;

// Hash an owner token or password for secure storage
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token.trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time string comparison to prevent timing attacks.
// Unlike a naive implementation that early-returns on length mismatch, this
// always iterates over the longer input so that differing lengths do not leak
// information through timing differences.
export function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let result = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0xff;
    const cb = i < b.length ? b.charCodeAt(i) : 0xff;
    result |= ca ^ cb;
  }
  return result === 0;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Password hashes use a per-password salt and PBKDF2. The legacy SHA-256
 * format remains verifiable so existing accounts can be upgraded on login.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PASSWORD_HASH_ITERATIONS,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return `${PASSWORD_HASH_PREFIX}$${PASSWORD_HASH_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(derivedBits))}`;
}

function parsePasswordHash(storedHash: string): {
  iterations: number;
  salt: Uint8Array;
  digest: string;
} | null {
  const [prefix, iterationsText, saltHex, digest] = storedHash.split("$");
  const iterations = Number(iterationsText);
  const salt = saltHex ? hexToBytes(saltHex) : null;
  if (
    prefix !== PASSWORD_HASH_PREFIX ||
    !Number.isSafeInteger(iterations) ||
    iterations < 10_000 ||
    iterations > 2_000_000 ||
    !salt ||
    salt.length < 16 ||
    !/^[0-9a-f]{64}$/i.test(digest || "")
  ) {
    return null;
  }
  return { iterations, salt, digest: digest.toLowerCase() };
}

export async function verifyPasswordHash(password: string, storedHash: string): Promise<boolean> {
  const parsed = parsePasswordHash(storedHash);
  if (!parsed) {
    // Legacy hashes were unsalted SHA-256 digests. Keep this path only for
    // migration compatibility; new writes always use PBKDF2.
    return timingSafeEqual(await hashToken(password), storedHash);
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      // Cloudflare's runtime accepts Uint8Array salts; the cast bridges the
      // DOM lib's stricter ArrayBuffer generic in the application compiler.
      salt: parsed.salt as unknown as BufferSource,
      iterations: parsed.iterations,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return timingSafeEqual(bytesToHex(new Uint8Array(derivedBits)), parsed.digest);
}

function isModernPasswordHash(storedHash: string): boolean {
  return storedHash.startsWith(`${PASSWORD_HASH_PREFIX}$`);
}

let isPasswordTableEnsured = false;
export function resetPasswordTableEnsured(): void {
  isPasswordTableEnsured = false;
}

export async function ensurePasswordTable(env: Env): Promise<void> {
  if (isPasswordTableEnsured) return;
  try {
    await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS access_passwords (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        max_stocks INTEGER DEFAULT 10,
        is_active INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER
      )
    `).run();
    // Add max_indices column to access_passwords if not exists
    try {
      await env.DB.prepare("ALTER TABLE access_passwords ADD COLUMN max_indices INTEGER DEFAULT NULL").run();
    } catch {}
    // Add creator_id column to indices if not exists
    try {
      await env.DB.prepare("ALTER TABLE indices ADD COLUMN creator_id TEXT").run();
    } catch {}
    isPasswordTableEnsured = true;
  } catch {
    // ignore
  }
}

interface AuthCacheEntry {
  result: AuthResult;
  expiresAt: number;
}
const authCache = new Map<string, AuthCacheEntry>();
const MAX_AUTH_CACHE_SIZE = 200;

function setAuthCache(key: string, entry: AuthCacheEntry): void {
  if (authCache.size >= MAX_AUTH_CACHE_SIZE) {
    const oldestKey = authCache.keys().next().value;
    if (oldestKey) authCache.delete(oldestKey);
  }
  authCache.set(key, entry);
}

export function clearAuthCache(): void {
  authCache.clear();
}

async function upgradeLegacyPasswordHash(
  env: Env,
  id: string,
  password: string,
  storedHash: string,
): Promise<void> {
  if (isModernPasswordHash(storedHash)) return;
  try {
    const upgradedHash = await hashPassword(password);
    await env.DB.prepare(
      "UPDATE access_passwords SET password_hash = ?, updated_at = ? WHERE id = ?",
    )
      .bind(upgradedHash, Math.floor(Date.now() / 1000), id)
      .run();
  } catch (err) {
    // A successful login must not fail just because a best-effort migration
    // could not be persisted. The next login can retry the upgrade.
    console.error("Failed to upgrade legacy password hash:", err);
  }
}

export async function authenticatePassword(
  request: Request,
  env: Env,
  explicitPassword?: string | null
): Promise<AuthResult> {
  const pwd =
    (explicitPassword && typeof explicitPassword === "string" ? explicitPassword.trim() : null) ||
    request.headers.get("x-auth-password")?.trim() ||
    request.headers.get("x-admin-key")?.trim() ||
    (request.headers.get("authorization")?.startsWith("Bearer ")
      ? request.headers.get("authorization")!.slice(7).trim()
      : null) ||
    "";

  if (!pwd) {
    return { authenticated: false, error: "パスワードが指定されていません" };
  }

  const pwdHash = await hashToken(pwd);
  // Cache only the master admin result. The cache is keyed by the SHA-256 of
  // the raw password, so caching regular users here would be unsafe: two
  // accounts that share the same password would collide and the first
  // account's role/limits would be served to the second. There is exactly one
  // admin-master row, so its result is unambiguous and it is also the hottest
  // authenticated path (every admin request). Regular users always scan D1,
  // which also makes deactivation and limit changes take effect immediately.
  const cachedAuth = authCache.get(pwdHash);
  if (cachedAuth && Date.now() < cachedAuth.expiresAt && cachedAuth.result.id === "admin-master") {
    return cachedAuth.result;
  }

  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkRateLimit(env, ip, "auth", AUTH_RATE_LIMIT_MAX, true))) {
    return {
      authenticated: false,
      error: "認証試行回数が上限に達しました。しばらくしてから再試行してください",
    };
  }

  try {
    await ensurePasswordTable(env);

    // 1. Check if customized master admin password exists in D1
    const { results: adminMasterRows } = await env.DB.prepare(
      "SELECT id, name, password_hash, role, max_stocks, is_active FROM access_passwords WHERE id = 'admin-master'"
    ).all();

    const masterRow = (adminMasterRows || []).find(
      (r: any) => r && r.id === "admin-master"
    ) as {
      id: string;
      name: string;
      password_hash: string;
      role: "admin";
      max_stocks: number | null;
      is_active: number;
    } | undefined;

    if (masterRow) {
      // Once a master row exists, only that row may authenticate the master
      // account. In particular, an unavailable D1 must never re-enable a
      // fallback password.
      if (
        masterRow.is_active === 1 &&
        typeof masterRow.password_hash === "string" &&
        (await verifyPasswordHash(pwd, masterRow.password_hash))
      ) {
        await upgradeLegacyPasswordHash(env, masterRow.id, pwd, masterRow.password_hash);
        const res: AuthResult = {
          authenticated: true,
          role: "admin",
          name: masterRow.name || "管理者",
          maxStocks: null,
          maxIndices: null,
          id: "admin-master",
        };
        setAuthCache(pwdHash, { result: res, expiresAt: Date.now() + 60 * 1000 });
        return res;
      }
    } else {
      // A first deployment may use the secret configured in the Worker
      // environment. There is deliberately no built-in/default password.
      const masterAdminPassword = env.ADMIN_PASSWORD?.trim();
      if (masterAdminPassword && timingSafeEqual(await hashToken(masterAdminPassword), pwdHash)) {
        const res: AuthResult = {
          authenticated: true,
          role: "admin",
          name: "管理者",
          maxStocks: null,
          maxIndices: null,
          id: "admin-master",
        };
        setAuthCache(pwdHash, { result: res, expiresAt: Date.now() + 60 * 1000 });
        return res;
      }
    }

    // 2. D1 access_passwords check for standard users / secondary admins
    let passwordRows: D1Row[] | undefined;
    try {
      const dbRes = await env.DB.prepare(
        "SELECT id, name, role, max_stocks, max_indices, is_active, password_hash FROM access_passwords WHERE is_active = 1 AND id != 'admin-master' ORDER BY created_at ASC"
      ).all();
      passwordRows = dbRes.results;
    } catch {
      const dbRes = await env.DB.prepare(
        "SELECT id, name, role, max_stocks, is_active, password_hash FROM access_passwords WHERE is_active = 1 AND id != 'admin-master' ORDER BY created_at ASC"
      ).all();
      passwordRows = dbRes.results;
    }

    for (const row of passwordRows || []) {
      const user = row as {
        id: string;
        name: string;
        role: "admin" | "user";
        max_stocks: number | null;
        max_indices?: number | null;
        is_active: number;
        password_hash: string;
      };
      if (typeof user.password_hash !== "string" || !(await verifyPasswordHash(pwd, user.password_hash))) {
        continue;
      }
      await upgradeLegacyPasswordHash(env, user.id, pwd, user.password_hash);
      // NOTE: deliberately NOT cached in authCache — see the comment above
      // about same-password collisions across user accounts.
      const res: AuthResult = {
        authenticated: true,
        role: user.role,
        name: user.name,
        maxStocks: user.max_stocks !== null && user.max_stocks !== undefined ? Number(user.max_stocks) : null,
        maxIndices: user.max_indices !== null && user.max_indices !== undefined ? Number(user.max_indices) : null,
        id: user.id,
      };
      return res;
    }
  } catch (err) {
    console.error("Auth DB error:", err);
  }

  return { authenticated: false, error: "パスワードが正しくありません" };
}

// In-memory cache for warm worker isolates to minimize D1 reads
interface MemoryCacheEntry<T> {
  data: T;
  expiresAt: number;
}
const memoryCache = new Map<string, MemoryCacheEntry<unknown>>();

let allowMemoryCacheInTest = false;
export function setAllowMemoryCacheInTest(allow: boolean): void {
  allowMemoryCacheInTest = allow;
}

export function getMemoryCache<T>(key: string): T | null {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test" && !allowMemoryCacheInTest) {
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

// Market-aware cache duration (JST aware: 09:00-15:30)
// Extends TTL during market close (nights & weekends) up to 72 hours to save D1 writes and fetches.
export function getMarketAwareCacheDuration(now: Date = new Date()): number {
  const jstTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const day = jstTime.getUTCDay(); // 0: Sun, 1: Mon, ..., 5: Fri, 6: Sat
  const hour = jstTime.getUTCHours();
  const minute = jstTime.getUTCMinutes();
  const timeInMinutes = hour * 60 + minute;

  const MARKET_CLOSE_JST = 15 * 60 + 30; // 15:30 JST (930 min)
  const MARKET_OPEN_JST = 9 * 60; // 09:00 JST (540 min)

  // Saturday (Day 6) -> until Monday 9:00 (approx 40-64 hours)
  if (day === 6) {
    const hoursToMonday = 24 - hour + 24 + 9;
    return Math.max(12 * 3600, hoursToMonday * 3600);
  }

  // Sunday (Day 0) -> until Monday 9:00 (approx 9-33 hours)
  if (day === 0) {
    const hoursToMonday = 24 - hour + 9;
    return Math.max(12 * 3600, hoursToMonday * 3600);
  }

  // Friday after market close (Day 5, >= 15:30) -> until Monday 9:00 (approx 65 hours)
  if (day === 5 && timeInMinutes >= MARKET_CLOSE_JST) {
    const hoursToMonday = 24 - hour + 48 + 9;
    return Math.max(12 * 3600, hoursToMonday * 3600);
  }

  // Weekdays after market close (Mon-Thu, >= 15:30) -> until next morning 9:00 (approx 17.5 hours)
  if (day >= 1 && day <= 4 && timeInMinutes >= MARKET_CLOSE_JST) {
    const hoursToMorning = 24 - hour + 9;
    return Math.max(12 * 3600, hoursToMorning * 3600);
  }

  // Weekdays before market open (Mon-Fri, < 9:00) -> until today 9:00
  if (day >= 1 && day <= 5 && timeInMinutes < MARKET_OPEN_JST) {
    const minutesToOpen = MARKET_OPEN_JST - timeInMinutes;
    return Math.max(60, Math.floor(minutesToOpen * 60));
  }

  // Regular trading hours: standard 12 hours
  return 12 * 3600;
}

// Generate an ETag from arbitrary string or JSON data
export async function generateETag(content: string): Promise<string> {
  const hash = await hashToken(content);
  return `"${hash.slice(0, 16)}"`;
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

    const pointsByDate = new Map<string, number>();
    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i];
      const close = closes[i];
      if (
        typeof ts === "number" &&
        Number.isFinite(ts) &&
        typeof close === "number" &&
        Number.isFinite(close) &&
        close > 0
      ) {
        const date = new Date(ts * 1000);
        // YYYY-MM-DD format: year-aware, sortable across year boundaries (UTC-consistent)
        const yyyy = date.getUTCFullYear();
        const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(date.getUTCDate()).padStart(2, "0");
        pointsByDate.set(`${yyyy}-${mm}-${dd}`, Number(close.toFixed(2)));
      }
    }

    return Array.from(pointsByDate.entries())
      .map(([date, close]) => ({ date, close }))
      .sort((a, b) => a.date.localeCompare(b.date));
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
      headers["access-control-allow-methods"] = "GET,POST,PUT,DELETE,OPTIONS";
      headers["access-control-allow-headers"] = "content-type,x-owner-token,x-admin-key,x-auth-password,authorization";
      headers["vary"] = "Origin";
    }

    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith("/api/auth/") || pathname.startsWith("/api/admin/")) {
      headers["cache-control"] = "no-store";
    }
  }

  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

function notModified(request?: Request, customHeaders?: Record<string, string>) {
  const headers: Record<string, string> = {
    ...customHeaders,
  };
  if (request) {
    const origin = request.headers.get("origin");
    if (origin && isAllowedOrigin(origin)) {
      headers["access-control-allow-origin"] = origin;
      headers["access-control-allow-methods"] = "GET,POST,PUT,DELETE,OPTIONS";
      headers["access-control-allow-headers"] = "content-type,x-owner-token,x-admin-key,x-auth-password,authorization";
      headers["vary"] = "Origin";
    }
  }
  return new Response(null, {
    status: 304,
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

async function checkRateLimit(
  env: Env,
  ip: string,
  endpoint: string,
  maxRequests = RATE_LIMIT_MAX,
  failClosed = false,
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  try {
    const { results } = await env.DB.prepare(
      "SELECT request_count, window_start FROM rate_limits WHERE ip = ? AND endpoint = ?",
    )
      .bind(ip, endpoint)
      .all();

    const row = (results as { request_count: number; window_start: number }[])[0];
    if (row && now - row.window_start < RATE_LIMIT_WINDOW) {
      if (row.request_count >= maxRequests) return false;
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
  } catch (err) {
    if (failClosed) {
      console.error(`Rate limit check failed for ${endpoint}:`, err);
      return false;
    }
    // Non-authenticated public endpoints remain available if the optional
    // abuse-prevention table is temporarily unavailable.
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

      // パスワード認証確認
      if (url.pathname === "/api/auth/verify" && request.method === "POST") {
        try {
          const parsed = await parseJsonBody(request);
          if (!parsed.ok) return parsed.response;
          const password = typeof parsed.body.password === "string" ? parsed.body.password : "";
          const auth = await authenticatePassword(request, env, password);
          if (!auth.authenticated) {
            return json({ ok: false, error: auth.error || "パスワードが正しくありません" }, 401, request);
          }
          return json(
            {
              ok: true,
              role: auth.role,
              name: auth.name,
              maxStocks: auth.maxStocks,
              maxIndices: auth.maxIndices ?? null,
              id: auth.id,
            },
            200,
            request
          );
        } catch (err) {
          console.error("Authentication endpoint error:", err);
          return json({ error: "Internal server error" }, 500, request);
        }
      }

      // 管理者向け: ユーザーパスワード一覧取得 (マスター管理者を除外)
      if (url.pathname === "/api/admin/passwords" && request.method === "GET") {
        try {
          const auth = await authenticatePassword(request, env);
          if (!auth.authenticated || auth.role !== "admin") {
            return json({ error: "管理者権限が必要です" }, 403, request);
          }
          await ensurePasswordTable(env);
          let results: D1Row[] | undefined;
          try {
            const dbRes = await env.DB.prepare(
              "SELECT id, name, role, max_stocks, max_indices, is_active, created_at, updated_at FROM access_passwords WHERE id != 'admin-master' ORDER BY created_at DESC"
            ).all();
            results = dbRes.results;
          } catch {
            const dbRes = await env.DB.prepare(
              "SELECT id, name, role, max_stocks, is_active, created_at, updated_at FROM access_passwords WHERE id != 'admin-master' ORDER BY created_at DESC"
            ).all();
            results = dbRes.results;
          }
          return json(results || [], 200, request);
        } catch (err) {
          console.error("Failed to fetch passwords:", err);
          return json({ error: "Internal server error" }, 500, request);
        }
      }

      // 管理者向け: ユーザーパスワード新規作成（銘柄数制限設定 & 指数上限設定）
      if (url.pathname === "/api/admin/passwords" && request.method === "POST") {
        try {
          const auth = await authenticatePassword(request, env);
          if (!auth.authenticated || auth.role !== "admin") {
            return json({ error: "管理者権限が必要です" }, 403, request);
          }
          const parsed = await parseJsonBody(request);
          if (!parsed.ok) return parsed.response;
          const { name, password, maxStocks, maxIndices, role } = parsed.body;
          if (!name || typeof name !== "string" || name.trim().length === 0 || name.trim().length > 100) {
            return json({ error: "ユーザー名/ラベルは1〜100文字で入力してください" }, 400, request);
          }
          if (!password || typeof password !== "string" || password.trim().length < 8 || password.trim().length > 100) {
            return json({ error: "パスワードは8〜100文字で入力してください" }, 400, request);
          }
          let maxStockLimit: number | null = null;
          if (maxStocks !== undefined && maxStocks !== null && maxStocks !== "") {
            const num = Number(maxStocks);
            if (!Number.isFinite(num) || num < 1 || num > 500) {
              return json({ error: "銘柄数上限は1〜500の数値を指定してください" }, 400, request);
            }
            maxStockLimit = Math.floor(num);
          }
          let maxIndexLimit: number | null = null;
          if (maxIndices !== undefined && maxIndices !== null && maxIndices !== "") {
            const num = Number(maxIndices);
            if (!Number.isFinite(num) || num < 1 || num > 100) {
              return json({ error: "指数上限は1〜100の数値を指定してください" }, 400, request);
            }
            maxIndexLimit = Math.floor(num);
          }
          const assignedRole = role === "admin" ? "admin" : "user";
          const id = `pwd-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const initialPassword = password.trim();
          const hash = await hashPassword(initialPassword);
          const now = Math.floor(Date.now() / 1000);

          await ensurePasswordTable(env);
          try {
            await env.DB.prepare(
              "INSERT INTO access_passwords (id, name, password_hash, role, max_stocks, max_indices, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)"
            ).bind(id, name.trim(), hash, assignedRole, maxStockLimit, maxIndexLimit, now, now).run();
          } catch {
            await env.DB.prepare(
              "INSERT INTO access_passwords (id, name, password_hash, role, max_stocks, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)"
            ).bind(id, name.trim(), hash, assignedRole, maxStockLimit, now, now).run();
          }
          clearAuthCache();

          return json(
            {
              ok: true,
              password: {
                id,
                name: name.trim(),
                initialPassword,
                role: assignedRole,
                max_stocks: maxStockLimit,
                max_indices: maxIndexLimit,
                is_active: 1,
                created_at: now,
              },
            },
            201,
            request
          );
        } catch (err) {
          console.error("Failed to create password:", err);
          return json({ error: "Internal server error" }, 500, request);
        }
      }

      // 管理者向け: ユーザーパスワード更新
      if (url.pathname === "/api/admin/passwords" && request.method === "PUT") {
        try {
          const auth = await authenticatePassword(request, env);
          if (!auth.authenticated || auth.role !== "admin") {
            return json({ error: "管理者権限が必要です" }, 403, request);
          }
          const parsed = await parseJsonBody(request);
          if (!parsed.ok) return parsed.response;
          const { id, name, password, maxStocks, maxIndices, isActive, role } = parsed.body;
          if (!id || typeof id !== "string") {
            return json({ error: "Invalid password id" }, 400, request);
          }
          if (id === "admin-master") {
            if (role === "user" || isActive === false) {
              return json({ error: "マスター管理者アカウントのロール変更および無効化はできません" }, 403, request);
            }
            return json({ error: "マスター管理者アカウントの変更は専用エンドポイント (/api/admin/admin-password) を使用してください" }, 403, request);
          }

          await ensurePasswordTable(env);
          const updates: string[] = [];
          const params: unknown[] = [];

          if (typeof name === "string" && name.trim()) {
            updates.push("name = ?");
            params.push(name.trim().slice(0, 100));
          }
          if (typeof password === "string" && password.trim().length > 0) {
            if (password.trim().length < 8 || password.trim().length > 100) {
              return json({ error: "パスワードは8〜100文字で入力してください" }, 400, request);
            }
            const hash = await hashPassword(password.trim());
            updates.push("password_hash = ?");
            params.push(hash);
          }
          if (maxStocks !== undefined) {
            if (maxStocks === null || maxStocks === 0 || maxStocks === "") {
              updates.push("max_stocks = NULL");
            } else {
              const num = Number(maxStocks);
              if (!Number.isFinite(num) || num < 1 || num > 500) {
                return json({ error: "銘柄数上限は1〜500の数値を指定してください" }, 400, request);
              }
              updates.push("max_stocks = ?");
              params.push(Math.floor(num));
            }
          }
          if (maxIndices !== undefined) {
            if (maxIndices === null || maxIndices === 0 || maxIndices === "") {
              updates.push("max_indices = NULL");
            } else {
              const num = Number(maxIndices);
              if (!Number.isFinite(num) || num < 1 || num > 100) {
                return json({ error: "指数上限は1〜100の数値を指定してください" }, 400, request);
              }
              updates.push("max_indices = ?");
              params.push(Math.floor(num));
            }
          }
          if (role === "admin" || role === "user") {
            updates.push("role = ?");
            params.push(role);
          }
          if (isActive !== undefined) {
            updates.push("is_active = ?");
            params.push(isActive ? 1 : 0);
          }
          const now = Math.floor(Date.now() / 1000);
          updates.push("updated_at = ?");
          params.push(now);

          params.push(id);
          await env.DB.prepare(
            `UPDATE access_passwords SET ${updates.join(", ")} WHERE id = ?`
          ).bind(...params).run();
          clearAuthCache();

          return json({ ok: true }, 200, request);
        } catch (err) {
          console.error("Failed to update password:", err);
          return json({ error: "Internal server error" }, 500, request);
        }
      }

      // 管理者向け: ユーザーパスワード削除
      if (url.pathname === "/api/admin/passwords" && request.method === "DELETE") {
        try {
          const auth = await authenticatePassword(request, env);
          if (!auth.authenticated || auth.role !== "admin") {
            return json({ error: "管理者権限が必要です" }, 403, request);
          }
          const id = url.searchParams.get("id");
          if (!id) {
            return json({ error: "Missing password id" }, 400, request);
          }
          if (id === "admin-master") {
            return json({ error: "マスター管理者パスワードは削除できません" }, 403, request);
          }
          await ensurePasswordTable(env);
          await env.DB.prepare("DELETE FROM access_passwords WHERE id = ?").bind(id).run();
          clearAuthCache();
          return json({ ok: true }, 200, request);
        } catch (err) {
          console.error("Failed to delete password:", err);
          return json({ error: "Internal server error" }, 500, request);
        }
      }

      // 管理者向け: 管理者マスターパスワード変更 (平文保存は行わない)
      if (url.pathname === "/api/admin/admin-password" && request.method === "PUT") {
        try {
          const auth = await authenticatePassword(request, env);
          if (!auth.authenticated || auth.role !== "admin" || auth.id !== "admin-master") {
            return json({ error: "管理者権限が必要です" }, 403, request);
          }
          const parsed = await parseJsonBody(request);
          if (!parsed.ok) return parsed.response;
          const newPassword = typeof parsed.body.newPassword === "string" ? parsed.body.newPassword.trim() : "";
          if (newPassword.length < 8 || newPassword.length > 100) {
            return json({ error: "管理者パスワードは8〜100文字で入力してください" }, 400, request);
          }
          await ensurePasswordTable(env);
          const hash = await hashPassword(newPassword);
          const now = Math.floor(Date.now() / 1000);
          await env.DB.prepare(
            "INSERT INTO access_passwords (id, name, password_hash, role, max_stocks, is_active, created_at, updated_at) VALUES ('admin-master', 'マスター管理者', ?, 'admin', NULL, 1, ?, ?) ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash, role = 'admin', max_stocks = NULL, is_active = 1, updated_at = excluded.updated_at"
          ).bind(hash, now, now).run();
          clearAuthCache();

          return json({ ok: true, message: "管理者パスワードを更新しました" }, 200, request);
        } catch (err) {
          console.error("Failed to update admin password:", err);
          return json({ error: "Internal server error" }, 500, request);
        }
      }

      // 構成銘柄の個別追加 (パスワード認証＋上限数チェック)
      if (url.pathname === "/api/indices/stock" && request.method === "POST") {
        try {
          const parsed = await parseJsonBody(request);
          if (!parsed.ok) return parsed.response;
          const { indexId, stock, password } = parsed.body;
          if (!indexId || typeof indexId !== "string") {
            return json({ error: "indexId is required" }, 400, request);
          }

          // 認証チェック
          const auth = await authenticatePassword(request, env, typeof password === "string" ? password : null);
          if (!auth.authenticated) {
            return json({ error: "この操作にはパスワード認証が必要です" }, 401, request);
          }

          if (SYSTEM_INDICES.has(indexId) && auth.role !== "admin") {
            return json({ error: "システム指数の銘柄変更には管理者権限が必要です" }, 403, request);
          }

          if (!stock || typeof stock !== "object") {
            return json({ error: "銘柄情報 (stock) は必須です" }, 400, request);
          }
          const rawStock = stock as Record<string, unknown>;
          const ticker = typeof rawStock.ticker === "string" ? rawStock.ticker.trim().toUpperCase() : "";
          const name = typeof rawStock.name === "string" ? rawStock.name.trim() : "";
          const theme = typeof rawStock.theme === "string" ? rawStock.theme.trim() : "カスタム";
          const rawWeight =
            rawStock.weight === undefined || rawStock.weight === null || rawStock.weight === ""
              ? 10
              : Number(rawStock.weight);
          if (!Number.isFinite(rawWeight) || rawWeight <= 0 || rawWeight > 100) {
            return json({ error: "銘柄の構成比率 (weight) は0超100以下の数値を指定してください" }, 400, request);
          }
          const weight = rawWeight;

          if (!ticker || !/^[A-Za-z0-9.\-]+$/.test(ticker) || ticker.length > 20) {
            return json({ error: "無効な銘柄コードです" }, 400, request);
          }
          if (!name || name.length > 100) {
            return json({ error: "銘柄名は1〜100文字で入力してください" }, 400, request);
          }

          // 現在の銘柄数チェック
          const { results: existingStocks } = await env.DB.prepare(
            "SELECT ticker FROM basket_items WHERE index_id = ?"
          ).bind(indexId).all();

          // 所有権チェック（非管理者の場合）
          let existingHash: string | null = null;
          let hasCheckedIndex = false;
          try {
            const { results } = await env.DB.prepare(
              "SELECT id, owner_token_hash FROM indices WHERE id = ?"
            ).bind(indexId).all();
            if (results && results.length > 0) {
              hasCheckedIndex = true;
              existingHash = (results[0] as { owner_token_hash?: string }).owner_token_hash || null;
            }
          } catch {
            try {
              const { results } = await env.DB.prepare("SELECT id FROM indices WHERE id = ?").bind(indexId).all();
              if (results && results.length > 0) hasCheckedIndex = true;
            } catch {}
          }

          if (!hasCheckedIndex) {
            return json({ error: "Index not found" }, 404, request);
          }

          if (auth.role !== "admin") {
            if (existingHash) {
              const providedToken =
                request.headers.get("x-owner-token")?.trim() ||
                (typeof rawStock.ownerToken === "string" ? rawStock.ownerToken.trim() : "") ||
                (typeof (parsed.body as any).ownerToken === "string" ? (parsed.body as any).ownerToken.trim() : "");

              if (!providedToken) {
                return json({ error: "この指数を更新する権限がありません（作成者トークンが必要です）" }, 403, request);
              }
              const providedHash = await hashToken(providedToken);
              if (!timingSafeEqual(providedHash, existingHash)) {
                return json({ error: "この指数を更新する権限がありません（作成者トークンが一致しません）" }, 403, request);
              }
            } else {
              return json({ error: "この指数は保護されているため更新できません（管理者権限が必要です）" }, 403, request);
            }
          }

          const isAlreadyPresent = (existingStocks as { ticker: string }[] || []).some((s) => s.ticker === ticker);
          const currentCount = existingStocks ? existingStocks.length : 0;

          if (!isAlreadyPresent) {
            // 新規追加の場合、ユーザー権限なら上限銘柄数をチェック
            if (auth.role === "user" && auth.maxStocks && auth.maxStocks > 0) {
              if (currentCount >= auth.maxStocks) {
                return json(
                  { error: `このユーザー用パスワードでは銘柄数を最大${auth.maxStocks}銘柄までに制限されています（現在${currentCount}銘柄）` },
                  403,
                  request
                );
              }
            }
          }

          await env.DB.prepare(
            "INSERT OR REPLACE INTO basket_items (index_id, ticker, name, weight, theme) VALUES (?, ?, ?, ?, ?)"
          ).bind(indexId, ticker, name, weight, theme).run();

          clearMemoryCache("api:indices");
          clearMemoryCache("calc:");
          return json({ ok: true, message: "銘柄を追加・更新しました", ticker }, 200, request);
        } catch (err) {
          console.error("Failed to add stock:", err);
          return json({ error: "Internal server error" }, 500, request);
        }
      }

      // 構成銘柄の個別削除 (パスワード認証)
      if (url.pathname === "/api/indices/stock" && request.method === "DELETE") {
        try {
          const indexId = url.searchParams.get("indexId");
          const ticker = url.searchParams.get("ticker");
          if (
            !indexId ||
            !ticker ||
            ticker.trim().length === 0 ||
            ticker.trim().length > 20 ||
            !/^[A-Za-z0-9.\-]+$/.test(ticker.trim())
          ) {
            return json({ error: "indexId and ticker parameters are required" }, 400, request);
          }

          const auth = await authenticatePassword(request, env);
          if (!auth.authenticated) {
            return json({ error: "この操作にはパスワード認証が必要です" }, 401, request);
          }

          if (SYSTEM_INDICES.has(indexId) && auth.role !== "admin") {
            return json({ error: "システム指数の銘柄削除には管理者権限が必要です" }, 403, request);
          }

          // 所有権チェック（非管理者の場合）
          let existingHash: string | null = null;
          let hasCheckedIndex = false;
          try {
            const { results } = await env.DB.prepare(
              "SELECT id, owner_token_hash FROM indices WHERE id = ?"
            ).bind(indexId).all();
            if (results && results.length > 0) {
              hasCheckedIndex = true;
              existingHash = (results[0] as { owner_token_hash?: string }).owner_token_hash || null;
            }
          } catch {
            try {
              const { results } = await env.DB.prepare("SELECT id FROM indices WHERE id = ?").bind(indexId).all();
              if (results && results.length > 0) hasCheckedIndex = true;
            } catch {}
          }

          if (!hasCheckedIndex) {
            return json({ error: "Index not found" }, 404, request);
          }

          if (auth.role !== "admin") {
            if (existingHash) {
              const providedToken =
                request.headers.get("x-owner-token")?.trim() || "";

              if (!providedToken) {
                return json({ error: "この指数から銘柄を削除する権限がありません（作成者トークンが必要です）" }, 403, request);
              }
              const providedHash = await hashToken(providedToken);
              if (!timingSafeEqual(providedHash, existingHash)) {
                return json({ error: "この指数から銘柄を削除する権限がありません（作成者トークンが一致しません）" }, 403, request);
              }
            } else {
              return json({ error: "この指数は保護されているため銘柄を削除できません（管理者権限が必要です）" }, 403, request);
            }
          }

          // 最低1銘柄は必要
          const { results: countRes } = await env.DB.prepare(
            "SELECT count(*) as cnt FROM basket_items WHERE index_id = ?"
          ).bind(indexId).all();
          const cnt = (countRes?.[0] as { cnt: number })?.cnt ?? 0;
          if (cnt <= 1) {
            return json({ error: "構成銘柄が1件のみのため削除できません（指数には最低1銘柄必要です）" }, 400, request);
          }

          await env.DB.prepare(
            "DELETE FROM basket_items WHERE index_id = ? AND ticker = ?"
          ).bind(indexId, ticker.trim().toUpperCase()).run();

          clearMemoryCache("api:indices");
          clearMemoryCache("calc:");
          return json({ ok: true, message: "銘柄を削除しました", ticker }, 200, request);
        } catch (err) {
          console.error("Failed to delete stock:", err);
          return json({ error: "Internal server error" }, 500, request);
        }
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
          const etag = await generateETag(JSON.stringify(memCached));
          const ifNoneMatch = request.headers.get("if-none-match");
          if (ifNoneMatch && (ifNoneMatch === etag || ifNoneMatch === `W/${etag}`)) {
            return notModified(request, {
              "etag": etag,
              "cache-control": "public, max-age=60, s-maxage=300",
            });
          }
          return json(memCached, 200, request, {
            "etag": etag,
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
            const etag = await generateETag(cacheRow.data);
            const ifNoneMatch = request.headers.get("if-none-match");
            if (ifNoneMatch && (ifNoneMatch === etag || ifNoneMatch === `W/${etag}`)) {
              return notModified(request, {
                "etag": etag,
                "cache-control": "public, max-age=60, s-maxage=300",
              });
            }
            return json(parsedData, 200, request, {
              "etag": etag,
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
        const freshEtag = await generateETag(JSON.stringify(responseData));
        const ifNoneMatch = request.headers.get("if-none-match");
        if (ifNoneMatch && (ifNoneMatch === freshEtag || ifNoneMatch === `W/${freshEtag}`)) {
          return notModified(request, {
            "etag": freshEtag,
            "cache-control": "public, max-age=60, s-maxage=300",
          });
        }
        return json(responseData, 200, request, {
          "etag": freshEtag,
          "cache-control": "public, max-age=60, s-maxage=300",
        });
      } catch (err) {
        console.error("API Error [snapshot]:", err);
        return json({ error: "Internal server error" }, 500, request);
      }
    }

    // 登録されている指数一覧の取得 (D1から取得、sort_order使用、インメモリ&HTTPキャッシュ付き)
    if (url.pathname === "/api/indices" && request.method === "GET") {
      try {
        const cachedIndices = getMemoryCache<unknown>("api:indices");
        if (cachedIndices) {
          const etag = await generateETag(JSON.stringify(cachedIndices));
          const ifNoneMatch = request.headers.get("if-none-match");
          if (ifNoneMatch && (ifNoneMatch === etag || ifNoneMatch === `W/${etag}`)) {
            return notModified(request, {
              "etag": etag,
              // ETag/304 revalidation only; the CDN must not cache this list
              // (mutations cannot purge the edge cache, so public caching
              // would serve stale index lists after saves/deletes).
              "cache-control": "no-cache",
            });
          }
          return json(cachedIndices, 200, request, {
            "etag": etag,
            "cache-control": "no-cache",
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

        const etag = await generateETag(JSON.stringify(indicesList));
        const ifNoneMatch = request.headers.get("if-none-match");
        if (ifNoneMatch && (ifNoneMatch === etag || ifNoneMatch === `W/${etag}`)) {
          return notModified(request, {
            "etag": etag,
            "cache-control": "no-cache",
          });
        }

        return json(indicesList, 200, request, {
          "etag": etag,
          "cache-control": "no-cache",
        });
      } catch (err) {
        console.error("API Error [indices]:", err);
        return json({ error: "Internal server error" }, 500, request);
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

        // Password authentication and role check
        const explicitPwd = typeof body.password === "string" ? body.password : null;
        const auth = await authenticatePassword(request, env, explicitPwd);
        const isAdmin = auth.authenticated && auth.role === "admin";

        if (SYSTEM_INDICES.has(id) && !isAdmin) {
          return json({ error: "システム指数の編集には管理者権限が必要です" }, 403, request);
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
        if (basket.length === 0) {
          return json({ error: "Basket must contain at least 1 item" }, 400, request);
        }
        if (basket.length > MAX_BASKET_ITEMS) {
          return json({ error: `Basket must contain at most ${MAX_BASKET_ITEMS} items` }, 400, request);
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
          const ticker = r.ticker.trim().toUpperCase();
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

        // Stock limit check for non-admin users
        if (auth.authenticated && auth.role === "user" && auth.maxStocks && auth.maxStocks > 0) {
          if (basket.length > auth.maxStocks) {
            return json(
              { error: `このユーザー用パスワードでは銘柄数を最大${auth.maxStocks}銘柄までに制限されています（指定: ${basket.length}銘柄）` },
              403,
              request
            );
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
        let hasOwnerTokenHashColumn = true;
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
          hasOwnerTokenHashColumn = false;
          try {
            const { results } = await env.DB.prepare("SELECT id FROM indices WHERE id = ?").bind(id).all();
            if (results && results.length > 0) isExisting = true;
          } catch {}
        }

        // Index limit check for user role when creating a new index
        if (!isExisting && auth.authenticated && auth.role === "user" && auth.maxIndices && auth.maxIndices > 0 && auth.id) {
          try {
            const countRes = await env.DB.prepare(
              "SELECT COUNT(*) as count FROM indices WHERE creator_id = ?"
            ).bind(auth.id).all();
            const countRow = countRes.results?.[0] as { count?: number } | undefined;
            const currentIndicesCount = countRow?.count ?? 0;
            if (currentIndicesCount >= auth.maxIndices) {
              return json(
                { error: `このユーザー用パスワードでは指数作成数を最大${auth.maxIndices}件までに制限されています（現在${currentIndicesCount}件登録済み）` },
                403,
                request
              );
            }
          } catch {
            // Ignore if creator_id column is not yet present
          }
        }

        let targetHash: string | null = null;

        if (isExisting) {
          // If index already exists and has an owner token hash, require authorization (admin bypasses)
          if (!isAdmin) {
            if (existingHash) {
              if (!providedToken) {
                return json({ error: "この指数を更新する権限がありません（作成者トークンが必要です）" }, 403, request);
              }
              const providedHash = await hashToken(providedToken);
              if (!timingSafeEqual(providedHash, existingHash)) {
                return json({ error: "この指数を更新する権限がありません（作成者トークンが一致しません）" }, 403, request);
              }
              targetHash = existingHash;
            } else {
              return json({ error: "この指数は保護されているため更新できません（管理者権限が必要です）" }, 403, request);
            }
          } else {
            // Admin edit - if a token is provided, assign it now
            if (providedToken) {
              targetHash = await hashToken(providedToken);
            } else if (existingHash) {
              targetHash = existingHash;
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
        const creatorId = auth.authenticated && auth.id ? auth.id : null;

        let insertIndexStmt;
        if (hasOwnerTokenHashColumn) {
          try {
            insertIndexStmt = env.DB.prepare(
              "INSERT OR REPLACE INTO indices (id, name, description, base_value, sort_order, owner_token_hash, creator_id, created_at) VALUES (?, ?, ?, ?, 50, ?, COALESCE((SELECT creator_id FROM indices WHERE id = ?), ?), COALESCE((SELECT created_at FROM indices WHERE id = ?), ?))",
            ).bind(id, name, description, baseValue, targetHash, id, creatorId, id, nowMs);
          } catch {
            insertIndexStmt = env.DB.prepare(
              "INSERT OR REPLACE INTO indices (id, name, description, base_value, sort_order, owner_token_hash, created_at) VALUES (?, ?, ?, ?, 50, ?, COALESCE((SELECT created_at FROM indices WHERE id = ?), ?))",
            ).bind(id, name, description, baseValue, targetHash, id, nowMs);
          }
        } else {
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
            ).bind(id, String(b.ticker).trim().toUpperCase(), String(b.name).trim(), Number(b.weight), String(b.theme || "カスタム").trim()),
          ),
        ];

        try {
          await env.DB.batch(statements);
        } catch (batchErr: any) {
          if (
            hasOwnerTokenHashColumn &&
            batchErr &&
            typeof batchErr.message === "string" &&
            (batchErr.message.includes("owner_token_hash") || batchErr.message.includes("created_at") || batchErr.message.includes("creator_id"))
          ) {
            const fallbackStmt = env.DB.prepare(
              "INSERT OR REPLACE INTO indices (id, name, description, base_value, sort_order) VALUES (?, ?, ?, ?, 50)",
            ).bind(id, name, description, baseValue);
            await env.DB.batch([fallbackStmt, ...statements.slice(1)]);
          } else {
            throw batchErr;
          }
        }
        clearMemoryCache("api:indices");
        clearMemoryCache("calc:");

        return json({ ok: true, id, ownerToken: providedToken, message: "Index saved successfully" }, 200, request);
      } catch (err) {
        console.error("API Error [POST indices]:", err);
        return json({ error: "Internal server error" }, 500, request);
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
          // Fallback if owner_token_hash column doesn't exist yet on unmigrated db
          try {
            const { results } = await env.DB.prepare("SELECT id FROM indices WHERE id = ?").bind(id).all();
            if (results && results.length > 0) isExisting = true;
          } catch {}
        }

        if (!isExisting) {
          return json({ error: "Index not found" }, 404, request);
        }

        const auth = await authenticatePassword(request, env);
        const isAdmin = auth.authenticated && auth.role === "admin";

        const providedToken =
          request.headers.get("x-owner-token")?.trim() || "";

        if (!isAdmin) {
          if (existingHash) {
            if (!providedToken) {
              return json({ error: "この指数を削除する権限がありません（作成者トークンが必要です）" }, 403, request);
            }
            const providedHash = await hashToken(providedToken);
            if (!timingSafeEqual(providedHash, existingHash)) {
              return json({ error: "この指数を削除する権限がありません（作成者トークンが一致しません）" }, 403, request);
            }
          } else {
            // Protected / legacy index without hash can only be deleted by admin
            return json({ error: "この指数は保護されているため削除できません（管理者権限が必要です）" }, 403, request);
          }
        }

        const statements = [
          env.DB.prepare("DELETE FROM basket_items WHERE index_id = ?").bind(id),
          env.DB.prepare("DELETE FROM indices WHERE id = ?").bind(id),
        ];
        await env.DB.batch(statements);
        clearMemoryCache("api:indices");
        clearMemoryCache("calc:");

        return json({ ok: true, id, message: "Index deleted successfully" }, 200, request);
      } catch (err) {
        console.error("API Error [DELETE indices]:", err);
        return json({ error: "Internal server error" }, 500, request);
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
        const tickers = Array.from(new Set((rawTickers as string[]).map((t) => t.trim().toUpperCase()))).slice(0, 30);
        const force = body.force === true;
        const results: { ticker: string; status: string; count?: number; lastSynced?: number }[] =
          [];
        const now = Math.floor(Date.now() / 1000);
        const CACHE_DURATION = getMarketAwareCacheDuration(new Date(now * 1000));

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
                // Check if existing stock_series has identical latest data to skip expensive D1 writes
                let shouldSkipWrite = false;
                if (!force) {
                  try {
                    const { results: existingRows } = await env.DB.prepare(
                      "SELECT prices FROM stock_series WHERE ticker = ?",
                    ).bind(ticker).all();
                    if (existingRows && existingRows.length > 0 && (existingRows[0] as any).prices) {
                      const existingPrices = JSON.parse((existingRows[0] as any).prices);
                      if (Array.isArray(existingPrices) && existingPrices.length > 0) {
                        const lastExisting = existingPrices[existingPrices.length - 1];
                        const lastFresh = series[series.length - 1];
                        if (
                          lastExisting &&
                          lastFresh &&
                          lastExisting.date === lastFresh.date &&
                          lastExisting.close === lastFresh.close
                        ) {
                          shouldSkipWrite = true;
                        }
                      }
                    }
                  } catch {
                    // ignore
                  }
                }

                if (shouldSkipWrite) {
                  // Identical data: save expensive D1 table writes by updating only sync_logs
                  await env.DB.prepare(
                    "INSERT OR REPLACE INTO sync_logs (ticker, last_synced_at) VALUES (?, ?)",
                  ).bind(ticker, now).run();
                  return { ticker, status: "cached", count: series.length };
                }

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
                clearMemoryCache("calc:");
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
        console.error("API Error [sync-prices]:", err);
        return json({ error: "Internal server error" }, 500, request);
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
          return json({ error: "Invalid basket: must contain at least 1 item" }, 400, request);
        }
        if (basket.length > MAX_BASKET_ITEMS) {
          return json({ error: `Invalid basket: must contain at most ${MAX_BASKET_ITEMS} items` }, 400, request);
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
          const ticker = r.ticker.trim().toUpperCase();
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
          ticker: (item.ticker as string).trim().toUpperCase(),
          name: (item.name as string).trim(),
          theme: (item.theme as string).trim(),
          weight: item.weight,
        }));

        // In-memory cache check: identical basket and baseValue returns immediately,
        // saving both expensive D1 reads and calculation CPU time.
        const calcCacheKey = `calc:${baseValue}:${validatedBasket
          .slice()
          .sort((a, b) => a.ticker.localeCompare(b.ticker))
          .map((b) => `${b.ticker}:${b.weight}`)
          .join(",")}`;

        const cachedCalc = getMemoryCache<unknown>(calcCacheKey);
        if (cachedCalc) {
          return json(cachedCalc, 200, request, {
            "x-cache": "HIT",
          });
        }

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

        const responseData = {
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
        };

        setMemoryCache(calcCacheKey, responseData, 300); // 5 minutes cache

        return json(responseData, 200, request);
      } catch (err) {
        console.error("API Error [calculate]:", err);
        return json({ error: "Internal server error" }, 500, request);
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
    return json({ error: "Internal server error" }, 500, request);
  }
  },
};
