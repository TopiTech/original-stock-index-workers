import { useState, useCallback, useEffect } from "react";
import type { AuthSession } from "../types";
import { getStoredAuth, storeAuth, clearAuth, verifyPassword, getAuthHeaders } from "../lib/auth";

export function useAuth() {
  const [session, setSession] = useState<AuthSession | null>(() => getStoredAuth());
  const [loading, setLoading] = useState(false);

  // Re-verify or sync with storage if needed
  useEffect(() => {
    const current = getStoredAuth();
    if (current && (!session || session.password !== current.password)) {
      setSession(current);
    }
  }, [session]);

  const login = useCallback(async (password: string): Promise<{ ok: boolean; error?: string }> => {
    setLoading(true);
    const res = await verifyPassword(password);
    setLoading(false);
    if (res.ok && res.session) {
      setSession(res.session);
      return { ok: true };
    }
    return { ok: false, error: res.error || "認証に失敗しました" };
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setSession(null);
  }, []);

  const isAuthenticated = Boolean(session);
  const isAdmin = session?.role === "admin";
  const isUser = session?.role === "user";
  const maxStocks = session?.maxStocks ?? null;

  return {
    session,
    isAuthenticated,
    isAdmin,
    isUser,
    maxStocks,
    loading,
    login,
    logout,
    getHeaders: () => getAuthHeaders(session),
  };
}
