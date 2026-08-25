import { useState, useEffect } from "react";
import type { Snapshot } from "../types";

const API_BASE = "/api";

export type NikkeiData = {
  snapshot: Snapshot;
  series: { date: string; close: number }[];
};

export function useNikkei() {
  const [nikkeiData, setNikkeiData] = useState<NikkeiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${API_BASE}/snapshot`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("日経平均データの取得に失敗しました");
        return res.json();
      })
      .then((data: NikkeiData) => {
        if (!controller.signal.aborted) {
          setNikkeiData(data);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError" && !controller.signal.aborted) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  return { nikkeiData, loading, error };
}
