import type { AuthSession } from "../types";

const AUTH_STORAGE_KEY = "custom_stock_index_auth";

/**
 * Retrieve saved auth session from localStorage
 */
export function getStoredAuth(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Persist auth session to localStorage
 */
export function storeAuth(session: AuthSession): void {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  } catch (err) {
    console.error("Failed to store auth:", err);
  }
}

/**
 * Clear auth session from localStorage
 */
export function clearAuth(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
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
