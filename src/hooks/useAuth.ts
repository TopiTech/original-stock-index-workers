import { useState, useCallback, useEffect } from "react";
import type { AuthSession } from "../types";
import { getStoredAuth, storeAuth, clearAuth, verifyPassword, getAuthHeaders } from "../lib/auth";

export function useAuth() {
  const [session, setSession] = useState<AuthSession | null>(() => getStoredAuth());
  const [loading, setLoading] = useState(false);

  // Sync with localStorage and cross-component/cross-tab events
  useEffect(() => {
    const syncSession = () => {
      const current = getStoredAuth();
      setSession((prev) => {
        if (!prev && !current) return prev;
        if (
          prev &&
          current &&
          prev.id === current.id &&
          prev.password === current.password &&
          prev.role === current.role &&
          prev.maxStocks === current.maxStocks &&
          prev.maxIndices === current.maxIndices &&
          prev.name === current.name
        ) {
          return prev;
        }
        return current;
      });
    };

    if (typeof window !== "undefined") {
      window.addEventListener("auth-changed", syncSession);
      window.addEventListener("storage", syncSession);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("auth-changed", syncSession);
        window.removeEventListener("storage", syncSession);
      }
    };
  }, []);

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
  const maxIndices = session?.maxIndices ?? null;

  const getHeaders = useCallback((): Record<string, string> => {
    return getAuthHeaders(session);
  }, [session?.password, session?.role]);

  return {
    session,
    isAuthenticated,
    isAdmin,
    isUser,
    maxStocks,
    maxIndices,
    loading,
    login,
    logout,
    getHeaders,
  };
}
