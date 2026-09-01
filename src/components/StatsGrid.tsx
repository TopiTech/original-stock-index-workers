import { motion } from "framer-motion";
import { Gauge, TrendingUp, Layers, Activity } from "lucide-react";
import { StatCard } from "./ui";
import type { Snapshot } from "../types";
import type { CustomIndex } from "../data/indices";

const fmt = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface StatsGridProps {
  nikkeiData: { snapshot: Snapshot } | null;
  nikkeiLoading: boolean;
  selectedIndex: CustomIndex | null;
  latestCustomValue: number;
  loading: boolean;
  nikkeiNormalizedValue?: number;
}

export function StatsGrid({
  nikkeiData,
  nikkeiLoading,
  selectedIndex,
  latestCustomValue,
  loading,
  nikkeiNormalizedValue,
}: StatsGridProps) {
  const baseValue = selectedIndex?.baseValue ?? 1000;
  const customReturnPct = baseValue > 0 ? ((latestCustomValue - baseValue) / baseValue) * 100 : 0;

  const hasBenchmark = typeof nikkeiNormalizedValue === "number" && nikkeiNormalizedValue > 0 && !loading;
  const benchmarkDiff = hasBenchmark
    ? ((latestCustomValue - nikkeiNormalizedValue) / nikkeiNormalizedValue) * 100
    : 0;

  // Distinct themes
  const uniqueThemes = new Set(selectedIndex?.basket.map((b) => b.theme) || []);

  const items = [
    {
      label: selectedIndex ? `${selectedIndex.name}` : "選択中指数",
      value: loading ? "計算中..." : fmt.format(latestCustomValue),
      trend: loading
        ? undefined
        : {
            text: `${customReturnPct >= 0 ? "+" : ""}${pct.format(customReturnPct)}%`,
            type: (customReturnPct > 0 ? "positive" : customReturnPct < 0 ? "negative" : "neutral") as "positive" | "negative" | "neutral",
          },
      sub: selectedIndex ? `基準値 ${fmt.format(baseValue)}` : undefined,
      icon: <Activity size={16} />,
      active: true,
    },
    {
      label: "日経225 ベンチマーク",
      value: nikkeiLoading ? "読込中..." : nikkeiData ? fmt.format(nikkeiData.snapshot.current) : "---",
      trend: nikkeiData
        ? {
            text: `${nikkeiData.snapshot.changePct >= 0 ? "+" : ""}${pct.format(nikkeiData.snapshot.changePct)}%`,
            type: (nikkeiData.snapshot.changePct > 0 ? "positive" : nikkeiData.snapshot.changePct < 0 ? "negative" : "neutral") as "positive" | "negative" | "neutral",
          }
        : undefined,
      sub: nikkeiData ? `前日比 ${nikkeiData.snapshot.change >= 0 ? "+" : ""}${fmt.format(nikkeiData.snapshot.change)}` : undefined,
      icon: <Gauge size={16} />,
    },
    {
      label: "対日経アルファ (超過収益)",
      value: loading
        ? "計算中..."
        : nikkeiLoading
          ? "読込中..."
          : hasBenchmark
            ? `${benchmarkDiff > 0 ? "+" : ""}${pct.format(benchmarkDiff)}%`
            : "---",
      trend: hasBenchmark
        ? {
            text: benchmarkDiff > 0 ? "OUTPERFORM" : benchmarkDiff < 0 ? "UNDERPERFORM" : "NEUTRAL",
            type: (benchmarkDiff > 0 ? "positive" : benchmarkDiff < 0 ? "negative" : "neutral") as "positive" | "negative" | "neutral",
          }
        : undefined,
      sub: hasBenchmark
        ? benchmarkDiff > 0
          ? "日経225を上回る推移"
          : benchmarkDiff < 0
            ? "日経225を下回る推移"
            : "日経225と同等の推移"
        : undefined,
      icon: <TrendingUp size={16} />,
    },
    {
      label: "構成バスケット概要",
      value: selectedIndex ? `${selectedIndex.basket.length} 銘柄` : "---",
      sub: selectedIndex ? `${uniqueThemes.size} テーマカテゴリ` : undefined,
      trend: selectedIndex
        ? {
            text: `BASE ${selectedIndex.baseValue}`,
            type: "neutral" as const,
          }
        : undefined,
      icon: <Layers size={16} />,
    },
  ];


  return (
    <div className="grid grid-4">
      {items.map((item, i) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08, duration: 0.4 }}
        >
          <StatCard
            label={item.label}
            value={item.value}
            trend={item.trend}
            sub={item.sub}
            icon={item.icon}
            active={item.active}
          />
        </motion.div>
      ))}
    </div>
  );
}

