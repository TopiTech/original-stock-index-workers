import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { Loader2, AlertTriangle, RefreshCw, TrendingUp, BarChart2 } from "lucide-react";
import { Card, ButtonGroup, Tag } from "./ui";

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
  syncWarnings?: string[];
  latestValue?: number;
  baseValue?: number;
  error?: string | null;
  onRetry?: () => void;
}

type ViewMode = "value" | "percent";
type Timeframe = "1W" | "2W" | "1M";

export function PerformanceChart({
  data,
  loading,
  syncing,
  syncProgress,
  syncWarnings = [],
  latestValue,
  baseValue = 1000,
  error,
  onRetry,
}: PerformanceChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("value");
  const [timeframe, setTimeframe] = useState<Timeframe>("1M");

  // Filter data by timeframe
  const filteredData = useMemo(() => {
    if (data.length === 0) return [];
    if (timeframe === "1W") return data.slice(-5);
    if (timeframe === "2W") return data.slice(-10);
    return data;
  }, [data, timeframe]);

  // Compute transformed series for % mode vs value mode
  const displayData = useMemo(() => {
    if (filteredData.length === 0) return [];
    if (viewMode === "value") return filteredData;

    // Percent mode: relative to the first point of the filtered window
    const firstPoint = filteredData[0];
    const firstVal = firstPoint.value || baseValue;
    const firstNikkei = firstPoint.nikkei || baseValue;

    return filteredData.map((d) => ({
      date: d.date,
      value: firstVal > 0 ? ((d.value - firstVal) / firstVal) * 100 : 0,
      nikkei: firstNikkei > 0 ? ((d.nikkei - firstNikkei) / firstNikkei) * 100 : 0,
      rawCustom: d.value,
      rawNikkei: d.nikkei,
    }));
  }, [filteredData, viewMode, baseValue]);

  // Key chart statistics
  const stats = useMemo(() => {
    if (filteredData.length === 0) return null;
    const values = filteredData.map((d) => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const startVal = filteredData[0].value;
    const endVal = filteredData[filteredData.length - 1].value;
    const periodReturn = startVal > 0 ? ((endVal - startVal) / startVal) * 100 : 0;

    const startNikkei = filteredData[0].nikkei;
    const lastNikkei = filteredData[filteredData.length - 1].nikkei;
    const nikkeiReturn = startNikkei > 0 ? ((lastNikkei - startNikkei) / startNikkei) * 100 : 0;
    const alpha = periodReturn - nikkeiReturn;

    return {
      min: minVal,
      max: maxVal,
      periodReturn,
      alpha,
    };
  }, [filteredData]);

  const latestCustomValue = latestValue ?? baseValue;
  const latestNikkeiValue = data[data.length - 1]?.nikkei ?? baseValue;
  const performanceDiff =
    latestNikkeiValue > 0 ? ((latestCustomValue - latestNikkeiValue) / latestNikkeiValue) * 100 : 0;

  return (
    <Card className="section">
      {/* Header Controls */}
      <div className="row space-between flex-wrap" style={{ marginBottom: 16, gap: 12 }}>
        <div>
          <div className="row" style={{ gap: 8 }}>
            <BarChart2 size={18} style={{ color: "var(--neon-cyan)" }} />
            <h2 style={{ margin: 0, fontSize: 17 }}>パフォーマンス分析チャート</h2>
          </div>
          <div className="muted tiny" style={{ marginTop: 2 }}>
            カスタム指数 vs 日経225（正規化比較）
          </div>
        </div>

        <div className="row flex-wrap" style={{ gap: 10 }}>
          <ButtonGroup<Timeframe>
            items={[
              { label: "1W", value: "1W" },
              { label: "2W", value: "2W" },
              { label: "1M (全期間)", value: "1M" },
            ]}
            active={timeframe}
            onChange={setTimeframe}
          />

          <ButtonGroup<ViewMode>
            items={[
              { label: "指数値", value: "value" },
              { label: "騰落率 (%)", value: "percent" },
            ]}
            active={viewMode}
            onChange={setViewMode}
          />
        </div>
      </div>

      {/* Sync / Loading Banner */}
      {syncing && (
        <div
          className="row space-between"
          style={{
            padding: "8px 14px",
            background: "rgba(0, 229, 255, 0.05)",
            border: "1px solid var(--border-cyan)",
            borderRadius: 8,
            marginBottom: 14,
          }}
        >
          <div className="row" style={{ gap: 8 }}>
            <Loader2 className="animate-spin" size={13} style={{ color: "var(--neon-cyan)" }} />
            <span className="mono tiny" style={{ color: "var(--neon-cyan)" }}>
              株価データ同期中... ({syncProgress}%)
            </span>
          </div>
          <div className="weight-progress-bg" style={{ width: 140 }}>
            <motion.div
              className="weight-progress-bar"
              initial={{ width: 0 }}
              animate={{ width: `${syncProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Chart Canvas */}
      <div className="chart-container">
        {error ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              textAlign: "center",
              padding: 24,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "rgba(255, 51, 102, 0.1)",
                border: "1px solid var(--neon-red)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--neon-red)",
              }}
            >
              <AlertTriangle size={22} />
            </div>
            <div>
              <div style={{ color: "var(--neon-red)", fontWeight: 600, fontSize: 14 }}>
                指数の計算に失敗しました
              </div>
              <div className="muted tiny" style={{ marginTop: 2 }}>
                {error}
              </div>
            </div>
            {onRetry && (
              <button className="btn btn-default btn-sm" onClick={onRetry} style={{ marginTop: 4 }}>
                <RefreshCw size={12} />
                再試行
              </button>
            )}
          </div>
        ) : displayData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={displayData} margin={{ top: 12, right: 14, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="cyanGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--neon-cyan)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--neon-cyan)" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="3 3"
                vertical={false}
              />

              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "var(--mono-font)" }}
                tickFormatter={(d: string) => (typeof d === "string" && d.length >= 10 ? d.slice(5) : d)}
                minTickGap={24}
              />

              <YAxis
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                width={65}
                tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "var(--mono-font)" }}
                tickFormatter={(v) => (viewMode === "percent" ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : fmt.format(v))}
                domain={["auto", "auto"]}
              />

              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || !payload.length) return null;
                  const customItem = payload.find((p) => p.dataKey === "value");
                  const nikkeiItem = payload.find((p) => p.dataKey === "nikkei");

                  const cVal = customItem?.value as number;
                  const nVal = nikkeiItem?.value as number;
                  const spread = cVal !== undefined && nVal !== undefined ? cVal - nVal : null;

                  return (
                    <div className="custom-tooltip">
                      <div className="tooltip-date">{label}</div>
                      <div className="tooltip-row">
                        <span style={{ color: "var(--neon-cyan)" }}>カスタム指数:</span>
                        <span style={{ fontWeight: 700 }}>
                          {viewMode === "percent"
                            ? `${cVal >= 0 ? "+" : ""}${pct.format(cVal)}%`
                            : fmt.format(cVal)}
                        </span>
                      </div>
                      <div className="tooltip-row">
                        <span style={{ color: "#94a3b8" }}>日経225:</span>
                        <span>
                          {viewMode === "percent"
                            ? `${nVal >= 0 ? "+" : ""}${pct.format(nVal)}%`
                            : fmt.format(nVal)}
                        </span>
                      </div>
                      {spread !== null && (
                        <div
                          className="tooltip-row"
                          style={{
                            marginTop: 4,
                            paddingTop: 4,
                            borderTop: "1px dashed rgba(255,255,255,0.1)",
                          }}
                        >
                          <span style={{ color: spread >= 0 ? "var(--neon-green)" : "var(--neon-red)" }}>
                            乖離 (Spread):
                          </span>
                          <span
                            style={{
                              fontWeight: 700,
                              color: spread >= 0 ? "var(--neon-green)" : "var(--neon-red)",
                            }}
                          >
                            {spread > 0 ? "+" : ""}
                            {pct.format(spread)}
                            {viewMode === "percent" ? "%pt" : "pts"}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                }}
              />

              {viewMode === "value" && (
                <ReferenceLine
                  y={baseValue}
                  stroke="rgba(255,255,255,0.2)"
                  strokeDasharray="4 4"
                  label={{
                    value: `BASE ${baseValue}`,
                    fill: "#64748b",
                    fontSize: 10,
                    position: "insideTopLeft",
                  }}
                />
              )}

              {viewMode === "percent" && (
                <ReferenceLine
                  y={0}
                  stroke="rgba(255,255,255,0.25)"
                  strokeDasharray="3 3"
                />
              )}

              {/* Nikkei 225 Benchmark Line */}
              <Line
                type="monotone"
                dataKey="nikkei"
                stroke="#64748b"
                strokeWidth={2}
                dot={false}
                strokeDasharray="4 4"
                name="nikkei"
              />

              {/* Custom Index Area & Line */}
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--neon-cyan)"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#cyanGradient)"
                dot={{ r: 0 }}
                activeDot={{
                  r: 5,
                  fill: "var(--neon-cyan)",
                  stroke: "#fff",
                  strokeWidth: 2,
                }}
                name="value"
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
            className="muted mono tiny uppercase"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={16} /> 指数データを計算中...
              </>
            ) : (
              "データを受信中..."
            )}
          </div>
        )}
      </div>

      {/* Chart Stats Summary Bar */}
      {stats && (
        <div className="chart-stats-summary">
          <div className="chart-stat-item">
            <span className="chart-stat-title">期間高値 (HIGH)</span>
            <span className="chart-stat-val" style={{ color: "var(--neon-green)" }}>
              {fmt.format(stats.max)}
            </span>
          </div>

          <div className="chart-stat-item">
            <span className="chart-stat-title">期間安値 (LOW)</span>
            <span className="chart-stat-val" style={{ color: "var(--neon-red)" }}>
              {fmt.format(stats.min)}
            </span>
          </div>

          <div className="chart-stat-item">
            <span className="chart-stat-title">期間リターン</span>
            <span
              className="chart-stat-val"
              style={{
                color:
                  stats.periodReturn > 0
                    ? "var(--neon-green)"
                    : stats.periodReturn < 0
                      ? "var(--neon-red)"
                      : "inherit",
              }}
            >
              {stats.periodReturn >= 0 ? "+" : ""}
              {pct.format(stats.periodReturn)}%
            </span>
          </div>

          <div className="chart-stat-item">
            <span className="chart-stat-title">対日経超過幅</span>
            <span
              className="chart-stat-val"
              style={{
                color:
                  stats.alpha > 0
                    ? "var(--neon-cyan)"
                    : stats.alpha < 0
                      ? "var(--neon-red)"
                      : "inherit",
              }}
            >
              {stats.alpha >= 0 ? "+" : ""}
              {pct.format(stats.alpha)}%
            </span>
          </div>
        </div>
      )}

      {/* Warnings */}
      {syncWarnings.length > 0 && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 12px",
            borderLeft: "3px solid var(--neon-magenta)",
            background: "rgba(224, 64, 251, 0.05)",
            borderRadius: "0 6px 6px 0",
          }}
        >
          {syncWarnings.map((w, i) => (
            <div key={i} className="muted tiny mono">
              {w}
            </div>
          ))}
        </div>
      )}

      <div className="row space-between" style={{ marginTop: 14 }}>
        <div className="muted tiny mono">
          <span style={{ color: "var(--neon-cyan)" }}>―</span> カスタム指数　
          <span style={{ color: "#64748b" }}>---</span> 日経225 (Base 1,000正規化)
        </div>
        <div className="muted tiny mono">ソース: Yahoo Finance API (日足終値)</div>
      </div>
    </Card>
  );
}

