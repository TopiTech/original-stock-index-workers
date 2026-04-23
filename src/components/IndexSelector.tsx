import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "./ui";
import type { CustomIndex } from "../data/indices";
import { normalizeWeights } from "../lib/indexEngine";

interface IndexSelectorProps {
  indices: CustomIndex[];
  selectedIndex: CustomIndex | null;
  onSelect: (index: CustomIndex) => void;
}

export function IndexSelector({ indices, selectedIndex, onSelect }: IndexSelectorProps) {
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
      <h2 style={{ margin: "0 0 20px 0", fontSize: 16 }}>指数セレクター</h2>
      <div className="grid index-selector-scroll" style={{ gap: 10 }}>
        {indices.map((idx) => (
          <motion.div
            key={idx.id}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            className={`item ${selectedIndex?.id === idx.id ? "active" : ""}`}
            style={{ cursor: "pointer" }}
            onClick={() => onSelect(idx)}
          >
            <div style={{ fontWeight: 700, fontSize: 14 }}>{idx.name}</div>
            <div className="muted tiny" style={{ marginTop: 4, lineHeight: 1.5 }}>
              {idx.description}
            </div>
            <div className="row" style={{ marginTop: 8, gap: 6 }}>
              {idx.basket.slice(0, 3).map((b) => (
                <span key={b.ticker} className="tag">
                  {b.ticker}
                </span>
              ))}
              {idx.basket.length > 3 && (
                <span className="tag tag-muted">+{idx.basket.length - 3}</span>
              )}
            </div>
          </motion.div>
        ))}
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
            <div style={{ marginTop: 28 }}>
              <div className="muted tiny uppercase" style={{ marginBottom: 12 }}>
                構成銘柄 TOP3
              </div>
              <div className="grid" style={{ gap: 8 }}>
                {top3Normalized.map((item) => (
                  <div key={item.ticker} className="constituent-row">
                    <div className="row space-between">
                      <div className="row" style={{ gap: 10 }}>
                        <span className="ticker">{item.ticker}</span>
                        <span style={{ fontSize: 13 }}>{item.name}</span>
                      </div>
                      <div className="muted tiny mono">{item.weight.toFixed(1)}%</div>
                    </div>
                    <div className="weight-bar-bg">
                      <motion.div
                        className="weight-bar-fill"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(item.weight, 100)}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
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
