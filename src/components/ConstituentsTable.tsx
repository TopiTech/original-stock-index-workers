import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, Tag, SearchInput } from "./ui";
import { ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, ListOrdered } from "lucide-react";
import type { BasketItem } from "../types";
import { normalizeWeights } from "../lib/indexEngine";

interface ConstituentsTableProps {
  basket: BasketItem[];
  selectedTheme: string | null;
}

type SortField = "weight" | "ticker" | "name" | "theme";
type SortOrder = "asc" | "desc";

export function ConstituentsTable({ basket, selectedTheme }: ConstituentsTableProps) {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("weight");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Normalize weights first so they sum to 100%
  const normalizedBasket = useMemo(() => {
    return normalizeWeights(basket);
  }, [basket]);

  const filteredAndSorted = useMemo(() => {
    let list = [...normalizedBasket];

    // Filter by selected theme
    if (selectedTheme) {
      list = list.filter((item) => item.theme === selectedTheme);
    }

    // Filter by search text
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (item) =>
          item.ticker.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          item.theme?.toLowerCase().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "weight") {
        cmp = a.weight - b.weight;
      } else if (sortField === "ticker") {
        cmp = a.ticker.localeCompare(b.ticker);
      } else if (sortField === "name") {
        cmp = a.name.localeCompare(b.name, "ja");
      } else if (sortField === "theme") {
        cmp = (a.theme || "").localeCompare(b.theme || "", "ja");
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return list;
  }, [normalizedBasket, selectedTheme, search, sortField, sortOrder]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder(field === "weight" ? "desc" : "asc");
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={12} style={{ opacity: 0.4, marginLeft: 4 }} />;
    }
    return sortOrder === "asc" ? (
      <ArrowUp size={12} style={{ color: "var(--neon-cyan)", marginLeft: 4 }} />
    ) : (
      <ArrowDown size={12} style={{ color: "var(--neon-cyan)", marginLeft: 4 }} />
    );
  };

  return (
    <Card className="section">
      <div className="row space-between flex-wrap" style={{ marginBottom: 16, gap: 12 }}>
        <div className="row" style={{ gap: 8 }}>
          <ListOrdered size={16} style={{ color: "var(--neon-cyan)" }} />
          <h2 style={{ fontSize: 15, margin: 0 }}>構成銘柄リスト</h2>
          <Tag variant="cyan" className="mono tiny">
            {filteredAndSorted.length} / {basket.length} 銘柄
          </Tag>
        </div>

        <div style={{ width: "100%", maxWidth: 260 }}>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="銘柄名・コード・テーマ検索..."
          />
        </div>
      </div>

      <div className="table-wrapper">
        <table className="custom-table">
          <thead>
            <tr>
              {(["ticker", "name", "theme", "weight"] as SortField[]).map((field) => {
                const labels: Record<SortField, string> = { ticker: "コード", name: "銘柄名", theme: "テーマ", weight: "構成比率" };
                const widths: Record<SortField, string> = { ticker: "15%", name: "35%", theme: "25%", weight: "25%" };
                const isWeight = field === "weight";
                return (
                  <th
                    key={field}
                    role="columnheader"
                    aria-sort={sortField === field ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                    tabIndex={0}
                    onClick={() => toggleSort(field)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSort(field); } }}
                    style={{ width: widths[field], textAlign: isWeight ? "right" : undefined }}
                  >
                    <span className="row" style={{ gap: 2, justifyContent: isWeight ? "flex-end" : undefined }}>
                      {labels[field]} {renderSortIcon(field)}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout">
              {filteredAndSorted.length > 0 ? (
                filteredAndSorted.map((item) => (
                  <tr key={item.ticker}>
                    <td>
                      <a
                        href={`https://finance.yahoo.co.jp/quote/${item.ticker.includes(".") ? item.ticker : `${item.ticker}.T`}`}
                        target="_blank"
                        rel="noreferrer"
                        className="tag mono row"
                        style={{
                          textDecoration: "none",
                          gap: 4,
                          display: "inline-flex",
                          transition: "all 0.2s ease",
                        }}
                        title="Yahoo!ファイナンスで開く"
                      >
                        {item.ticker}
                        <ExternalLink size={10} style={{ opacity: 0.7 }} />
                      </a>
                    </td>
                    <td>
                      <span style={{ fontWeight: 500 }}>{item.name}</span>
                    </td>
                    <td>
                      <Tag variant="theme" style={{ fontSize: 11 }}>
                        {item.theme || "その他"}
                      </Tag>
                    </td>
                    <td>
                      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
                        <div className="weight-progress-cell">
                          <div className="weight-progress-bg">
                            <motion.div
                              className="weight-progress-bar"
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(item.weight * 2.5, 100)}%` }}
                              transition={{ duration: 0.5 }}
                            />
                          </div>
                          <span
                            className="mono tiny"
                            style={{ minWidth: 42, textAlign: "right", fontWeight: 600 }}
                          >
                            {item.weight.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: "32px 16px" }}>
                    <span className="muted mono tiny">該当する銘柄が見つかりません</span>
                  </td>
                </tr>
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
