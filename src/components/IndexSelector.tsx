import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, Tag, Badge, SearchInput } from "./ui";
import { Layers, CheckCircle2, Plus, Trash2, UserCheck } from "lucide-react";
import type { CustomIndex } from "../data/indices";
import { normalizeWeights } from "../lib/indexEngine";
import { isIndexOwner } from "../lib/ownership";

interface IndexSelectorProps {
  indices: CustomIndex[];
  selectedIndex: CustomIndex | null;
  onSelect: (index: CustomIndex) => void;
  onCreateIndex?: () => void;
  onDeleteIndex?: (id: string) => void;
  isOwner?: (id: string) => boolean;
}

const SYSTEM_INDEX_IDS = new Set([
  "nikkei-175",
  "eroge-index",
  "ai-semi",
  "infra-tech",
  "jp-core",
]);

export function IndexSelector({
  indices,
  selectedIndex,
  onSelect,
  onCreateIndex,
  onDeleteIndex,
  isOwner,
}: IndexSelectorProps) {
  const [search, setSearch] = useState("");

  const filteredIndices = useMemo(() => {
    if (!search.trim()) return indices;
    const q = search.trim().toLowerCase();
    return indices.filter(
      (idx) =>
        idx.name.toLowerCase().includes(q) ||
        idx.description.toLowerCase().includes(q) ||
        idx.basket.some((b) => b.name.toLowerCase().includes(q) || b.ticker.includes(q)),
    );
  }, [indices, search]);

  // Normalize weights for display so bars always sum to 100%
  const top3Normalized = useMemo(() => {
    if (!selectedIndex) return [];
    const normalized = normalizeWeights(selectedIndex.basket);
    return [...normalized]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3);
  }, [selectedIndex]);

  return (
    <Card className="section" style={{ height: "fit-content" }}>
      <div className="row space-between" style={{ marginBottom: 14 }}>
        <div className="row" style={{ gap: 8 }}>
          <Layers size={16} style={{ color: "var(--neon-cyan)" }} />
          <h2 style={{ margin: 0, fontSize: 16 }}>指数セレクター</h2>
        </div>
        <Badge variant="cyan">{indices.length} 指数</Badge>
      </div>

      {onCreateIndex && (
        <button
          type="button"
          onClick={onCreateIndex}
          className="btn btn-default"
          style={{ width: "100%", marginBottom: 12, padding: "8px 12px" }}
        >
          <Plus size={14} /> 独自指数を新規作成
        </button>
      )}

      <div style={{ marginBottom: 12 }}>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="指数・銘柄検索..."
        />
      </div>

      <div className="index-list">
        {filteredIndices.map((idx) => {
          const isSelected = selectedIndex?.id === idx.id;
          const isSystem = SYSTEM_INDEX_IDS.has(idx.id);
          const checkOwner = isOwner || isIndexOwner;
          const isMyIndex = !isSystem && checkOwner(idx.id);

          return (
            <motion.div
              key={idx.id}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className={`index-item ${isSelected ? "active" : ""}`}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              onClick={() => onSelect(idx)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(idx);
                }
              }}
            >
              <div className="row space-between" style={{ marginBottom: 4 }}>
                <div className="row" style={{ gap: 6, alignItems: "center" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: isSelected ? "var(--neon-cyan)" : "#fff" }}>
                    {idx.name}
                  </div>
                  {isMyIndex && (
                    <span
                      className="tag"
                      style={{
                        fontSize: 9,
                        padding: "1px 6px",
                        background: "rgba(0, 229, 255, 0.12)",
                        color: "var(--neon-cyan)",
                        border: "1px solid rgba(0, 229, 255, 0.3)",
                        borderRadius: 4,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
                      }}
                      title="あなたが作成した独自指数です"
                    >
                      <UserCheck size={10} /> My 指数
                    </span>
                  )}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {isMyIndex && onDeleteIndex && (
                    <button
                      type="button"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        if (confirm(`指数「${idx.name}」を削除しますか？\n（作成者のみ削除可能です）`)) {
                          onDeleteIndex(idx.id);
                        }
                      }}
                      onKeyDown={(e: React.KeyboardEvent) => {
                        e.stopPropagation();
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (confirm(`指数「${idx.name}」を削除しますか？\n（作成者のみ削除可能です）`)) {
                            onDeleteIndex(idx.id);
                          }
                        }
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--neon-red)",
                        cursor: "pointer",
                        padding: 2,
                        opacity: 0.7,
                      }}
                      title="指数を削除 (作成者のみ)"
                      aria-label={`指数「${idx.name}」を削除`}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                  {isSelected ? (
                    <CheckCircle2 size={16} style={{ color: "var(--neon-cyan)", flexShrink: 0 }} />
                  ) : null}
                </div>
              </div>

              <div className="muted tiny" style={{ lineHeight: 1.4, marginBottom: 8 }}>
                {idx.description}
              </div>

              <div className="row space-between flex-wrap" style={{ gap: 6 }}>
                <div className="row" style={{ gap: 4 }}>
                  <Tag variant="cyan" style={{ fontSize: 10 }}>
                    {idx.basket.length} 銘柄
                  </Tag>
                  <Tag variant="muted" style={{ fontSize: 10 }}>
                    BASE {idx.baseValue}
                  </Tag>
                </div>

                <div className="row" style={{ gap: 4 }}>
                  {idx.basket.slice(0, 2).map((b) => (
                    <span key={b.ticker} className="tag tag-muted" style={{ fontSize: 9 }}>
                      {b.name}
                    </span>
                  ))}
                  {idx.basket.length > 2 && (
                    <span className="tag tag-muted" style={{ fontSize: 9 }}>
                      +{idx.basket.length - 2}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}

        {filteredIndices.length === 0 && (
          <div style={{ textAlign: "center", padding: "24px 0" }} className="muted tiny mono">
            一致する指数がありません
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {selectedIndex && (
          <motion.div
            key={selectedIndex.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
              <div className="row space-between" style={{ marginBottom: 10 }}>
                <div className="muted tiny uppercase mono">
                  主要ウェイト TOP 3
                </div>
                <div className="muted tiny mono">
                  シェア計 {top3Normalized.reduce((acc, c) => acc + c.weight, 0).toFixed(1)}%
                </div>
              </div>

              <div className="grid" style={{ gap: 6 }}>
                {top3Normalized.map((item) => (
                  <div
                    key={item.ticker}
                    style={{
                      padding: "8px 12px",
                      background: "rgba(255, 255, 255, 0.02)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: 6,
                    }}
                  >
                    <div className="row space-between">
                      <div className="row" style={{ gap: 8 }}>
                        <span className="mono" style={{ color: "var(--neon-cyan)", fontWeight: 600, fontSize: 12 }}>
                          {item.ticker}
                        </span>
                        <span style={{ fontSize: 12 }}>{item.name}</span>
                      </div>
                      <div className="mono tiny" style={{ fontWeight: 600 }}>
                        {item.weight.toFixed(1)}%
                      </div>
                    </div>
                    <div className="weight-progress-bg" style={{ marginTop: 6 }}>
                      <motion.div
                        className="weight-progress-bar"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(item.weight * 2, 100)}%` }}
                        transition={{ duration: 0.6 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
