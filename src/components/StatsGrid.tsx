import { motion } from "framer-motion";
import { Gauge, TrendingUp, LayoutGrid, Activity } from "lucide-react";
import { Stat } from "./ui";
import type { Snapshot } from "../types";

const fmt = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface StatsGridProps {
  nikkeiData: { snapshot: Snapshot } | null;
  nikkeiLoading: boolean;
  selectedIndexName: string;
  latestCustomValue: number;
  loading: boolean;
}

export function StatsGrid({ nikkeiData, nikkeiLoading, selectedIndexName, latestCustomValue, loading }: StatsGridProps) {
  const items = [
    {
      label: "日経225",
      value: nikkeiLoading ? "読込中..." : nikkeiData ? fmt.format(nikkeiData.snapshot.current) : "---",
      sub: nikkeiData
        ? `${nikkeiData.snapshot.change >= 0 ? "+" : ""}${fmt.format(nikkeiData.snapshot.change)} (${pct.format(nikkeiData.snapshot.changePct)}%)`
        : null,
      icon: <Gauge size={18} />,
      accent: nikkeiData ? (nikkeiData.snapshot.change >= 0 ? "positive" : "negative") : "neutral",
    },
    {
      label: "選択中の指数",
      value: selectedIndexName || "---",
      sub: null,
      icon: <LayoutGrid size={18} />,
      accent: "neutral" as const,
    },
    {
      label: "指数値",
      value: loading ? "計算中..." : fmt.format(latestCustomValue),
      sub: null,
      icon: <Activity size={18} />,
      accent: "neutral" as const,
    },
    {
      label: "ベンチマーク対比",
      value: "VS 日経225",
      sub: null,
      icon: <TrendingUp size={18} />,
      accent: "neutral" as const,
    },
  ];

  return (
    <div className="grid grid-4">
      {items.map((item, i) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1, duration: 0.5 }}
        >
          <Stat
            label={item.label}
            value={
              <div>
                <div className={`stat-value ${item.accent}`}>{item.value}</div>
                {item.sub && <div className="muted tiny" style={{ marginTop: 4 }}>{item.sub}</div>}
              </div>
            }
            icon={item.icon}
          />
        </motion.div>
      ))}
    </div>
  );
}
