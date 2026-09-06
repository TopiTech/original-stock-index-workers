import { useState, useCallback, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Menu, X } from "lucide-react";
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

const MOBILE_LAYOUT_QUERY = "(max-width: 1080px)";

function getInitialMobileLayout() {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
}

export default function App() {
  const [isMobileLayout, setIsMobileLayout] = useState(getInitialMobileLayout);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => !getInitialMobileLayout());
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

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_LAYOUT_QUERY);
    const syncLayout = () => {
      setIsMobileLayout(mediaQuery.matches);
      setIsSidebarOpen(!mediaQuery.matches);
    };

    syncLayout();
    mediaQuery.addEventListener("change", syncLayout);
    return () => mediaQuery.removeEventListener("change", syncLayout);
  }, []);

  useEffect(() => {
    if (!isMobileLayout || !isSidebarOpen) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsSidebarOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isMobileLayout, isSidebarOpen]);

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
      if (isMobileLayout) setIsSidebarOpen(false);
    },
    [isMobileLayout, selectIndex],
  );

  const handleOpenBuilder = useCallback(() => {
    setIsSidebarOpen(false);
    setIsBuilderOpen(true);
  }, []);

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

      <div className="mobile-dashboard-toolbar" aria-label="ダッシュボード操作">
        <div className="mobile-current-index">
          <span className="mono tiny uppercase muted">CURRENT INDEX</span>
          <strong title={selectedIndex?.name}>
            {selectedIndex?.name || "指数を選択してください"}
          </strong>
        </div>
        <button
          type="button"
          className="btn btn-default mobile-sidebar-toggle"
          onClick={() => setIsSidebarOpen(true)}
          aria-controls="index-sidebar"
          aria-expanded={isMobileLayout && isSidebarOpen}
        >
          <Menu size={16} />
          <span>指数を選択</span>
          <ChevronRight size={15} aria-hidden="true" />
        </button>
      </div>

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
        <AnimatePresence>
          {isMobileLayout && isSidebarOpen && (
            <motion.button
              type="button"
              className="sidebar-backdrop"
              aria-label="指数メニューを閉じる"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        <aside
          id="index-sidebar"
          className={`index-sidebar ${isSidebarOpen ? "is-open" : ""}`}
          aria-label="指数セレクター"
          aria-hidden={isMobileLayout && !isSidebarOpen}
        >
          <div className="sidebar-drawer-header">
            <div className="row" style={{ gap: 8 }}>
              <Menu size={16} style={{ color: "var(--neon-cyan)" }} />
              <span className="mono tiny uppercase">指数メニュー</span>
            </div>
            <button
              type="button"
              className="sidebar-close-button"
              onClick={() => setIsSidebarOpen(false)}
              aria-label="指数メニューを閉じる"
            >
              <X size={18} />
            </button>
          </div>

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
                onCreateIndex={handleOpenBuilder}
                onDeleteIndex={deleteCustomIndex}
                isOwner={isOwner}
              />
            </motion.div>
          </AnimatePresence>
        </aside>

        <main className="dashboard-main grid" style={{ gap: 20 }}>
          {/* Benchmark Selector Bar */}
          <div
            className="benchmark-toolbar row space-between flex-wrap"
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
                    return addStockToIndex(selectedIndex.id, stock);
                  }}
                  onRemoveStock={async (ticker) => {
                    if (!selectedIndex) return { ok: false, error: "指数が選択されていません" };
                    return removeStockFromIndex(selectedIndex.id, ticker);
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
