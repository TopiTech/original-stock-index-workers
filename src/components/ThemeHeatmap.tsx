import { useMemo } from "react";
import { motion } from "framer-motion";
import { Card, Tag } from "./ui";
import { LayoutGrid, TrendingUp, TrendingDown } from "lucide-react";
import type { StockDetail } from "../types";

interface ThemeHeatmapProps {
  stockDetails: StockDetail[];
  selectedTheme: string | null;
  onSelectTheme: (theme: string | null) => void;
}

export function ThemeHeatmap({ stockDetails, selectedTheme, onSelectTheme }: ThemeHeatmapProps) {
  const filteredStocks = useMemo(() => {
    return [...stockDetails].sort((a, b) => b.weight - a.weight);
  }, [stockDetails]);

  if (filteredStocks.length === 0) return null;

  const getBackgroundColor = (pct: number) => {
    if (pct > 4) return "rgba(0, 230, 118, 0.4)";
    if (pct > 2) return "rgba(0, 230, 118, 0.28)";
    if (pct > 0.5) return "rgba(0, 230, 118, 0.18)";
    if (pct > 0) return "rgba(0, 230, 118, 0.1)";
    if (pct < -4) return "rgba(255, 51, 102, 0.4)";
    if (pct < -2) return "rgba(255, 51, 102, 0.28)";
    if (pct < -0.5) return "rgba(255, 51, 102, 0.18)";
    if (pct < 0) return "rgba(255, 51, 102, 0.1)";
    return "var(--surface-neutral)";
  };

  const getBorderColor = (pct: number) => {
    if (pct > 0) return "rgba(0, 230, 118, 0.4)";
    if (pct < 0) return "rgba(255, 51, 102, 0.4)";
    return "var(--border-neutral)";
  };

  return (
    <Card className="section">
      <div className="row space-between" style={{ marginBottom: 14 }}>
        <div className="row" style={{ gap: 8 }}>
          <LayoutGrid size={16} style={{ color: "var(--neon-cyan)" }} />
          <h2 style={{ fontSize: 15, margin: 0 }}>構成銘柄ヒートマップ（騰落率 × 構成比）</h2>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <Tag variant="cyan" className="mono tiny">
            {filteredStocks.length} 銘柄
          </Tag>
          {selectedTheme && (
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => onSelectTheme(null)}
              style={{ fontSize: 10, padding: "2px 6px" }}
            >
              フィルター解除
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
        <span className="heatmap-legend-note">タイルの面積 = 構成比</span>
      </div>

      <div className="theme-heatmap-grid">
        {filteredStocks.map((stock) => {
          const isSelectedTheme = selectedTheme ? stock.theme === selectedTheme : true;
          const isUp = stock.changePct > 0;
          const isDown = stock.changePct < 0;
          const tileSpan = Math.min(6, Math.max(1, Math.round(stock.weight / 5)));

          return (
            <motion.div
              key={stock.ticker}
              whileHover={{ scale: 1.03, zIndex: 5 }}
              whileTap={{ scale: 0.98 }}
              role="button"
              tabIndex={0}
              aria-pressed={selectedTheme === stock.theme}
              aria-label={`${stock.name} (${stock.ticker}) テーマ: ${stock.theme}, 騰落率: ${stock.changePct >= 0 ? "+" : ""}${stock.changePct}%, 構成比: ${stock.weight.toFixed(1)}%`}
              onClick={() => onSelectTheme(selectedTheme === stock.theme ? null : stock.theme)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectTheme(selectedTheme === stock.theme ? null : stock.theme);
                }
              }}
              style={{
                background: getBackgroundColor(stock.changePct),
                border: `1px solid ${getBorderColor(stock.changePct)}`,
                borderRadius: 8,
                padding: "10px 12px",
                cursor: "pointer",
                opacity: isSelectedTheme ? 1 : 0.35,
                transition: "opacity 0.2s ease, border-color 0.2s ease",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                position: "relative",
                gridColumn: `span ${tileSpan}`,
              }}
              title={`${stock.name} (${stock.ticker}) [${stock.theme}]\n株価: ¥${stock.currentPrice.toLocaleString()} (${stock.changePct >= 0 ? "+" : ""}${stock.changePct}%)\n構成比: ${stock.weight.toFixed(1)}%\n指数寄与度: ${stock.contributionPt >= 0 ? "+" : ""}${stock.contributionPt}pt`}
            >
              <div className="row space-between" style={{ marginBottom: 4 }}>
                <span className="mono bold" style={{ fontSize: 12, color: "var(--text-on-heatmap)" }}>
                  {stock.ticker}
                </span>
                <span className="mono tiny muted">{stock.weight.toFixed(1)}%</span>
              </div>

              <div
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  marginBottom: 6,
                }}
              >
                {stock.name}
              </div>

              <div className="row space-between" style={{ marginTop: "auto" }}>
                <span className="mono tiny" style={{ fontSize: 11, fontWeight: 600 }}>
                  ¥{stock.currentPrice > 0 ? stock.currentPrice.toLocaleString() : "---"}
                </span>
                <span
                  className="mono tiny bold row"
                  style={{
                    gap: 2,
                    color: isUp ? "var(--neon-green)" : isDown ? "var(--neon-red)" : "var(--text-secondary)",
                  }}
                >
                  {isUp && <TrendingUp size={11} />}
                  {isDown && <TrendingDown size={11} />}
                  {stock.changePct >= 0 ? "+" : ""}
                  {stock.changePct.toFixed(1)}%
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </Card>
  );
}
