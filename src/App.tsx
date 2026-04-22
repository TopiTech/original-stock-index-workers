import { useEffect, useState } from "react";
import { AreaChart, Area, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Gauge, LayoutGrid, Loader2, TrendingUp, Activity, AlertTriangle } from "lucide-react";
import { Card, Pill, Stat } from "./components/ui";
import { type CustomIndex } from "./data/indices";
import type { PricePoint, Snapshot } from "./types";

const fmt = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const API_BASE = "/api";

export default function App() {
  const [indices, setIndices] = useState<CustomIndex[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<CustomIndex | null>(null);
  const [nikkeiData, setNikkeiData] = useState<{ snapshot: Snapshot; series: PricePoint[] } | null>(null);
  const [customSeries, setCustomSeries] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingIndices, setLoadingIndices] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);

  // 指数一覧の取得
  useEffect(() => {
    fetch(`${API_BASE}/indices`)
      .then(res => {
        if (!res.ok) throw new Error("指数一覧の取得に失敗しました");
        return res.json();
      })
      .then((data: CustomIndex[]) => {
        setIndices(data);
        if (data.length > 0) setSelectedIndex(data[0]);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoadingIndices(false));
  }, []);

  // 日経225データの取得
  useEffect(() => {
    fetch(`${API_BASE}/snapshot`)
      .then((res) => {
        if (!res.ok) throw new Error("日経平均データの取得に失敗しました");
        return res.json();
      })
      .then((data) => setNikkeiData(data))
      .catch((err) => setError(err.message));
  }, []);

  // インデックス選択時に計算をリクエスト
  useEffect(() => {
    if (!selectedIndex) return;

    const runCalculation = async () => {
      setLoading(true);
      setError(null);

      try {
        // 銘柄数が多い場合、まずバッチ同期を行う (Cloudflareの50リクエスト制限回避)
        if (selectedIndex.basket.length > 40) {
          setSyncing(true);
          const BATCH_SIZE = 40;
          const tickers = selectedIndex.basket.map(b => b.ticker);
          
          for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
            setSyncProgress(Math.round((i / tickers.length) * 100));
            const chunk = tickers.slice(i, i + BATCH_SIZE);
            const syncRes = await fetch(`${API_BASE}/sync-prices`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tickers: chunk })
            });
            if (!syncRes.ok) console.warn("Sync batch failed", i);
          }
          setSyncProgress(100);
          setSyncing(false);
        }

        // 計算リクエスト
        const res = await fetch(`${API_BASE}/calculate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ basket: selectedIndex.basket, baseValue: selectedIndex.baseValue })
        });

        if (!res.ok) throw new Error("指数の計算に失敗しました");
        const data = await res.json();
        setCustomSeries(data.series);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    };

    runCalculation();
  }, [selectedIndex]);

  if (error) {
    return (
      <div className="app" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <Card className="section" style={{ textAlign: "center", borderColor: "var(--neon-red)" }}>
          <h2 style={{ color: "var(--neon-red)", display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
            <AlertTriangle size={24} /> CRITICAL_ERROR
          </h2>
          <p className="muted">{error}</p>
          <button className="btn btn-default" onClick={() => window.location.reload()}>REBOOT_SYSTEM</button>
        </Card>
      </div>
    );
  }

  if (loadingIndices) {
    return (
      <div className="app" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div className="muted mono row" style={{ gap: 10 }}>
          <Loader2 className="animate-spin" size={24} /> INITIALIZING_DATA_LAYER...
        </div>
      </div>
    );
  }

  const latestCustomValue = customSeries[customSeries.length - 1]?.value || selectedIndex?.baseValue || 0;

  return (
    <div className="app">
      <div className="hero">
        <div className="row space-between">
          <div style={{ flex: 1 }}>
            <div className="row" style={{ marginBottom: 12 }}>
              <Pill>DATABASE_SYNC</Pill>
              <Pill>REALTIME_FEED</Pill>
              <div className="muted tiny mono" style={{ marginLeft: 'auto', letterSpacing: 2 }}>
                SYNC_MODE: D1_PERSISTENT | STATUS: ACTIVE
              </div>
            </div>
            <h1 style={{ margin: 0, fontSize: 36 }}>ORIGINAL INDEX TRACKER</h1>
            <p className="muted" style={{ marginTop: 12, fontSize: 14, maxWidth: 800 }}>
              独自指数共有プラットフォーム。
              あなたの投資戦略を、客観的な「指標」へ昇華する。 個人のポートフォリオや特定のテーマをカスタム指数として定義・共有。 パフォーマンスは常にリアルタイムで可視化されます。
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-4">
        <Stat label="Nikkei 225 / CURRENT" value={nikkeiData ? fmt.format(nikkeiData.snapshot.current) : "---"} icon={<Gauge size={18} />} />
        <Stat label="Nikkei 225 / CHANGE" value={nikkeiData ? `${nikkeiData.snapshot.change > 0 ? "+" : ""}${fmt.format(nikkeiData.snapshot.change)} (${pct.format(nikkeiData.snapshot.changePct)}%)` : "---"} icon={<TrendingUp size={18} />} />
        <Stat label="SELECTED_INDEX" value={selectedIndex?.name || "---"} icon={<LayoutGrid size={18} />} />
        <Stat label="INDEX / VALUE" value={loading ? "---" : fmt.format(latestCustomValue)} icon={<Activity size={18} />} />
      </div>

      <div className="layout">
        <aside>
          <Card className="section">
            <h2 style={{ margin: "0 0 20px 0", fontSize: 18 }}>INDEX_SELECTOR</h2>
            <div className="grid" style={{ gap: 12 }}>
              {indices.map((idx) => (
                <div
                  key={idx.id}
                  className={`item ${selectedIndex?.id === idx.id ? "active" : ""}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelectedIndex(idx)}
                >
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{idx.name}</div>
                  <div className="muted tiny" style={{ marginTop: 4 }}>{idx.description}</div>
                </div>
              ))}
            </div>

            {selectedIndex && (
              <div style={{ marginTop: 32 }}>
                <div className="muted tiny uppercase" style={{ marginBottom: 12 }}>CONSTITUENTS</div>
                <div className="grid" style={{ gap: 8 }}>
                  {[...selectedIndex.basket]
                    .sort((a, b) => b.weight - a.weight)
                    .slice(0, 3)
                    .map((item) => (
                    <div key={item.ticker} className="item" style={{ padding: '10px 14px' }}>
                      <div className="row space-between">
                        <div className="row" style={{ gap: 10 }}>
                          <span style={{ fontFamily: 'var(--mono-font)', color: 'var(--neon-cyan)', fontSize: 12 }}>{item.ticker}</span>
                          <span style={{ fontSize: 13 }}>{item.name}</span>
                        </div>
                        <div className="muted tiny mono">{item.weight}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </aside>

        <main className="grid">
          <Card className="section">
            <div className="row space-between" style={{ marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>PERFORMANCE_BENCHMARK</h2>
                <div className="muted tiny">VS_NIKKEI_225 (1M_ROLLING)</div>
              </div>
              {syncing ? (
                <div className="muted tiny row" style={{ gap: 10 }}>
                  <div style={{ width: 100, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${syncProgress}%`, height: '100%', background: 'var(--neon-cyan)', transition: 'width 0.3s' }} />
                  </div>
                  <span className="mono">SYNCING_{syncProgress}%</span>
                </div>
              ) : loading ? (
                <div className="muted tiny row" style={{ gap: 6 }}>
                  <Loader2 className="animate-spin" size={14} /> PROCESSING...
                </div>
              ) : (
                <div style={{ textAlign: "right" }}>
                  <div className="muted tiny uppercase">PRICE_POINT</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--neon-cyan)', fontFamily: 'var(--mono-font)' }}>
                    {fmt.format(latestCustomValue)}
                  </div>
                </div>
              )}
            </div>

            <div className="chart-card">
              <ResponsiveContainer width="100%" height="100%">
                {(nikkeiData && nikkeiData.series.length > 0 && customSeries.length > 0 && selectedIndex) ? (
                  <LineChart data={customSeries.map((point, index) => {
                    const firstNikkei = nikkeiData.series[0]?.close ?? selectedIndex.baseValue;
                    const nikkeiPoint = nikkeiData.series.find((p) => p.date === point.date) ?? nikkeiData.series[index] ?? { close: firstNikkei };
                    return {
                      ...point,
                      nikkei: Number((selectedIndex.baseValue * (nikkeiPoint.close / firstNikkei)).toFixed(2))
                    };
                  })}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#64748b", fontSize: 10, fontFamily: 'var(--mono-font)' }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={60}
                      tick={{ fill: "#64748b", fontSize: 10, fontFamily: 'var(--mono-font)' }}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(2, 5, 15, 0.9)',
                        border: '1px solid var(--neon-cyan)',
                        borderRadius: '0',
                        fontFamily: 'var(--mono-font)',
                        fontSize: '12px'
                      }}
                      itemStyle={{ padding: '2px 0' }}
                      formatter={(value: number, name: string) => [fmt.format(value), name === "value" ? "CUSTOM_INDEX" : "NIKKEI_EQUIV"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="nikkei"
                      stroke="#475569"
                      strokeWidth={1}
                      dot={false}
                      strokeDasharray="5 5"
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="var(--neon-cyan)"
                      strokeWidth={2}
                      dot={{ r: 0, fill: 'var(--neon-cyan)' }}
                      activeDot={{ r: 4, fill: 'var(--neon-cyan)', stroke: '#fff', strokeWidth: 2 }}
                    />
                  </LineChart>
                ) : (
                  <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }} className="muted mono tiny uppercase">
                    RECEIVING_DATA_STREAM...
                  </div>
                )}
              </ResponsiveContainer>
            </div>

            <div className="row space-between" style={{ marginTop: 16 }}>
              <div className="muted tiny mono">SOURCE: YAHOO_FINANCE_API</div>
              <div className="muted tiny mono">LAST_20_BUSINESS_DAYS</div>
            </div>
          </Card>
        </main>
      </div>
    </div>
  );
}

