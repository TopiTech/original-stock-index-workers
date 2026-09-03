import { useState, useEffect, useCallback } from "react";
import type { CustomIndex } from "../data/indices";
import { DEFAULT_INDICES } from "../data/indices";
import type { BasketItem } from "../types";
import {
  saveIndexOwnerToken,
  getIndexOwnerToken,
  removeIndexOwnerToken,
  isIndexOwner,
} from "../lib/ownership";
import { getAuthHeaders } from "../lib/auth";

const API_BASE = "/api";
const INDICES_CACHE_KEY = "osi_indices_cache";
const INDICES_ETAG_KEY = "osi_indices_etag";

function getLocalIndicesCache(): CustomIndex[] | null {
  try {
    const raw = localStorage.getItem(INDICES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function useIndices() {
  const [indices, setIndices] = useState<CustomIndex[]>(() => {
    const cached = getLocalIndicesCache();
    return cached || DEFAULT_INDICES;
  });
  const [selectedIndex, setSelectedIndex] = useState<CustomIndex | null>(() => {
    const cached = getLocalIndicesCache();
    return (cached && cached[0]) || DEFAULT_INDICES[0] || null;
  });
  const [loading, setLoading] = useState(() => !getLocalIndicesCache());
  const [error, setError] = useState<string | null>(null);

  const fetchIndices = useCallback(async () => {
    try {
      if (!getLocalIndicesCache()) {
        setLoading(true);
      }
      setError(null);
      const etag = localStorage.getItem(INDICES_ETAG_KEY);
      const headers: Record<string, string> = {};
      if (etag) {
        headers["If-None-Match"] = etag;
      }

      const res = await fetch(`${API_BASE}/indices`, {
        headers,
      });

      if (res.status === 304) {
        // Not Modified: local cached indices are completely up-to-date!
        return;
      }

      if (!res.ok) throw new Error("指数一覧の取得に失敗しました");

      const newEtag = res.headers.get("etag");
      if (newEtag) {
        try {
          localStorage.setItem(INDICES_ETAG_KEY, newEtag);
        } catch {}
      }

      const data: CustomIndex[] = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        try {
          localStorage.setItem(INDICES_CACHE_KEY, JSON.stringify(data));
        } catch {}
        setIndices(data);
        setSelectedIndex((prev) => {
          if (!prev) return data[0];
          const found = data.find((d) => d.id === prev.id);
          return found || data[0];
        });
      } else {
        setIndices(DEFAULT_INDICES);
        setSelectedIndex((prev) => prev || DEFAULT_INDICES[0]);
      }
    } catch (err) {
      console.warn("API server unavailable, using cached/default indices:", err);
      // Fallback to local cached or built-in default indices so UI renders without failure
      const cached = getLocalIndicesCache();
      if (!cached) {
        setIndices(DEFAULT_INDICES);
        setSelectedIndex((prev) => prev || DEFAULT_INDICES[0]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIndices();
  }, [fetchIndices]);

  const selectIndex = useCallback((index: CustomIndex) => {
    setSelectedIndex(index);
  }, []);

  const saveCustomIndex = useCallback(
    async (
      newIndex: CustomIndex,
      ownerToken?: string,
    ): Promise<{ ok: boolean; error?: string; ownerToken?: string }> => {
      try {
        const token = ownerToken || getIndexOwnerToken(newIndex.id) || crypto.randomUUID();
        const authHeaders = getAuthHeaders();
        const res = await fetch(`${API_BASE}/indices`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-owner-token": token,
            ...authHeaders,
          },
          body: JSON.stringify({
            ...newIndex,
            ownerToken: token,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "指数の保存に失敗しました");
        }
        const data = await res.json().catch(() => ({}));
        const finalToken = data.ownerToken || token;
        saveIndexOwnerToken(newIndex.id, finalToken);
        try {
          localStorage.removeItem(INDICES_ETAG_KEY);
        } catch {}

        await fetchIndices();
        setSelectedIndex(newIndex);
        return { ok: true, ownerToken: finalToken };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "指数の保存に失敗しました";
        return { ok: false, error: msg };
      }
    },
    [fetchIndices],
  );

  const deleteCustomIndex = useCallback(
    async (id: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const token = getIndexOwnerToken(id);
        const authHeaders = getAuthHeaders();
        const headers: Record<string, string> = {
          ...authHeaders,
        };
        if (token) {
          headers["x-owner-token"] = token;
        }

        const res = await fetch(`${API_BASE}/indices?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers,
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "指数の削除に失敗しました");
        }

        removeIndexOwnerToken(id);
        try {
          localStorage.removeItem(INDICES_ETAG_KEY);
        } catch {}
        await fetchIndices();
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "指数の削除に失敗しました";
        return { ok: false, error: msg };
      }
    },
    [fetchIndices],
  );

  const addStockToIndex = useCallback(
    async (
      indexId: string,
      stock: BasketItem,
      password?: string,
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        const authHeaders = getAuthHeaders();
        const res = await fetch(`${API_BASE}/indices/stock`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
          },
          body: JSON.stringify({ indexId, stock, password }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "銘柄の追加に失敗しました");
        }
        try {
          localStorage.removeItem(INDICES_ETAG_KEY);
        } catch {}
        await fetchIndices();
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "銘柄の追加に失敗しました";
        return { ok: false, error: msg };
      }
    },
    [fetchIndices],
  );

  const removeStockFromIndex = useCallback(
    async (
      indexId: string,
      ticker: string,
      password?: string,
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        const authHeaders = getAuthHeaders();
        const params = new URLSearchParams({ indexId, ticker });
        if (password) params.set("password", password);
        const res = await fetch(`${API_BASE}/indices/stock?${params.toString()}`, {
          method: "DELETE",
          headers: {
            ...authHeaders,
          },
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "銘柄の削除に失敗しました");
        }
        try {
          localStorage.removeItem(INDICES_ETAG_KEY);
        } catch {}
        await fetchIndices();
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "銘柄の削除に失敗しました";
        return { ok: false, error: msg };
      }
    },
    [fetchIndices],
  );

  return {
    indices,
    selectedIndex,
    selectIndex,
    loading,
    error,
    saveCustomIndex,
    deleteCustomIndex,
    addStockToIndex,
    removeStockFromIndex,
    refreshIndices: fetchIndices,
    isOwner: isIndexOwner,
  };
}

