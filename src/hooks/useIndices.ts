import { useState, useEffect, useCallback } from "react";
import type { CustomIndex } from "../data/indices";
import {
  saveIndexOwnerToken,
  getIndexOwnerToken,
  removeIndexOwnerToken,
  isIndexOwner,
} from "../lib/ownership";

const API_BASE = "/api";

export function useIndices() {
  const [indices, setIndices] = useState<CustomIndex[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<CustomIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIndices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/indices`);
      if (!res.ok) throw new Error("指数一覧の取得に失敗しました");
      const data: CustomIndex[] = await res.json();
      setIndices(data);
      if (data.length > 0) {
        setSelectedIndex((prev) => {
          if (!prev) return data[0];
          const found = data.find((d) => d.id === prev.id);
          return found || data[0];
        });
      } else {
        setSelectedIndex(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "指数一覧の取得に失敗しました";
      setError(msg);
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
        const res = await fetch(`${API_BASE}/indices`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-owner-token": token,
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
        const headers: Record<string, string> = {};
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
        await fetchIndices();
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "指数の削除に失敗しました";
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
    refreshIndices: fetchIndices,
    isOwner: isIndexOwner,
  };
}

