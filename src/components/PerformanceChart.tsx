import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Loader2 } from "lucide-react";
import { Card } from "./ui";

const fmt = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface ChartPoint {
  date: string;
  value: number;
  nikkei: number;
}

interface PerformanceChartProps {
  data: ChartPoint[];
  loading: boolean;
  syncing: boolean;
  syncProgress: number;
  latestValue?: number;
  baseValue?: number;
}

export function PerformanceChart({
  data,
  loading,
  syncing,
  syncProgress,
  latestValue,
  baseValue,
}: PerformanceChartProps) {
  const latestCustomValue = latestValue ?? baseValue ?? 0;
  const latestNikkeiValue = data[data.length - 1]?.nikkei ?? baseValue ?? 0;

  const performanceDiff = useMemo(() => {
    if (!latestNikkeiValue || latestNikkeiValue === 0) return 0;
    return ((latestCustomValue - latestNikkeiValue) / latestNikkeiValue) * 100;
  }, [latestCustomValue, latestNikkeiValue]);

  return (
    <Card className="section">
      <div className="row space-between" style={{ marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>パフォーマンス比較</h2>
          <div className="muted tiny">カスタム指数 vs 日経225（1ヶ月ローリング）</div>
        </div>

        {syncing ? (
          <div className="muted tiny row" style={{ gap: 10 }}>
            <div className="progress-bar-bg" style={{ width: 120 }}>
              <motion.div
                className="progress-bar-fill"
                initial={{ width: 0 }}
                animate={{ width: `${syncProgress}%` }}
              />
            </div>
            <span className="mono">SYNC {syncProgress}%</span>
          </div>
        ) : loading ? (
          <div className="muted tiny row" style={{ gap: 6 }}>
            <Loader2 className="animate-spin" size={14} /> 計算中...
          </div>
        ) : (
          <div style={{ textAlign: "right" }}>
            <div className="muted tiny uppercase">現在値</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--neon-cyan)", fontFamily: "var(--mono-font)" }}>
              {fmt.format(latestCustomValue)}
            </div>
            {performanceDiff !== 0 && (
              <div
                className="tiny mono"
                style={{
                  color: performanceDiff > 0 ? "var(--neon-cyan)" : "var(--neon-red)",
                  marginTop: 2,
                }}
              >
                {performanceDiff > 0 ? "+" : ""}
                {pct.format(performanceDiff)}% vs 日経
              </div>
            )}
          </div>
        )}
      </div>

      <div className="chart-card">
        <ResponsiveContainer width="100%" height="100%">
          {data.length > 0 ? (
            <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#64748b", fontSize: 10, fontFamily: "var(--mono-font)" }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={60}
                tick={{ fill: "#64748b", fontSize: 10, fontFamily: "var(--mono-font)" }}
                domain={["auto", "auto"]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(2, 5, 15, 0.95)",
                  border: "1px solid var(--neon-cyan)",
                  borderRadius: "4px",
                  fontFamily: "var(--mono-font)",
                  fontSize: "12px",
                  boxShadow: "0 0 20px rgba(0, 255, 242, 0.15)",
                }}
                itemStyle={{ padding: "2px 0" }}
                formatter={(value: number, name: string) => [
                  fmt.format(value),
                  name === "value" ? "カスタム指数" : "日経225",
                ]}
                labelStyle={{ color: "#8899ac", marginBottom: 4 }}
              />
              <ReferenceLine
                y={baseValue ?? 1000}
                stroke="rgba(255,255,255,0.1)"
                strokeDasharray="3 3"
              />
              <Line
                type="monotone"
                dataKey="nikkei"
                stroke="#475569"
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="5 5"
                name="nikkei"
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--neon-cyan)"
                strokeWidth={2.5}
                dot={{ r: 0, fill: "var(--neon-cyan)" }}
                activeDot={{ r: 5, fill: "var(--neon-cyan)", stroke: "#fff", strokeWidth: 2 }}
                name="value"
              />
            </LineChart>
          ) : (
            <div
              style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
              className="muted mono tiny uppercase"
            >
              データを受信中...
            </div>
          )}
        </ResponsiveContainer>
      </div>

      <div className="row space-between" style={{ marginTop: 16 }}>
        <div className="muted tiny mono">ソース: Yahoo Finance API</div>
        <div className="muted tiny mono">過去20営業日</div>
      </div>
    </Card>
  );
}
