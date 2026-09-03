import { useState, useEffect, useCallback } from "react";
import type { BenchmarkOption, BenchmarkSymbol, Snapshot } from "../types";

const API_BASE = "/api";
const BENCHMARK_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CachedBenchmark {
  data: BenchmarkData;
  timestamp: number;
  etag?: string | null;
}
const benchmarkSessionCache = new Map<string, CachedBenchmark>();

export const AVAILABLE_BENCHMARKS: BenchmarkOption[] = [
  { symbol: "^N225", label: "日経225", shortLabel: "日経225", currency: "円" },
  { symbol: "^GSPC", label: "S&P 500 (米国)", shortLabel: "S&P500", currency: "USD" },
  { symbol: "USDJPY=X", label: "米ドル/円 (為替)", shortLabel: "USD/JPY", currency: "円" },
];

export type BenchmarkData = {
  snapshot: Snapshot;
  series: { date: string; close: number }[];
};

export function useBenchmark(initialSymbol: BenchmarkSymbol = "^N225") {
  const [selectedBenchmark, setSelectedBenchmark] = useState<BenchmarkSymbol>(initialSymbol);
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkData | null>(() => {
    const cached = benchmarkSessionCache.get(initialSymbol);
    return cached && Date.now() - cached.timestamp < BENCHMARK_CACHE_TTL ? cached.data : null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    const cached = benchmarkSessionCache.get(initialSymbol);
    return !(cached && Date.now() - cached.timestamp < BENCHMARK_CACHE_TTL);
  });
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const refetch = useCallback(() => {
    benchmarkSessionCache.delete(selectedBenchmark);
    setRetryCount((c) => c + 1);
  }, [selectedBenchmark]);

  useEffect(() => {
    const cached = benchmarkSessionCache.get(selectedBenchmark);
    const now = Date.now();
    if (cached && now - cached.timestamp < BENCHMARK_CACHE_TTL && retryCount === 0) {
      setBenchmarkData(cached.data);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    if (!cached) {
      setLoading(true);
    }
    setError(null);

    const headers: Record<string, string> = {};
    if (cached?.etag) {
      headers["If-None-Match"] = cached.etag;
    }

    fetch(`${API_BASE}/snapshot?symbol=${encodeURIComponent(selectedBenchmark)}`, {
      signal: controller.signal,
      headers,
    })
      .then(async (res) => {
        if (res.status === 304 && cached) {
          cached.timestamp = Date.now();
          return cached.data;
        }
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `${selectedBenchmark} データの取得に失敗しました`);
        }
        const etag = res.headers.get("etag");
        const data: BenchmarkData = await res.json();
        benchmarkSessionCache.set(selectedBenchmark, {
          data,
          timestamp: Date.now(),
          etag,
        });
        return data;
      })
      .then((data: BenchmarkData) => {
        if (!controller.signal.aborted) {
          setBenchmarkData(data);
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
  }, [selectedBenchmark, retryCount]);

  return {
    selectedBenchmark,
    setSelectedBenchmark,
    benchmarkData,
    loading,
    error,
    availableBenchmarks: AVAILABLE_BENCHMARKS,
    refetch,
  };
}
