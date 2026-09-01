import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useIndices } from "./hooks/useIndices";
import { useNikkei } from "./hooks/useNikkei";
import { useCalculation } from "./hooks/useCalculation";
import { Header } from "./components/Header";
import { StatsGrid } from "./components/StatsGrid";
import { IndexSelector } from "./components/IndexSelector";
import { PerformanceChart } from "./components/PerformanceChart";
import { ThemeBreakdown } from "./components/ThemeBreakdown";
import { ConstituentsTable } from "./components/ConstituentsTable";
import { ErrorFallback } from "./components/ErrorFallback";
import { LoadingScreen } from "./components/LoadingScreen";
import { buildChartData } from "./lib/chartData";
import type { CustomIndex } from "./data/indices";

export default function App() {
  const { indices, selectedIndex, selectIndex, loading: loadingIndices, error: indicesError } = useIndices();
  const { nikkeiData, loading: loadingNikkei } = useNikkei();
  const {
    customSeries,
    loading: loadingCalc,
    syncing,
    syncProgress,
    syncWarnings,
    error: calcError,
    recalculate,
  } = useCalculation(selectedIndex);

  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);

  const handleSelectIndex = useCallback((index: CustomIndex) => {
    setSelectedTheme(null);
    selectIndex(index);
  }, [selectIndex]);

  const chartData = useMemo(() => {
    if (!nikkeiData || nikkeiData.series.length === 0 || customSeries.length === 0 || !selectedIndex) return [];
    return buildChartData(nikkeiData.series, customSeries, selectedIndex.baseValue);
  }, [nikkeiData, customSeries, selectedIndex]);

  const latestNikkeiNormalized = useMemo(() => {
    if (chartData.length === 0) return undefined;
    return chartData[chartData.length - 1]?.nikkei;
  }, [chartData]);

  if (indicesError) {
    return <ErrorFallback error={indicesError} onRetry={() => window.location.reload()} />;
  }

  if (loadingIndices) {
    return <LoadingScreen />;
  }

  return (
    <div className="app">
      <Header />

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <StatsGrid
          nikkeiData={nikkeiData}
          nikkeiLoading={loadingNikkei}
          selectedIndex={selectedIndex}
          latestCustomValue={customSeries[customSeries.length - 1]?.value ?? selectedIndex?.baseValue ?? 0}
          loading={loadingCalc}
          nikkeiNormalizedValue={latestNikkeiNormalized}
        />
      </motion.div>

      <div className="layout">
        <aside>
          <AnimatePresence mode="wait">
            <motion.div
              key="sidebar"
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.15 }}
            >
              <IndexSelector
                indices={indices}
                selectedIndex={selectedIndex}
                onSelect={handleSelectIndex}
              />
            </motion.div>
          </AnimatePresence>
        </aside>

        <main className="grid" style={{ gap: 20 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedIndex?.id || "chart"}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="grid"
              style={{ gap: 20 }}
            >
              {/* Main Performance Chart */}
              <PerformanceChart
                data={chartData}
                loading={loadingCalc}
                syncing={syncing}
                syncProgress={syncProgress}
                syncWarnings={syncWarnings}
                latestValue={customSeries[customSeries.length - 1]?.value}
                baseValue={selectedIndex?.baseValue}
                error={calcError}
                onRetry={recalculate}
              />

              {/* Theme Breakdown Visualizer */}
              {selectedIndex && selectedIndex.basket.length > 0 && (
                <ThemeBreakdown
                  basket={selectedIndex.basket}
                  selectedTheme={selectedTheme}
                  onSelectTheme={setSelectedTheme}
                />
              )}

              {/* Constituents Full Table */}
              {selectedIndex && selectedIndex.basket.length > 0 && (
                <ConstituentsTable
                  basket={selectedIndex.basket}
                  selectedTheme={selectedTheme}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

