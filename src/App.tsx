import { useState, useCallback, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useIndices } from "./hooks/useIndices";
import { useBenchmark } from "./hooks/useBenchmark";
import { useCalculation } from "./hooks/useCalculation";
import { Header } from "./components/Header";
import { StatsGrid } from "./components/StatsGrid";
import { BenchmarkSelector } from "./components/BenchmarkSelector";
import { IndexSelector } from "./components/IndexSelector";
import { PerformanceChart } from "./components/PerformanceChart";
import { ThemeHeatmap } from "./components/ThemeHeatmap";
import { ThemeBreakdown } from "./components/ThemeBreakdown";
import { RiskMetricsCard } from "./components/RiskMetricsCard";
import { ConstituentsTable } from "./components/ConstituentsTable";
import { IndexBuilderModal } from "./components/IndexBuilderModal";
import { AdminDashboard } from "./components/AdminDashboard";
import { ErrorFallback } from "./components/ErrorFallback";
import { LoadingScreen } from "./components/LoadingScreen";
import { buildChartData } from "./lib/chartData";
import type { CustomIndex } from "./data/indices";

export default function App() {
  const [currentView, setCurrentView] = useState<"dashboard" | "admin">(() => {
    if (typeof window !== "undefined") {
      const path = window.location.pathname;
      const search = new URLSearchParams(window.location.search);
      return path === "/admin" || search.get("page") === "admin" ? "admin" : "dashboard";
    }
    return "dashboard";
  });

  const navigateTo = useCallback((view: "dashboard" | "admin") => {
    setCurrentView(view);
    if (view === "admin") {
      window.history.pushState({}, "", "/admin");
    } else {
      window.history.pushState({}, "", "/");
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname;
      const search = new URLSearchParams(window.location.search);
      setCurrentView(path === "/admin" || search.get("page") === "admin" ? "admin" : "dashboard");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const {
    indices,
    selectedIndex,
    selectIndex,
    loading: loadingIndices,
    error: indicesError,
    saveCustomIndex,
    deleteCustomIndex,
    addStockToIndex,
    removeStockFromIndex,
    refreshIndices,
    isOwner,
  } = useIndices();

  const {
    selectedBenchmark,
    setSelectedBenchmark,
    benchmarkData,
    loading: loadingBenchmark,
    error: benchmarkError,
    availableBenchmarks,
    refetch: refetchBenchmark,
  } = useBenchmark("^N225");

  const {
    customSeries,
    stockDetails,
    loading: loadingCalc,
    syncing,
    syncProgress,
    syncWarnings,
    error: calcError,
    recalculate,
  } = useCalculation(selectedIndex);

  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);

  const handleSelectIndex = useCallback(
    (index: CustomIndex) => {
      setSelectedTheme(null);
      selectIndex(index);
    },
    [selectIndex],
  );

  const handleRetry = useCallback(() => {
    if (benchmarkError) refetchBenchmark();
    if (calcError || !customSeries.length) recalculate(true);
  }, [benchmarkError, calcError, customSeries.length, refetchBenchmark, recalculate]);

  const unifiedError = calcError || benchmarkError;

  const currentBenchmarkOption = useMemo(() => {
    return (
      availableBenchmarks.find((b) => b.symbol === selectedBenchmark) || availableBenchmarks[0]
    );
  }, [availableBenchmarks, selectedBenchmark]);

  const chartData = useMemo(() => {
    if (
      !benchmarkData ||
      benchmarkData.series.length === 0 ||
      customSeries.length === 0 ||
      !selectedIndex
    ) {
      return [];
    }
    return buildChartData(benchmarkData.series, customSeries, selectedIndex.baseValue);
  }, [benchmarkData, customSeries, selectedIndex]);

  const latestBenchmarkNormalized = useMemo(() => {
    if (chartData.length === 0) return undefined;
    return chartData[chartData.length - 1]?.nikkei;
  }, [chartData]);

  if (indicesError) {
    return <ErrorFallback error={indicesError} onRetry={() => window.location.reload()} />;
  }

  if (loadingIndices) {
    return <LoadingScreen />;
  }

  if (currentView === "admin") {
    return (
      <AdminDashboard
        indices={indices}
        onBackToApp={() => navigateTo("dashboard")}
        onRefreshIndices={refreshIndices}
        saveCustomIndex={saveCustomIndex}
        deleteCustomIndex={deleteCustomIndex}
      />
    );
  }

  return (
    <div className="app">
      <Header onNavigateToAdmin={() => navigateTo("admin")} />

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <StatsGrid
          benchmarkData={benchmarkData}
          benchmarkLoading={loadingBenchmark}
          selectedIndex={selectedIndex}
          latestCustomValue={
            customSeries[customSeries.length - 1]?.value ?? selectedIndex?.baseValue ?? 0
          }
          loading={loadingCalc}
          benchmarkNormalizedValue={latestBenchmarkNormalized}
          benchmarkLabel={currentBenchmarkOption.shortLabel}
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
                onCreateIndex={() => setIsBuilderOpen(true)}
                onDeleteIndex={deleteCustomIndex}
                isOwner={isOwner}
              />
            </motion.div>
          </AnimatePresence>
        </aside>

        <main className="grid" style={{ gap: 20 }}>
          {/* Benchmark Selector Bar */}
          <div
            className="row space-between flex-wrap"
            style={{
              padding: "10px 16px",
              background: "rgba(13, 19, 38, 0.6)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 10,
              gap: 12,
            }}
          >
            <BenchmarkSelector
              benchmarks={availableBenchmarks}
              selectedBenchmark={selectedBenchmark}
              onSelectBenchmark={setSelectedBenchmark}
              loading={loadingBenchmark}
            />
          </div>

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
                loading={loadingCalc || loadingBenchmark}
                syncing={syncing}
                syncProgress={syncProgress}
                syncWarnings={syncWarnings}
                latestValue={customSeries[customSeries.length - 1]?.value}
                baseValue={selectedIndex?.baseValue}
                benchmarkLabel={currentBenchmarkOption.shortLabel}
                error={unifiedError}
                onRetry={handleRetry}
              />

              {/* Quantitative Risk Metrics Card */}
              {benchmarkData && (
                <RiskMetricsCard
                  customSeries={customSeries}
                  benchmarkSeries={benchmarkData.series}
                  benchmarkName={currentBenchmarkOption.shortLabel}
                  loading={loadingCalc || loadingBenchmark}
                />
              )}

              {/* Stock Heatmap (TreeMap style) */}
              {stockDetails.length > 0 && (
                <ThemeHeatmap
                  stockDetails={stockDetails}
                  selectedTheme={selectedTheme}
                  onSelectTheme={setSelectedTheme}
                />
              )}

              {/* Theme Breakdown Visualizer */}
              {selectedIndex && selectedIndex.basket.length > 0 && (
                <ThemeBreakdown
                  basket={selectedIndex.basket}
                  selectedTheme={selectedTheme}
                  onSelectTheme={setSelectedTheme}
                />
              )}

              {/* Constituents Full Table with Sparklines & Contribution */}
              {selectedIndex && selectedIndex.basket.length > 0 && (
                <ConstituentsTable
                  basket={selectedIndex.basket}
                  stockDetails={stockDetails}
                  selectedTheme={selectedTheme}
                  indexName={selectedIndex.name}
                  indexId={selectedIndex.id}
                  onAddStock={async (stock) => {
                    if (!selectedIndex) return { ok: false, error: "指数が選択されていません" };
                    const res = await addStockToIndex(selectedIndex.id, stock);
                    if (res.ok) {
                      recalculate(true);
                    }
                    return res;
                  }}
                  onRemoveStock={async (ticker) => {
                    if (!selectedIndex) return { ok: false, error: "指数が選択されていません" };
                    const res = await removeStockFromIndex(selectedIndex.id, ticker);
                    if (res.ok) {
                      recalculate(true);
                    }
                    return res;
                  }}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Index Builder Modal */}
      <IndexBuilderModal
        isOpen={isBuilderOpen}
        onClose={() => setIsBuilderOpen(false)}
        onSave={saveCustomIndex}
      />
    </div>
  );
}
