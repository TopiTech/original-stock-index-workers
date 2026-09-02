import React, { useState } from "react";
import { motion } from "framer-motion";
import { X, Plus, Trash2, Sliders, Check, RefreshCw } from "lucide-react";
import type { BasketItem } from "../types";
import type { CustomIndex } from "../data/indices";

interface IndexBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (index: CustomIndex) => Promise<{ ok: boolean; error?: string }>;
}

const SAMPLE_STOCKS: { ticker: string; name: string; theme: string }[] = [
  { ticker: "7203", name: "トヨタ自動車", theme: "モビリティ" },
  { ticker: "9984", name: "ソフトバンクグループ", theme: "AI・投資" },
  { ticker: "8035", name: "東京エレクトロン", theme: "半導体" },
  { ticker: "6857", name: "アドバンテスト", theme: "半導体検査" },
  { ticker: "6758", name: "ソニーグループ", theme: "エンタメ・電機" },
  { ticker: "9983", name: "ファーストリテイリング", theme: "グローバル小売" },
  { ticker: "8306", name: "三菱UFJ FG", theme: "メガバンク" },
  { ticker: "8058", name: "三菱商事", theme: "総合商社" },
  { ticker: "7974", name: "任天堂", theme: "ゲーム・IP" },
  { ticker: "6861", name: "キーエンス", theme: "ファクトリーオートメーション" },
  { ticker: "3778", name: "さくらインターネット", theme: "クラウド・AI" },
  { ticker: "6501", name: "日立製作所", theme: "社会イノベーション" },
  { ticker: "9432", name: "日本電信電話 (NTT)", theme: "通信・IOWN" },
  { ticker: "5803", name: "フジクラ", theme: "光ファイバー・電力" },
  { ticker: "6920", name: "レーザーテック", theme: "最先端マスク検査" },
];

export function IndexBuilderModal({ isOpen, onClose, onSave }: IndexBuilderModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [baseValue, setBaseValue] = useState(1000);
  const [basket, setBasket] = useState<BasketItem[]>([
    { ticker: "9984", name: "ソフトバンクグループ", theme: "AI・投資", weight: 30 },
    { ticker: "8035", name: "東京エレクトロン", theme: "半導体", weight: 30 },
    { ticker: "7203", name: "トヨタ自動車", theme: "モビリティ", weight: 40 },
  ]);

  const [customTicker, setCustomTicker] = useState("");
  const [customName, setCustomName] = useState("");
  const [customTheme, setCustomTheme] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddStock = (stock: { ticker: string; name: string; theme: string }) => {
    if (basket.some((b) => b.ticker === stock.ticker)) {
      setError(`銘柄コード ${stock.ticker} は既に追加されています`);
      return;
    }
    setError(null);
    const newWeight = Math.max(5, Math.floor(100 / (basket.length + 1)));
    setBasket([...basket, { ...stock, weight: newWeight }]);
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTicker.trim() || !customName.trim()) {
      setError("銘柄コードと銘柄名は必須です");
      return;
    }
    const cleanTicker = customTicker.trim().toUpperCase();
    if (basket.some((b) => b.ticker === cleanTicker)) {
      setError(`銘柄コード ${cleanTicker} は既に追加されています`);
      return;
    }
    setError(null);
    setBasket([
      ...basket,
      {
        ticker: cleanTicker,
        name: customName.trim(),
        theme: customTheme.trim() || "カスタム",
        weight: 10,
      },
    ]);
    setCustomTicker("");
    setCustomName("");
    setCustomTheme("");
  };

  const handleRemoveStock = (ticker: string) => {
    setBasket(basket.filter((b) => b.ticker !== ticker));
  };

  const handleWeightChange = (ticker: string, weight: number) => {
    setBasket(
      basket.map((b) => (b.ticker === ticker ? { ...b, weight: Math.max(0.1, weight) } : b)),
    );
  };

  const handleEqualWeight = () => {
    if (basket.length === 0) return;
    const eqWeight = Number((100 / basket.length).toFixed(2));
    setBasket(basket.map((b) => ({ ...b, weight: eqWeight })));
  };

  const totalWeight = basket.reduce((sum, b) => sum + b.weight, 0);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("指数名を入力してください");
      return;
    }
    if (basket.length === 0) {
      setError("構成銘柄を1つ以上追加してください");
      return;
    }

    setSaving(true);
    setError(null);

    const newIndex: CustomIndex = {
      id: `idx-${Date.now()}`,
      name: name.trim(),
      description: description.trim() || `${basket.length}銘柄で構成されたカスタム指数`,
      baseValue: Number(baseValue) || 1000,
      basket,
    };

    const res = await onSave(newIndex);
    setSaving(false);

    if (res.ok) {
      onClose();
    } else {
      setError(res.error || "保存に失敗しました");
    }
  };

  return (
    <div
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
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        style={{
          width: "100%",
          maxWidth: 720,
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
        {/* Modal Header */}
        <div
          className="row space-between"
          style={{
            padding: "16px 22px",
            borderBottom: "1px solid var(--border-subtle)",
            background: "linear-gradient(90deg, rgba(0,229,255,0.06), transparent)",
          }}
        >
          <div className="row" style={{ gap: 8 }}>
            <Sliders size={18} style={{ color: "var(--neon-cyan)" }} />
            <h2 style={{ fontSize: 16, margin: 0 }}>独自指数ビルダー & シミュレーター</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {error && (
            <div
              style={{
                padding: "8px 12px",
                background: "rgba(255, 51, 102, 0.15)",
                border: "1px solid var(--neon-red)",
                borderRadius: 6,
                color: "var(--neon-red)",
                fontSize: 12,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          {/* Basic Info */}
          <div className="grid grid-2" style={{ gap: 14, marginBottom: 16 }}>
            <div>
              <label className="mono tiny muted uppercase" style={{ display: "block", marginBottom: 6 }}>
                指数名 *
              </label>
              <input
                type="text"
                className="input-search"
                style={{ paddingLeft: 12 }}
                placeholder="例: 次世代AIフロンティア指数"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label className="mono tiny muted uppercase" style={{ display: "block", marginBottom: 6 }}>
                基準値 (Base Value)
              </label>
              <input
                type="number"
                className="input-search"
                style={{ paddingLeft: 12 }}
                placeholder="1000"
                value={baseValue}
                onChange={(e) => setBaseValue(Number(e.target.value))}
              />
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="mono tiny muted uppercase" style={{ display: "block", marginBottom: 6 }}>
              指数のコンセプト・説明
            </label>
            <input
              type="text"
              className="input-search"
              style={{ paddingLeft: 12 }}
              placeholder="例: 国内AIスタートアップおよび先端半導体関連の加重平均指数"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Stock Quick Picker */}
          <div style={{ marginBottom: 18 }}>
            <div className="row space-between" style={{ marginBottom: 8 }}>
              <span className="mono tiny muted uppercase">代表銘柄クイック追加</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SAMPLE_STOCKS.map((s) => {
                const isAdded = basket.some((b) => b.ticker === s.ticker);
                return (
                  <button
                    key={s.ticker}
                    type="button"
                    disabled={isAdded}
                    onClick={() => handleAddStock(s)}
                    className="tag"
                    style={{
                      cursor: isAdded ? "default" : "pointer",
                      opacity: isAdded ? 0.4 : 1,
                      border: isAdded ? "1px solid var(--border-subtle)" : "1px solid var(--border-cyan)",
                      background: isAdded ? "transparent" : "rgba(0,229,255,0.08)",
                    }}
                  >
                    <Plus size={10} style={{ marginRight: 3 }} />
                    {s.name} ({s.ticker})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Stock Form */}
          <form
            onSubmit={handleAddCustom}
            className="row flex-wrap"
            style={{
              gap: 8,
              padding: "10px 12px",
              background: "rgba(255,255,255,0.02)",
              border: "1px dashed var(--border-subtle)",
              borderRadius: 8,
              marginBottom: 20,
            }}
          >
            <input
              type="text"
              placeholder="コード (例: 6701)"
              className="input-search"
              style={{ flex: "1 1 90px", height: 32, paddingLeft: 8, fontSize: 12 }}
              value={customTicker}
              onChange={(e) => setCustomTicker(e.target.value)}
            />
            <input
              type="text"
              placeholder="銘柄名 (例: NEC)"
              className="input-search"
              style={{ flex: "2 1 120px", height: 32, paddingLeft: 8, fontSize: 12 }}
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
            <input
              type="text"
              placeholder="テーマ (例: 通信)"
              className="input-search"
              style={{ flex: "1 1 90px", height: 32, paddingLeft: 8, fontSize: 12 }}
              value={customTheme}
              onChange={(e) => setCustomTheme(e.target.value)}
            />
            <button type="submit" className="btn btn-sm btn-default" style={{ height: 32 }}>
              <Plus size={12} /> 自由追加
            </button>
          </form>

          {/* Basket List & Weight Sliders */}
          <div>
            <div className="row space-between" style={{ marginBottom: 10 }}>
              <span className="mono tiny bold uppercase" style={{ color: "var(--neon-cyan)" }}>
                構成銘柄とウェイト設定 ({basket.length} 銘柄 / 合計: {totalWeight.toFixed(1)}%)
              </span>
              <button
                type="button"
                onClick={handleEqualWeight}
                className="btn btn-sm btn-outline"
                style={{ fontSize: 10, padding: "2px 8px" }}
              >
                均等配分に揃える
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" }}>
              {basket.map((item) => (
                <div
                  key={item.ticker}
                  className="row space-between"
                  style={{
                    padding: "8px 12px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 6,
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 140 }}>
                    <div className="row" style={{ gap: 6 }}>
                      <span className="mono bold" style={{ fontSize: 12, color: "var(--neon-cyan)" }}>
                        {item.ticker}
                      </span>
                      <span style={{ fontSize: 12 }}>{item.name}</span>
                    </div>
                    <span className="tiny muted">{item.theme}</span>
                  </div>

                  <div className="row" style={{ flex: 1, gap: 10, maxWidth: 300 }}>
                    <input
                      type="range"
                      min={1}
                      max={100}
                      step={1}
                      value={item.weight}
                      onChange={(e) => handleWeightChange(item.ticker, Number(e.target.value))}
                      style={{ flex: 1, accentColor: "var(--neon-cyan)" }}
                    />
                    <span className="mono bold" style={{ width: 45, textAlign: "right", fontSize: 12 }}>
                      {item.weight.toFixed(0)}%
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveStock(item.ticker)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--neon-red)",
                      cursor: "pointer",
                      padding: 4,
                      opacity: 0.8,
                    }}
                    title="削除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          className="row space-between"
          style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--border-subtle)",
            background: "rgba(0,0,0,0.2)",
          }}
        >
          <div className="tiny muted mono">
            ※ 保存時に Yahoo Finance から株価履歴が自動取得・D1キャッシュされます
          </div>

          <div className="row" style={{ gap: 10 }}>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
              キャンセル
            </button>
            <button
              type="button"
              className="btn btn-default"
              onClick={handleSubmit}
              disabled={saving || basket.length === 0}
            >
              {saving ? (
                <>
                  <RefreshCw size={13} className="animate-spin" /> 保存中...
                </>
              ) : (
                <>
                  <Check size={13} /> 指数を保存・追跡開始
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
