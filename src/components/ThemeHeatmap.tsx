import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, Tag } from "./ui";
import { LayoutGrid, TrendingUp, TrendingDown, Layers, Grid } from "lucide-react";
import type { StockDetail } from "../types";

interface ThemeHeatmapProps {
  stockDetails: StockDetail[];
  selectedTheme: string | null;
  onSelectTheme: (theme: string | null) => void;
}

type HeatmapViewMode = "grid" | "themeGroups";

export function ThemeHeatmap({ stockDetails, selectedTheme, onSelectTheme }: ThemeHeatmapProps) {
  const [viewMode, setViewMode] = useState<HeatmapViewMode>("grid");
  const [hoveredStock, setHoveredStock] = useState<{
    stock: StockDetail;
    x: number;
    y: number;
  } | null>(null);

  const filteredStocks = useMemo(() => {
    return [...stockDetails].sort((a, b) => b.weight - a.weight);
  }, [stockDetails]);

  // Group stocks by theme for the "By Theme" view
  const stocksByTheme = useMemo(() => {
    const map = new Map<string, StockDetail[]>();
    for (const stock of filteredStocks) {
      const theme = stock.theme || "その他";
      if (!map.has(theme)) map.set(theme, []);
      map.get(theme)!.push(stock);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const weightA = a[1].reduce((sum, s) => sum + s.weight, 0);
      const weightB = b[1].reduce((sum, s) => sum + s.weight, 0);
      return weightB - weightA;
    });
  }, [filteredStocks]);

  const isManyStocks = filteredStocks.length > 28;

  if (filteredStocks.length === 0) return null;

  const getBackgroundColor = (pct: number) => {
    if (pct >= 4) return "rgba(16, 185, 129, 0.42)";
    if (pct >= 2) return "rgba(16, 185, 129, 0.28)";
    if (pct >= 0.5) return "rgba(16, 185, 129, 0.18)";
    if (pct > 0) return "rgba(16, 185, 129, 0.10)";
    if (pct <= -4) return "rgba(244, 63, 94, 0.42)";
    if (pct <= -2) return "rgba(244, 63, 94, 0.28)";
    if (pct <= -0.5) return "rgba(244, 63, 94, 0.18)";
    if (pct < 0) return "rgba(244, 63, 94, 0.10)";
    return "rgba(255, 255, 255, 0.03)";
  };

  const getBorderColor = (pct: number) => {
    if (pct >= 2) return "rgba(16, 185, 129, 0.55)";
    if (pct > 0) return "rgba(16, 185, 129, 0.3)";
    if (pct <= -2) return "rgba(244, 63, 94, 0.55)";
    if (pct < 0) return "rgba(244, 63, 94, 0.3)";
    return "rgba(255, 255, 255, 0.08)";
  };

  const handleMouseMove = (e: React.MouseEvent, stock: StockDetail) => {
    // Keep tooltip positioned near cursor but within viewport bounds
    const x = Math.min(e.clientX + 14, window.innerWidth - 240);
    const y = Math.min(e.clientY + 14, window.innerHeight - 160);
    setHoveredStock({ stock, x, y });
  };

  const renderStockTile = (stock: StockDetail, compact = false) => {
    const isSelectedTheme = selectedTheme ? stock.theme === selectedTheme : true;
    const isUp = stock.changePct > 0;
    const isDown = stock.changePct < 0;

    return (
      <div
        key={stock.ticker}
        className="heatmap-tile"
        role="button"
        tabIndex={0}
        aria-pressed={selectedTheme === stock.theme}
        aria-label={`${stock.name} (${stock.ticker}) 騰落率: ${stock.changePct >= 0 ? "+" : ""}${stock.changePct.toFixed(1)}%`}
        onClick={() => onSelectTheme(selectedTheme === stock.theme ? null : stock.theme)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelectTheme(selectedTheme === stock.theme ? null : stock.theme);
          }
        }}
        onMouseEnter={(e) => handleMouseMove(e, stock)}
        onMouseMove={(e) => handleMouseMove(e, stock)}
        onMouseLeave={() => setHoveredStock(null)}
        style={{
          background: getBackgroundColor(stock.changePct),
          border: `1px solid ${getBorderColor(stock.changePct)}`,
          opacity: isSelectedTheme ? 1 : 0.28,
        }}
      >
        <div className="row space-between" style={{ gap: 2 }}>
          <span className="heatmap-tile-code">{stock.ticker}</span>
          <span className="heatmap-tile-weight">{stock.weight.toFixed(1)}%</span>
        </div>

        {!compact && !isManyStocks && (
          <div className="heatmap-tile-name">{stock.name}</div>
        )}

        <div className="row space-between" style={{ marginTop: "auto" }}>
          {!compact && !isManyStocks && (
            <span className="mono tiny" style={{ fontSize: 10, opacity: 0.85 }}>
              ¥{stock.currentPrice > 0 ? stock.currentPrice.toLocaleString() : "---"}
            </span>
          )}
          <span
            className="heatmap-tile-change"
            style={{
              color: isUp ? "var(--neon-green)" : isDown ? "var(--neon-red)" : "var(--text-secondary)",
              marginLeft: compact || isManyStocks ? "auto" : undefined,
            }}
          >
            {isUp && <TrendingUp size={10} />}
            {isDown && <TrendingDown size={10} />}
            {stock.changePct >= 0 ? "+" : ""}
            {stock.changePct.toFixed(1)}%
          </span>
        </div>
      </div>
    );
  };

  return (
    <Card className="section">
      <div className="row space-between flex-wrap" style={{ marginBottom: 14, gap: 10 }}>
        <div className="row" style={{ gap: 8 }}>
          <LayoutGrid size={16} style={{ color: "var(--neon-cyan)" }} />
          <h2 style={{ fontSize: 15, margin: 0 }}>構成銘柄ヒートマップ（騰落率 × 構成比）</h2>
          <Tag variant="cyan" className="mono tiny">
            {filteredStocks.length} 銘柄
          </Tag>
        </div>

        <div className="row" style={{ gap: 8 }}>
          {/* View Mode Switcher */}
          <div className="btn-group" role="tablist" aria-label="ヒートマップ表示切替">
            <button
              type="button"
              className={`btn-group-item ${viewMode === "grid" ? "active" : ""}`}
              onClick={() => setViewMode("grid")}
              role="tab"
              aria-selected={viewMode === "grid"}
              title="全銘柄グリッド表示"
            >
              <Grid size={12} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 4 }} />
              全銘柄
            </button>
            <button
              type="button"
              className={`btn-group-item ${viewMode === "themeGroups" ? "active" : ""}`}
              onClick={() => setViewMode("themeGroups")}
              role="tab"
              aria-selected={viewMode === "themeGroups"}
              title="テーマ別グループ表示"
            >
              <Layers size={12} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 4 }} />
              テーマ別
            </button>
          </div>

          {selectedTheme && (
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => onSelectTheme(null)}
              style={{ fontSize: 10, padding: "2px 6px" }}
            >
              テーマ解除 ({selectedTheme})
            </button>
          )}
        </div>
      </div>

      <div className="heatmap-legend" aria-label="ヒートマップの凡例">
        <span className="heatmap-legend-item">
          <span className="heatmap-swatch heatmap-swatch-positive" aria-hidden="true" />上昇
        </span>
        <span className="heatmap-legend-item">
          <span className="heatmap-swatch heatmap-swatch-negative" aria-hidden="true" />下落
        </span>
        <span className="heatmap-legend-note">※タイルホバーで銘柄詳細・寄与度を表示</span>
      </div>

      {viewMode === "grid" ? (
        <div className={`theme-heatmap-grid ${isManyStocks ? "density-compact" : ""}`}>
          {filteredStocks.map((stock) => renderStockTile(stock, isManyStocks))}
        </div>
      ) : (
        <div className="heatmap-groups-container">
          {stocksByTheme.map(([theme, stocks]) => {
            const themeWeight = stocks.reduce((sum, s) => sum + s.weight, 0);
            const isCurrentTheme = selectedTheme === theme;

            return (
              <div
                key={theme}
                className="heatmap-group-section"
                style={{
                  borderColor: isCurrentTheme ? "var(--border-cyan)" : undefined,
                  background: isCurrentTheme ? "rgba(6, 182, 212, 0.04)" : undefined,
                }}
              >
                <div className="heatmap-group-header">
                  <div className="heatmap-group-title">
                    <span>{theme}</span>
                    <span className="tag tag-theme" style={{ fontSize: 9, padding: "1px 5px" }}>
                      {stocks.length}銘柄 ({themeWeight.toFixed(1)}%)
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => onSelectTheme(isCurrentTheme ? null : theme)}
                    style={{ fontSize: 10, padding: "2px 8px" }}
                  >
                    {isCurrentTheme ? "選択中" : "絞り込み"}
                  </button>
                </div>
                <div className="theme-heatmap-grid density-compact">
                  {stocks.map((stock) => renderStockTile(stock, true))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Precision Tooltip */}
      <AnimatePresence>
        {hoveredStock && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="heatmap-tooltip-portal"
            style={{
              top: hoveredStock.y,
              left: hoveredStock.x,
            }}
          >
            <div className="row space-between" style={{ marginBottom: 4, gap: 8 }}>
              <strong style={{ color: "var(--text-heading)", fontSize: 13 }}>
                {hoveredStock.stock.name}
              </strong>
              <span className="mono bold" style={{ color: "var(--neon-cyan)", fontSize: 12 }}>
                {hoveredStock.stock.ticker}
              </span>
            </div>

            <div style={{ marginBottom: 6 }}>
              <span className="tag tag-theme" style={{ fontSize: 9 }}>
                {hoveredStock.stock.theme || "その他"}
              </span>
            </div>

            <div className="tooltip-row">
              <span className="muted" style={{ fontSize: 10 }}>株価</span>
              <strong style={{ fontSize: 12 }}>
                ¥{hoveredStock.stock.currentPrice > 0 ? hoveredStock.stock.currentPrice.toLocaleString() : "---"}
              </strong>
            </div>

            <div className="tooltip-row">
              <span className="muted" style={{ fontSize: 10 }}>前日比</span>
              <strong
                style={{
                  fontSize: 12,
                  color:
                    hoveredStock.stock.changePct > 0
                      ? "var(--neon-green)"
                      : hoveredStock.stock.changePct < 0
                        ? "var(--neon-red)"
                        : "inherit",
                }}
              >
                {hoveredStock.stock.changePct >= 0 ? "+" : ""}
                {hoveredStock.stock.changePct.toFixed(2)}%
                {hoveredStock.stock.change !== 0 && (
                  <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.8 }}>
                    ({hoveredStock.stock.change >= 0 ? "+" : ""}¥{hoveredStock.stock.change.toLocaleString()})
                  </span>
                )}
              </strong>
            </div>

            <div className="tooltip-row">
              <span className="muted" style={{ fontSize: 10 }}>構成比率</span>
              <span style={{ fontSize: 11 }}>{hoveredStock.stock.weight.toFixed(2)}%</span>
            </div>

            <div className="tooltip-row">
              <span className="muted" style={{ fontSize: 10 }}>指数寄与度</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color:
                    hoveredStock.stock.contributionPt > 0
                      ? "var(--neon-green)"
                      : hoveredStock.stock.contributionPt < 0
                        ? "var(--neon-red)"
                        : "inherit",
                }}
              >
                {hoveredStock.stock.contributionPt >= 0 ? "+" : ""}
                {hoveredStock.stock.contributionPt.toFixed(2)} pt
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
