import { useState, useEffect, useCallback, useRef } from "react";
import type { CustomIndex } from "../data/indices";
import type { PricePoint } from "../types";

const API_BASE = "/api";

export function useCalculation(selectedIndex: CustomIndex | null) {
  const [customSeries, setCustomSeries] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncWarnings, setSyncWarnings] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const calculate = useCallback(async () => {
    if (!selectedIndex) return;

    // Abort previous request to prevent race conditions
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setSyncing(false);
    setSyncProgress(0);
    setSyncWarnings([]);

    try {
      // 全銘柄の同期を走らせる
      if (selectedIndex.basket.length > 0) {
        setSyncing(true);
        const BATCH_SIZE = 40;
        const tickers = selectedIndex.basket.map((b) => b.ticker);
        const warnings: string[] = [];

        for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
          if (controller.signal.aborted) return;

          setSyncProgress(Math.round((i / tickers.length) * 100));
          const chunk = tickers.slice(i, i + BATCH_SIZE);
          try {
            const syncRes = await fetch(`${API_BASE}/sync-prices`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tickers: chunk }),
              signal: controller.signal,
            });
            if (!syncRes.ok) {
              warnings.push(`同期バッチ ${Math.floor(i / BATCH_SIZE) + 1} が失敗しました`);
            }
          } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            warnings.push(`同期バッチ ${Math.floor(i / BATCH_SIZE) + 1} で通信エラー`);
          }
        }
        setSyncProgress(100);
        setSyncing(false);
        if (warnings.length > 0) {
          setSyncWarnings(warnings);
        }
      }

      if (controller.signal.aborted) return;

      const res = await fetch(`${API_BASE}/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          basket: selectedIndex.basket,
          baseValue: selectedIndex.baseValue,
        }),
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      if (!res.ok) throw new Error("指数の計算に失敗しました");
      const data = await res.json();
      setCustomSeries(data.series);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "計算に失敗しました";
      setError(message);
    } finally {
      if (!abortRef.current?.signal.aborted) {
        setLoading(false);
        setSyncing(false);
      }
    }
  }, [selectedIndex]);

  useEffect(() => {
    calculate();
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [calculate]);

  return { customSeries, loading, error, syncing, syncProgress, syncWarnings, recalculate: calculate };
}
