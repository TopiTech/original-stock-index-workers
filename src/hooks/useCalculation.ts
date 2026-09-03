import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { CustomIndex } from "../data/indices";
import type { PricePoint, StockDetail, StockSeries } from "../types";
import { calculateStockDetails } from "../lib/analytics";
import { getAuthHeaders } from "../lib/auth";
import { useAuth } from "./useAuth";

const API_BASE = "/api";
const SYNC_STORAGE_KEY = "osi_stock_sync_cache";
const SYNC_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

function getLocalSyncCache(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SYNC_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function updateLocalSyncCache(tickers: string[]): void {
  try {
    const cache = getLocalSyncCache();
    const now = Date.now();
    for (const t of tickers) {
      cache[t] = now;
    }
    // Clean entries older than 7 days
    for (const [k, v] of Object.entries(cache)) {
      if (now - v > 7 * 24 * 60 * 60 * 1000) {
        delete cache[k];
      }
    }
    localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

// In-memory cache for calculated index results across tab clicks
const clientCalcCache = new Map<string, { series: PricePoint[]; stockUniverse: StockSeries[]; timestamp: number }>();

export function useCalculation(selectedIndex: CustomIndex | null) {
  const { session } = useAuth();
  const [customSeries, setCustomSeries] = useState<PricePoint[]>([]);
  const [stockUniverse, setStockUniverse] = useState<StockSeries[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncWarnings, setSyncWarnings] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const syncedTickersRef = useRef<Set<string>>(new Set());

  const calculate = useCallback(async (force = false) => {
    if (!selectedIndex || selectedIndex.basket.length === 0) {
      setCustomSeries([]);
      setStockUniverse([]);
      setLoading(false);
      setSyncing(false);
      setError(null);
      return;
    }

    const basketKey = `${selectedIndex.id}:${selectedIndex.baseValue}:${selectedIndex.basket
      .map((b) => `${b.ticker}:${b.weight}`)
      .join(",")}`;

    // SWR pattern: immediately populate from client memory cache if available
    const cachedResult = clientCalcCache.get(basketKey);
    if (cachedResult && !force) {
      setCustomSeries(cachedResult.series);
      setStockUniverse(cachedResult.stockUniverse);
    }

    // Abort previous request to prevent race conditions
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    if (!cachedResult) {
      setLoading(true);
    }
    setError(null);
    setSyncing(false);
    setSyncProgress(0);
    setSyncWarnings([]);

    try {
      // 全銘柄の同期を走らせる（セッションおよびlocalStorage内で同期済みの銘柄は重複同期を完全スキップして無料枠クォータを節約）
      if (selectedIndex.basket.length > 0) {
        const allTickers = selectedIndex.basket.map((b) => b.ticker);
        const localSyncCache = getLocalSyncCache();
        const nowMs = Date.now();

        const tickersToSync = force
          ? allTickers
          : allTickers.filter((t) => {
              if (syncedTickersRef.current.has(t)) return false;
              const lastSynced = localSyncCache[t];
              if (lastSynced && nowMs - lastSynced < SYNC_CACHE_TTL) {
                syncedTickersRef.current.add(t);
                return false;
              }
              return true;
            });

        if (tickersToSync.length > 0) {
          setSyncing(true);
          const BATCH_SIZE = 30;
          const warnings: string[] = [];
          const newlySynced: string[] = [];

          for (let i = 0; i < tickersToSync.length; i += BATCH_SIZE) {
            if (controller.signal.aborted) return;

            const chunk = tickersToSync.slice(i, i + BATCH_SIZE);
            try {
              const syncRes = await fetch(`${API_BASE}/sync-prices`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tickers: chunk, force }),
                signal: controller.signal,
              });
              if (controller.signal.aborted) return;

              if (!syncRes.ok) {
                warnings.push(`同期バッチ ${Math.floor(i / BATCH_SIZE) + 1} が失敗しました`);
              } else {
                const syncData = await syncRes.json();
                if (syncData.results) {
                  for (const r of syncData.results) {
                    if (r.status === "synced" || r.status === "cached") {
                      syncedTickersRef.current.add(r.ticker);
                      newlySynced.push(r.ticker);
                    }
                  }
                  const failed = syncData.results
                    .filter((r: { status: string }) => r.status === "failed")
                    .map((r: { ticker: string }) => r.ticker);
                  if (failed.length > 0) {
                    warnings.push(`一部銘柄の取得に失敗: ${failed.join(", ")}`);
                  }
                }
              }
            } catch (err) {
              if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
              warnings.push(`同期バッチ ${Math.floor(i / BATCH_SIZE) + 1} で通信エラー`);
            }

            if (controller.signal.aborted) return;
            setSyncProgress(Math.round(((i + chunk.length) / tickersToSync.length) * 100));
          }

          if (newlySynced.length > 0) {
            updateLocalSyncCache(newlySynced);
          }

          if (controller.signal.aborted) return;
          setSyncing(false);
          if (warnings.length > 0) {
            setSyncWarnings(warnings);
          }
        }
      }

      if (controller.signal.aborted) return;

      const res = await fetch(`${API_BASE}/calculate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(session),
        },
        body: JSON.stringify({
          basket: selectedIndex.basket,
          baseValue: selectedIndex.baseValue,
        }),
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "指数の計算に失敗しました");
      }
      const data = await res.json();
      if (controller.signal.aborted) return;
      setCustomSeries(data.series);
      const universe = Array.isArray(data.stockUniverse) ? data.stockUniverse : [];
      setStockUniverse(universe);
      clientCalcCache.set(basketKey, {
        series: data.series,
        stockUniverse: universe,
        timestamp: Date.now(),
      });
    } catch (err: unknown) {
      if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
      const message = err instanceof Error ? err.message : "計算に失敗しました";
      setError(message);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setSyncing(false);
      }
    }
  }, [selectedIndex, session]);

  const stockDetails: StockDetail[] = useMemo(() => {
    if (!selectedIndex || selectedIndex.basket.length === 0) return [];
    return calculateStockDetails(
      selectedIndex.basket,
      stockUniverse,
      selectedIndex.baseValue,
      customSeries,
    );
  }, [selectedIndex, stockUniverse, customSeries]);

  useEffect(() => {
    calculate();
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [calculate]);

  return {
    customSeries,
    stockUniverse,
    stockDetails,
    loading,
    error,
    syncing,
    syncProgress,
    syncWarnings,
    recalculate: calculate,
  };
}
