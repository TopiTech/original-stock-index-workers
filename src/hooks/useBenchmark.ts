import { useState, useEffect } from "react";
import type { BenchmarkOption, BenchmarkSymbol, Snapshot } from "../types";

const API_BASE = "/api";

export const AVAILABLE_BENCHMARKS: BenchmarkOption[] = [
  { symbol: "^N225", label: "日経225", shortLabel: "日経225", currency: "円" },
  { symbol: "^TOPX", label: "TOPIX (東証株価指数)", shortLabel: "TOPIX", currency: "pt" },
  { symbol: "^TSI250", label: "東証グロース250", shortLabel: "グロース250", currency: "pt" },
  { symbol: "^GSPC", label: "S&P 500 (米国)", shortLabel: "S&P500", currency: "USD" },
  { symbol: "USDJPY=X", label: "米ドル/円 (為替)", shortLabel: "USD/JPY", currency: "円" },
];

export type BenchmarkData = {
  snapshot: Snapshot;
  series: { date: string; close: number }[];
};

export function useBenchmark(initialSymbol: BenchmarkSymbol = "^N225") {
  const [selectedBenchmark, setSelectedBenchmark] = useState<BenchmarkSymbol>(initialSymbol);
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/snapshot?symbol=${encodeURIComponent(selectedBenchmark)}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`${selectedBenchmark} データの取得に失敗しました`);
        return res.json();
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
  }, [selectedBenchmark]);

  return {
    selectedBenchmark,
    setSelectedBenchmark,
    benchmarkData,
    loading,
    error,
    availableBenchmarks: AVAILABLE_BENCHMARKS,
  };
}
