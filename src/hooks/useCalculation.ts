import { useState, useEffect, useCallback } from "react";
import type { CustomIndex } from "../data/indices";
import type { PricePoint } from "../types";

const API_BASE = "/api";

export function useCalculation(selectedIndex: CustomIndex | null) {
  const [customSeries, setCustomSeries] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);

  const calculate = useCallback(async () => {
    if (!selectedIndex) return;

    setLoading(true);
    setError(null);
    setSyncing(false);
    setSyncProgress(0);

    try {
      // 全銘柄の同期を走らせる（初回や構成変更時への対応）
      if (selectedIndex.basket.length > 0) {
        setSyncing(true);
        const BATCH_SIZE = 40;
        const tickers = selectedIndex.basket.map((b) => b.ticker);

        for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
          setSyncProgress(Math.round((i / tickers.length) * 100));
          const chunk = tickers.slice(i, i + BATCH_SIZE);
          const syncRes = await fetch(`${API_BASE}/sync-prices`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tickers: chunk }),
          });
          if (!syncRes.ok) console.warn("Sync batch failed", i);
        }
        setSyncProgress(100);
        setSyncing(false);
      }

      const res = await fetch(`${API_BASE}/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          basket: selectedIndex.basket,
          baseValue: selectedIndex.baseValue,
        }),
      });

      if (!res.ok) throw new Error("指数の計算に失敗しました");
      const data = await res.json();
      setCustomSeries(data.series);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "計算に失敗しました";
      setError(message);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [selectedIndex]);

  useEffect(() => {
    calculate();
  }, [calculate]);

  return { customSeries, loading, error, syncing, syncProgress, recalculate: calculate };
}
