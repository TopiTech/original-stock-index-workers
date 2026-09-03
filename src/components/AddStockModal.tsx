import React, { useState } from "react";
import { motion } from "framer-motion";
import { Plus, X, AlertCircle, Sparkles, Building2 } from "lucide-react";
import type { BasketItem } from "../types";

interface AddStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  indexName: string;
  currentCount: number;
  maxStocks: number | null;
  onAddStock: (stock: BasketItem) => Promise<{ ok: boolean; error?: string }>;
}

const PRESET_STOCKS = [
  { ticker: "7203", name: "トヨタ自動車", theme: "モビリティ" },
  { ticker: "9984", name: "ソフトバンクグループ", theme: "AI・投資" },
  { ticker: "8035", name: "東京エレクトロン", theme: "半導体製造装置" },
  { ticker: "6857", name: "アドバンテスト", theme: "半導体検査" },
  { ticker: "6758", name: "ソニーグループ", theme: "エンタメ・電機" },
  { ticker: "9983", name: "ファーストリテイリング", theme: "グローバル小売" },
  { ticker: "8306", name: "三菱UFJ FG", theme: "メガバンク" },
  { ticker: "8058", name: "三菱商事", theme: "総合商社" },
  { ticker: "7974", name: "任天堂", theme: "ゲーム・IP" },
  { ticker: "6861", name: "キーエンス", theme: "FA・センサー" },
  { ticker: "3778", name: "さくらインターネット", theme: "クラウド・AI" },
  { ticker: "6920", name: "レーザーテック", theme: "最先端マスク検査" },
  { ticker: "6501", name: "日立製作所", theme: "社会インフラ・IT" },
  { ticker: "5803", name: "フジクラ", theme: "光ファイバー・電力" },
];

export function AddStockModal({
  isOpen,
  onClose,
  indexName,
  currentCount,
  maxStocks,
  onAddStock,
}: AddStockModalProps) {
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [theme, setTheme] = useState("");
  const [weight, setWeight] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isLimitReached = maxStocks !== null && maxStocks > 0 && currentCount >= maxStocks;

  const handleSelectPreset = (p: { ticker: string; name: string; theme: string }) => {
    setTicker(p.ticker);
    setName(p.name);
    setTheme(p.theme);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLimitReached) {
      setError(`このパスワードの上限（最大${maxStocks}銘柄）に達しているため、追加できません`);
      return;
    }

    const cleanTicker = ticker.trim().toUpperCase();
    const cleanName = name.trim();
    if (!cleanTicker || !cleanName) {
      setError("銘柄コードと銘柄名は必須です");
      return;
    }

    if (!/^[A-Za-z0-9.\-]+$/.test(cleanTicker) || cleanTicker.length > 20) {
      setError("銘柄コードは英数字、ハイフン、ピリオド（最大20文字）で入力してください (例: 7203, AAPL)");
      return;
    }

    setLoading(true);
    setError(null);
    const res = await onAddStock({
      ticker: cleanTicker,
      name: cleanName,
      theme: theme.trim() || "カスタム",
      weight: Math.max(0.1, Number(weight) || 10),
    });
    setLoading(false);

    if (res.ok) {
      setTicker("");
      setName("");
      setTheme("");
      setWeight(10);
      onClose();
    } else {
      setError(res.error || "銘柄の追加に失敗しました");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(3, 7, 18, 0.85)",
        backdropFilter: "blur(8px)",
        padding: 16,
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        style={{
          width: "100%",
          maxWidth: 620,
          maxHeight: "90vh",
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-cyan)",
          borderRadius: 14,
          boxShadow: "0 20px 60px rgba(0,0,0,0.8), 0 0 30px rgba(0,229,255,0.2)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          className="row space-between"
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-subtle)",
            background: "linear-gradient(90deg, rgba(0,229,255,0.08), transparent)",
          }}
        >
          <div className="row" style={{ gap: 8 }}>
            <Plus size={18} style={{ color: "var(--neon-cyan)" }} />
            <div>
              <h2 style={{ fontSize: 16, margin: 0, fontWeight: 700 }}>構成銘柄の追加</h2>
              <div className="muted tiny">対象指数: {indexName}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "20px 22px", overflowY: "auto", flex: 1 }}>
          {/* Stock Limit Meter */}
          <div
            style={{
              padding: "10px 14px",
              background: isLimitReached ? "rgba(255, 51, 102, 0.1)" : "rgba(0, 229, 255, 0.05)",
              border: `1px solid ${isLimitReached ? "var(--neon-red)" : "var(--border-subtle)"}`,
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            <div className="row space-between" style={{ fontSize: 12 }}>
              <span style={{ fontWeight: 600, color: isLimitReached ? "var(--neon-red)" : "var(--neon-cyan)" }}>
                銘柄登録状況
              </span>
              <span className="mono">
                {currentCount} / {maxStocks ? `${maxStocks} 銘柄` : "無制限"}
              </span>
            </div>
            {isLimitReached && (
              <div style={{ fontSize: 12, color: "var(--neon-red)", marginTop: 4 }}>
                ⚠️ 現在のパスワードで許可されている銘柄数上限 ({maxStocks}銘柄) に達しています。追加するには既存銘柄を削除するか管理者にお問い合わせください。
              </div>
            )}
          </div>

          {error && (
            <div
              className="row"
              style={{
                gap: 8,
                padding: "10px 12px",
                background: "rgba(255, 51, 102, 0.15)",
                border: "1px solid var(--neon-red)",
                borderRadius: 8,
                color: "var(--neon-red)",
                fontSize: 12,
                marginBottom: 16,
              }}
            >
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Quick presets */}
          <div style={{ marginBottom: 16 }}>
            <div className="row" style={{ gap: 6, marginBottom: 8, fontSize: 12, color: "var(--text-secondary)" }}>
              <Sparkles size={13} style={{ color: "var(--neon-cyan)" }} />
              <span>プリセット銘柄から選択:</span>
            </div>
            <div className="row flex-wrap" style={{ gap: 6, maxHeight: 110, overflowY: "auto" }}>
              {PRESET_STOCKS.map((p) => (
                <button
                  key={p.ticker}
                  type="button"
                  onClick={() => handleSelectPreset(p)}
                  disabled={isLimitReached}
                  style={{
                    padding: "4px 8px",
                    background: ticker === p.ticker ? "rgba(0, 229, 255, 0.2)" : "rgba(255, 255, 255, 0.03)",
                    border: `1px solid ${ticker === p.ticker ? "var(--neon-cyan)" : "var(--border-subtle)"}`,
                    borderRadius: 6,
                    color: ticker === p.ticker ? "#fff" : "var(--text-secondary)",
                    fontSize: 11,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span className="mono" style={{ color: "var(--neon-cyan)" }}>{p.ticker}</span>
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Input Form */}
          <form onSubmit={handleSubmit} id="add-stock-form">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                  銘柄コード <span style={{ color: "var(--neon-red)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  placeholder="例: 7203, AAPL"
                  disabled={isLimitReached}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    background: "rgba(0, 0, 0, 0.4)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 6,
                    color: "#fff",
                    fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                  銘柄名 <span style={{ color: "var(--neon-red)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例: トヨタ自動車"
                  disabled={isLimitReached}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    background: "rgba(0, 0, 0, 0.4)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 6,
                    color: "#fff",
                    fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                  テーマ / セクター
                </label>
                <input
                  type="text"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  placeholder="例: EV・モビリティ"
                  disabled={isLimitReached}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    background: "rgba(0, 0, 0, 0.4)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 6,
                    color: "#fff",
                    fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                  構成比率 (重み)
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type="number"
                    min="0.1"
                    max="100"
                    step="0.5"
                    value={weight}
                    onChange={(e) => setWeight(Number(e.target.value))}
                    disabled={isLimitReached}
                    style={{
                      width: "100%",
                      padding: "8px 24px 8px 10px",
                      background: "rgba(0, 0, 0, 0.4)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: 6,
                      color: "#fff",
                      fontSize: 13,
                      boxSizing: "border-box",
                    }}
                  />
                  <span style={{ position: "absolute", right: 8, top: 8, fontSize: 12, color: "var(--text-secondary)" }}>
                    %
                  </span>
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div
          className="row space-between"
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--border-subtle)",
            background: "rgba(0, 0, 0, 0.2)",
          }}
        >
          <div className="muted tiny">
            ※ 追加後はD1データベースに即座に同期・保存されます
          </div>
          <div className="row" style={{ gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-sm btn-outline"
              disabled={loading}
            >
              キャンセル
            </button>
            <button
              type="submit"
              form="add-stock-form"
              className="btn btn-sm btn-default"
              disabled={loading || isLimitReached || !ticker.trim() || !name.trim()}
              style={{ minWidth: 100 }}
            >
              {loading ? "追加中..." : "銘柄を追加"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
