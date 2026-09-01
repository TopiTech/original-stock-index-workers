import { useMemo } from "react";
import { motion } from "framer-motion";
import { Card, Tag } from "./ui";
import { PieChart as PieIcon, Filter } from "lucide-react";
import type { BasketItem } from "../types";
import { normalizeWeights } from "../lib/indexEngine";

const THEME_COLORS = [
  "#00e5ff", // cyan
  "#e040fb", // magenta
  "#00e676", // green
  "#ffd600", // yellow
  "#ff3366", // red
  "#ff9100", // orange
  "#7c4dff", // purple
  "#00b0ff", // light blue
  "#1de9b6", // teal
  "#ff4081", // pink
];

interface ThemeBreakdownProps {
  basket: BasketItem[];
  selectedTheme: string | null;
  onSelectTheme: (theme: string | null) => void;
}

export function ThemeBreakdown({
  basket,
  selectedTheme,
  onSelectTheme,
}: ThemeBreakdownProps) {
  const themeData = useMemo(() => {
    if (basket.length === 0) return [];

    const normalized = normalizeWeights(basket);
    const map = new Map<string, { weight: number; count: number; theme: string }>();

    for (const item of normalized) {
      const t = item.theme || "その他";
      const existing = map.get(t) || { weight: 0, count: 0, theme: t };
      existing.weight += item.weight;
      existing.count += 1;
      map.set(t, existing);
    }

    return Array.from(map.values())
      .sort((a, b) => b.weight - a.weight)
      .map((item, idx) => ({
        ...item,
        color: THEME_COLORS[idx % THEME_COLORS.length],
      }));
  }, [basket]);

  if (themeData.length === 0) return null;

  return (
    <Card className="section">
      <div className="row space-between" style={{ marginBottom: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          <PieIcon size={16} style={{ color: "var(--neon-cyan)" }} />
          <h2 style={{ fontSize: 15, margin: 0 }}>テーマ別構成比率</h2>
        </div>
        {selectedTheme && (
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => onSelectTheme(null)}
            style={{ fontSize: 11, padding: "2px 8px" }}
          >
            <Filter size={11} /> フィルター解除 ({selectedTheme})
          </button>
        )}
      </div>

      {/* Visual Stacked Bar */}
      <div className="theme-bar-container">
        {themeData.map((t) => (
          <div
            key={t.theme}
            className="theme-bar-segment"
            style={{
              width: `${t.weight}%`,
              backgroundColor: t.color,
              opacity: selectedTheme && selectedTheme !== t.theme ? 0.3 : 1,
            }}
            title={`${t.theme}: ${t.weight.toFixed(1)}% (${t.count}銘柄)`}
          />
        ))}
      </div>

      {/* Interactive Legend Chips */}
      <div className="theme-legend">
        {themeData.map((t) => {
          const isSelected = selectedTheme === t.theme;
          return (
            <motion.button
              key={t.theme}
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`theme-chip ${isSelected ? "active" : ""}`}
              onClick={() => onSelectTheme(isSelected ? null : t.theme)}
              style={{
                borderColor: isSelected ? t.color : undefined,
                color: isSelected ? "#fff" : "var(--text-primary)",
              }}
            >
              <span className="theme-dot" style={{ backgroundColor: t.color }} />
              <span style={{ fontWeight: isSelected ? 600 : 400 }}>{t.theme}</span>
              <span className="mono tiny" style={{ color: "var(--text-secondary)" }}>
                {t.weight.toFixed(1)}%
              </span>
              <Tag variant="muted" className="tiny" style={{ padding: "0 4px", fontSize: 10 }}>
                {t.count}
              </Tag>
            </motion.button>
          );
        })}
      </div>
    </Card>
  );
}
