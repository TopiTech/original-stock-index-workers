import { useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useIndices } from "./hooks/useIndices";
import { useNikkei } from "./hooks/useNikkei";
import { useCalculation } from "./hooks/useCalculation";
import { Header } from "./components/Header";
import { StatsGrid } from "./components/StatsGrid";
import { IndexSelector } from "./components/IndexSelector";
import { PerformanceChart } from "./components/PerformanceChart";
import { ErrorFallback } from "./components/ErrorFallback";
import { LoadingScreen } from "./components/LoadingScreen";
import type { CustomIndex } from "./data/indices";
import type { PricePoint } from "./types";

export default function App() {
  const { indices, selectedIndex, selectIndex, loading: loadingIndices, error: indicesError } = useIndices();
  const { nikkeiData, error: nikkeiError } = useNikkei();
  const { customSeries, loading: loadingCalc, syncing, syncProgress, error: calcError } = useCalculation(selectedIndex);

  const error = indicesError || nikkeiError || calcError;

  const handleSelectIndex = useCallback((index: CustomIndex) => {
    selectIndex(index);
  }, [selectIndex]);

  const chartData = useMemo(() => {
    if (!nikkeiData || nikkeiData.series.length === 0 || customSeries.length === 0 || !selectedIndex) return [];

    const nikkeiMap = new Map(nikkeiData.series.map((p: PricePoint) => [p.date, p.close]));
    const firstNikkei = nikkeiData.series[0]?.close ?? selectedIndex.baseValue;

    return customSeries.map((point: PricePoint, index: number) => {
      const nikkeiClose = nikkeiMap.get(point.date);
      const fallbackClose = nikkeiData.series[index]?.close ?? firstNikkei;
      const nikkeiPoint = nikkeiClose ?? fallbackClose;

      return {
        date: point.date,
        close: point.close,
        value: point.value ?? 0,
        nikkei: Number((selectedIndex.baseValue * (nikkeiPoint / firstNikkei)).toFixed(2))
      };
    });
  }, [nikkeiData, customSeries, selectedIndex]);

  if (error) {
    return <ErrorFallback error={error} onRetry={() => window.location.reload()} />;
  }

  if (loadingIndices) {
    return <LoadingScreen />;
  }

  return (
    <div className="app">
      <Header />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <StatsGrid
          nikkeiData={nikkeiData}
          selectedIndexName={selectedIndex?.name || "---"}
          latestCustomValue={customSeries[customSeries.length - 1]?.value ?? selectedIndex?.baseValue ?? 0}
          loading={loadingCalc}
        />
      </motion.div>

      <div className="layout">
        <aside>
          <AnimatePresence mode="wait">
            <motion.div
              key="sidebar"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              <IndexSelector
                indices={indices}
                selectedIndex={selectedIndex}
                onSelect={handleSelectIndex}
              />
            </motion.div>
          </AnimatePresence>
        </aside>

        <main className="grid">
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedIndex?.id || "chart"}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <PerformanceChart
                data={chartData}
                loading={loadingCalc}
                syncing={syncing}
                syncProgress={syncProgress}
                latestValue={customSeries[customSeries.length - 1]?.value}
                baseValue={selectedIndex?.baseValue}
              />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
