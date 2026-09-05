import type { AuthSession } from "../types";

const AUTH_STORAGE_KEY = "custom_stock_index_auth";

function getSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function getLocalStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Retrieve the current-tab auth session. Passwords are intentionally kept in
 * sessionStorage instead of persistent localStorage; legacy localStorage
 * entries are migrated and removed on first read.
 */
export function getStoredAuth(): AuthSession | null {
  try {
    const sessionStore = getSessionStorage();
    const localStore = getLocalStorage();
    const sessionRaw = sessionStore?.getItem(AUTH_STORAGE_KEY) || null;
    const legacyRaw = localStore?.getItem(AUTH_STORAGE_KEY) || null;
    const raw = sessionRaw || legacyRaw;
    if (!raw) return null;
    const session = JSON.parse(raw) as AuthSession;
    if (!sessionRaw && legacyRaw && sessionStore) {
      sessionStore.setItem(AUTH_STORAGE_KEY, legacyRaw);
      localStore?.removeItem(AUTH_STORAGE_KEY);
    }
    return session;
  } catch {
    return null;
  }
}

function notifyAuthChanged(): void {
  if (typeof globalThis !== "undefined") {
    const target = (globalThis as unknown as { window?: { dispatchEvent: (e: Event) => boolean } }).window || globalThis;
    if (typeof (target as any)?.dispatchEvent === "function" && typeof Event !== "undefined") {
      try {
        (target as any).dispatchEvent(new Event("auth-changed"));
      } catch {}
    }
  }
}

/**
 * Persist auth session for the current tab only.
 */
export function storeAuth(session: AuthSession): void {
  try {
    const serialized = JSON.stringify(session);
    const sessionStore = getSessionStorage();
    if (sessionStore) {
      sessionStore.setItem(AUTH_STORAGE_KEY, serialized);
      getLocalStorage()?.removeItem(AUTH_STORAGE_KEY);
    } else {
      // Fallback for non-browser/older environments where sessionStorage is
      // unavailable; the application still needs to remain usable there.
      getLocalStorage()?.setItem(AUTH_STORAGE_KEY, serialized);
    }
    notifyAuthChanged();
  } catch (err) {
    console.error("Failed to store auth:", err);
  }
}

/**
 * Clear auth session from localStorage
 */
export function clearAuth(): void {
  try {
    getSessionStorage()?.removeItem(AUTH_STORAGE_KEY);
    getLocalStorage()?.removeItem(AUTH_STORAGE_KEY);
    notifyAuthChanged();
  } catch {}
}

/**
 * Returns HTTP headers for authenticated requests
 */
export function getAuthHeaders(session?: AuthSession | null): Record<string, string> {
  const current = session || getStoredAuth();
  if (!current?.password) return {};
  return {
    "x-auth-password": current.password,
    ...(current.role === "admin" ? { "x-admin-key": current.password } : {}),
  };
}

/**
 * Verify password against the worker API
 */
export async function verifyPassword(
  password: string
): Promise<{ ok: boolean; session?: AuthSession; error?: string }> {
  try {
    const trimmed = password.trim();
    if (!trimmed) {
      return { ok: false, error: "パスワードを入力してください" };
    }

    const res = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: trimmed }),
    });

    const data = (await res.json().catch(() => ({}))) as Record<string, any>;
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "パスワードが正しくありません" };
    }

    const session: AuthSession = {
      role: data.role,
      name: data.name || (data.role === "admin" ? "管理者" : "ユーザー"),
      password: trimmed,
      maxStocks: data.maxStocks ?? null,
      id: data.id,
    };

    storeAuth(session);
    return { ok: true, session };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "認証通信エラーが発生しました";
    return { ok: false, error: msg };
  }
}
