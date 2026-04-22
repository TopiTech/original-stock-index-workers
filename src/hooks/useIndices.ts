import { useState, useEffect, useCallback } from "react";
import type { CustomIndex } from "../data/indices";

const API_BASE = "/api";

export function useIndices() {
  const [indices, setIndices] = useState<CustomIndex[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<CustomIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${API_BASE}/indices`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("指数一覧の取得に失敗しました");
        return res.json();
      })
      .then((data: CustomIndex[]) => {
        setIndices(data);
        if (data.length > 0) setSelectedIndex(data[0]);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  const selectIndex = useCallback((index: CustomIndex) => {
    setSelectedIndex(index);
  }, []);

  return { indices, selectedIndex, selectIndex, loading, error };
}
