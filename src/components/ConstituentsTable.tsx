import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, Tag, SearchInput } from "./ui";
import {
  ExternalLink,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ListOrdered,
  Download,
  TrendingUp,
  TrendingDown,
  Plus,
  Trash2,
  Lock,
  Unlock,
  KeyRound,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import type { BasketItem, StockDetail } from "../types";
import { normalizeWeights } from "../lib/indexEngine";
import { useAuth } from "../hooks/useAuth";
import { AuthModal } from "./AuthModal";
import { AddStockModal } from "./AddStockModal";

interface ConstituentsTableProps {
  basket: BasketItem[];
  stockDetails?: StockDetail[];
  selectedTheme: string | null;
  indexName?: string;
  indexId?: string;
  onAddStock?: (stock: BasketItem) => Promise<{ ok: boolean; error?: string }>;
  onRemoveStock?: (ticker: string) => Promise<{ ok: boolean; error?: string }>;
}

type SortField =
  | "weight"
  | "ticker"
  | "name"
  | "theme"
  | "currentPrice"
  | "changePct"
  | "contributionPt";
type SortOrder = "asc" | "desc";

function getYahooFinanceUrl(ticker: string): string {
  const trimmed = ticker.trim().toUpperCase();
  if (trimmed.includes(".") || trimmed.startsWith("^") || trimmed.endsWith("=X")) {
    return `https://finance.yahoo.co.jp/quote/${encodeURIComponent(trimmed)}`;
  }
  if (/^\d/.test(trimmed)) {
    return `https://finance.yahoo.co.jp/quote/${trimmed}.T`;
  }
  return `https://finance.yahoo.co.jp/quote/${encodeURIComponent(trimmed)}`;
}

function Sparkline({ data, isPositive }: { data: number[]; isPositive: boolean }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 64;
  const height = 22;

  const points = data
    .map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const color = isPositive ? "var(--neon-green)" : "var(--neon-red)";

  return (
    <svg width={width} height={height} aria-hidden="true" style={{ overflow: "visible" }}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export function ConstituentsTable({
  basket,
  stockDetails = [],
  selectedTheme,
  indexName = "カスタム指数",
  indexId,
  onAddStock,
  onRemoveStock,
}: ConstituentsTableProps) {
  const { session, isAuthenticated, isAdmin, isUser, maxStocks, logout } = useAuth();
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("weight");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAddStockModalOpen, setIsAddStockModalOpen] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);

  const isLimitReached = isUser && maxStocks !== null && maxStocks > 0 && basket.length >= maxStocks;

  const handleAddStockClick = () => {
    if (!isAuthenticated) {
      setIsAuthModalOpen(true);
    } else {
      setIsAddStockModalOpen(true);
    }
  };

  const handleDeleteStockClick = async (ticker: string, stockName: string) => {
    if (!isAuthenticated) {
      setIsAuthModalOpen(true);
      return;
    }
    if (basket.length <= 1) {
      setTableError("構成銘柄が1件のみのため削除できません。指数には最低1銘柄必要です。");
      return;
    }
    if (!confirm(`銘柄「${stockName} (${ticker})」をこの指数から削除しますか？`)) {
      return;
    }
    if (onRemoveStock) {
      const res = await onRemoveStock(ticker);
      if (!res.ok) {
        setTableError(res.error || "銘柄の削除に失敗しました");
      } else {
        setTableError(null);
      }
    }
  };

  const handleAddStockSubmit = async (stock: BasketItem) => {
    if (onAddStock) {
      const res = await onAddStock(stock);
      if (!res.ok) {
        return res;
      }
      setTableError(null);
      return { ok: true };
    }
    return { ok: false, error: "追加ハンドラが設定されていません" };
  };

  // Merge basket and stockDetails
  const combinedList = useMemo(() => {
    const detailsMap = new Map(stockDetails.map((d) => [d.ticker, d]));
    const normalized = normalizeWeights(basket);

    return normalized.map((item) => {
      const detail = detailsMap.get(item.ticker);
      return {
        ticker: item.ticker,
        name: item.name,
        theme: item.theme || "その他",
        weight: item.weight,
        currentPrice: detail?.currentPrice ?? 0,
        change: detail?.change ?? 0,
        changePct: detail?.changePct ?? 0,
        contributionPt: detail?.contributionPt ?? 0,
        contributionPct: detail?.contributionPct ?? 0,
        sparkline: detail?.sparkline ?? [],
      };
    });
  }, [basket, stockDetails]);

  const filteredAndSorted = useMemo(() => {
    let list = [...combinedList];

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
          item.theme?.toLowerCase().includes(q),
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
      } else if (sortField === "currentPrice") {
        cmp = a.currentPrice - b.currentPrice;
      } else if (sortField === "changePct") {
        cmp = a.changePct - b.changePct;
      } else if (sortField === "contributionPt") {
        cmp = a.contributionPt - b.contributionPt;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return list;
  }, [combinedList, selectedTheme, search, sortField, sortOrder]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder(field === "weight" || field === "changePct" || field === "contributionPt" ? "desc" : "asc");
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={12} style={{ opacity: 0.35, marginLeft: 4 }} />;
    }
    return sortOrder === "asc" ? (
      <ArrowUp size={12} style={{ color: "var(--neon-cyan)", marginLeft: 4 }} />
    ) : (
      <ArrowDown size={12} style={{ color: "var(--neon-cyan)", marginLeft: 4 }} />
    );
  };

  const exportCSV = () => {
    const headers = [
      "銘柄コード",
      "銘柄名",
      "テーマ",
      "構成比率(%)",
      "最新株価(円)",
      "前日比(%)",
      "指数寄与度(pt)",
    ];
    const rows = filteredAndSorted.map((item) => [
      item.ticker,
      `"${item.name.replace(/"/g, '""')}"`,
      `"${item.theme.replace(/"/g, '""')}"`,
      item.weight.toFixed(2),
      item.currentPrice,
      item.changePct.toFixed(2),
      item.contributionPt.toFixed(2),
    ]);

    const csvContent =
      "\uFEFF" +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const safeFileName = indexName.replace(/[/\\?%*:|"<>]/g, "_").trim() || "custom_index";
    link.setAttribute("download", `${safeFileName}_constituents_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleHeaderKeyDown = (e: React.KeyboardEvent, field: SortField) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleSort(field);
    }
  };

  return (
    <Card className="section">
      <div className="row space-between flex-wrap" style={{ marginBottom: 16, gap: 12 }}>
        <div className="row" style={{ gap: 8 }}>
          <ListOrdered size={16} style={{ color: "var(--neon-cyan)" }} />
          <h2 style={{ fontSize: 15, margin: 0 }}>構成銘柄リスト & 寄与度分析</h2>
          <Tag variant="cyan" className="mono tiny">
            {filteredAndSorted.length} / {basket.length} 銘柄
          </Tag>
        </div>

        <div className="row flex-wrap" style={{ gap: 8 }}>
          <div style={{ width: "100%", maxWidth: 220 }}>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="銘柄名・コード・テーマ検索..."
            />
          </div>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={exportCSV}
            title="CSV形式でエクスポート"
          >
            <Download size={12} /> CSV
          </button>
        </div>
      </div>

      {tableError && (
        <div
          className="row"
          style={{
            gap: 8,
            padding: "10px 14px",
            background: "rgba(255, 51, 102, 0.15)",
            border: "1px solid var(--neon-red)",
            borderRadius: 8,
            color: "var(--neon-red)",
            fontSize: 12,
            marginBottom: 16,
          }}
        >
          <AlertCircle size={15} style={{ flexShrink: 0 }} />
          <span>{tableError}</span>
        </div>
      )}

      {/* Stock Edit Toolbar & Auth Indicator */}
      <div
        className="row space-between flex-wrap"
        style={{
          marginBottom: 16,
          padding: "10px 14px",
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 8,
          gap: 10,
        }}
      >
        <div className="row flex-wrap" style={{ gap: 8, alignItems: "center" }}>
          {isAuthenticated ? (
            <div className="row flex-wrap" style={{ gap: 8, alignItems: "center" }}>
              <span
                className="tag"
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  background: isAdmin ? "rgba(255, 0, 234, 0.12)" : "rgba(0, 229, 255, 0.12)",
                  color: isAdmin ? "var(--neon-magenta)" : "var(--neon-cyan)",
                  border: `1px solid ${isAdmin ? "rgba(255, 0, 234, 0.3)" : "rgba(0, 229, 255, 0.3)"}`,
                  borderRadius: 6,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {isAdmin ? <ShieldCheck size={12} /> : <KeyRound size={12} />}
                <span>{session?.name}</span>
                <span className="mono" style={{ opacity: 0.85 }}>
                  ({maxStocks ? `上限 ${maxStocks}銘柄` : "無制限"})
                </span>
              </span>

              {isUser && maxStocks && (
                <span
                  className="mono tiny"
                  style={{ color: isLimitReached ? "var(--neon-red)" : "var(--text-secondary)" }}
                >
                  登録: {basket.length} / {maxStocks} 銘柄
                </span>
              )}

              <button
                type="button"
                onClick={logout}
                className="btn btn-sm btn-outline"
                style={{ padding: "2px 6px", fontSize: 10 }}
                title="ログアウトしてロック"
              >
                <Lock size={10} /> ロック
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className="btn btn-sm btn-outline"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11 }}
            >
              <Lock size={12} /> 銘柄編集ロック中（クリックしてパスワード認証）
            </button>
          )}
        </div>

        <div className="row" style={{ gap: 8 }}>
          {onAddStock && (
            <button
              type="button"
              onClick={handleAddStockClick}
              disabled={isLimitReached}
              className="btn btn-sm btn-default"
              style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
              title={isLimitReached ? `上限 (${maxStocks}銘柄) に達しています` : "銘柄を追加"}
            >
              <Plus size={13} /> 銘柄を追加
            </button>
          )}
        </div>
      </div>

      <div className="table-wrapper">
        <table className="custom-table">
          <thead>
            <tr>
              <th
                role="columnheader"
                aria-sort={sortField === "ticker" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                tabIndex={0}
                onClick={() => toggleSort("ticker")}
                onKeyDown={(e) => handleHeaderKeyDown(e, "ticker")}
                style={{ width: "10%" }}
              >
                <span className="row" style={{ gap: 2 }}>
                  コード {renderSortIcon("ticker")}
                </span>
              </th>
              <th
                role="columnheader"
                aria-sort={sortField === "name" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                tabIndex={0}
                onClick={() => toggleSort("name")}
                onKeyDown={(e) => handleHeaderKeyDown(e, "name")}
                style={{ width: "22%" }}
              >
                <span className="row" style={{ gap: 2 }}>
                  銘柄名 {renderSortIcon("name")}
                </span>
              </th>
              <th
                role="columnheader"
                aria-sort={sortField === "theme" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                tabIndex={0}
                onClick={() => toggleSort("theme")}
                onKeyDown={(e) => handleHeaderKeyDown(e, "theme")}
                style={{ width: "14%" }}
              >
                <span className="row" style={{ gap: 2 }}>
                  テーマ {renderSortIcon("theme")}
                </span>
              </th>
              <th
                role="columnheader"
                aria-sort={sortField === "currentPrice" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                tabIndex={0}
                onClick={() => toggleSort("currentPrice")}
                onKeyDown={(e) => handleHeaderKeyDown(e, "currentPrice")}
                style={{ width: "12%", textAlign: "right" }}
              >
                <span className="row" style={{ gap: 2, justifyContent: "flex-end" }}>
                  株価 {renderSortIcon("currentPrice")}
                </span>
              </th>
              <th
                role="columnheader"
                aria-sort={sortField === "changePct" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                tabIndex={0}
                onClick={() => toggleSort("changePct")}
                onKeyDown={(e) => handleHeaderKeyDown(e, "changePct")}
                style={{ width: "12%", textAlign: "right" }}
              >
                <span className="row" style={{ gap: 2, justifyContent: "flex-end" }}>
                  前日比 {renderSortIcon("changePct")}
                </span>
              </th>
              <th style={{ width: "10%", textAlign: "center" }}>トレンド</th>
              <th
                role="columnheader"
                aria-sort={sortField === "contributionPt" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                tabIndex={0}
                onClick={() => toggleSort("contributionPt")}
                onKeyDown={(e) => handleHeaderKeyDown(e, "contributionPt")}
                style={{ width: "10%", textAlign: "right" }}
              >
                <span className="row" style={{ gap: 2, justifyContent: "flex-end" }}>
                  寄与度 {renderSortIcon("contributionPt")}
                </span>
              </th>
              <th
                role="columnheader"
                aria-sort={sortField === "weight" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                tabIndex={0}
                onClick={() => toggleSort("weight")}
                onKeyDown={(e) => handleHeaderKeyDown(e, "weight")}
                style={{ width: "10%", textAlign: "right" }}
              >
                <span className="row" style={{ gap: 2, justifyContent: "flex-end" }}>
                  比率 {renderSortIcon("weight")}
                </span>
              </th>
              {onRemoveStock && (
                <th style={{ width: "6%", textAlign: "center" }}>操作</th>
              )}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout">
              {filteredAndSorted.length > 0 ? (
                filteredAndSorted.map((item) => {
                  const isUp = item.changePct > 0;
                  const isDown = item.changePct < 0;
                  return (
                    <tr key={item.ticker}>
                      <td>
                        <a
                          href={getYahooFinanceUrl(item.ticker)}
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
                          {item.theme}
                        </Tag>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span className="mono bold" style={{ fontSize: 12 }}>
                          {item.currentPrice > 0 ? `¥${item.currentPrice.toLocaleString()}` : "---"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span
                          className="mono bold row"
                          style={{
                            justifyContent: "flex-end",
                            gap: 2,
                            color: isUp ? "var(--neon-green)" : isDown ? "var(--neon-red)" : "inherit",
                          }}
                        >
                          {isUp && <TrendingUp size={11} />}
                          {isDown && <TrendingDown size={11} />}
                          {item.changePct >= 0 ? "+" : ""}
                          {item.changePct.toFixed(2)}%
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <Sparkline data={item.sparkline} isPositive={item.changePct >= 0} />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span
                          className="mono bold"
                          style={{
                            color:
                              item.contributionPt > 0
                                ? "var(--neon-green)"
                                : item.contributionPt < 0
                                  ? "var(--neon-red)"
                                  : "inherit",
                          }}
                        >
                          {item.contributionPt >= 0 ? "+" : ""}
                          {item.contributionPt.toFixed(2)}pt
                        </span>
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
                      {onRemoveStock && (
                        <td style={{ textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={() => handleDeleteStockClick(item.ticker, item.name)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "var(--neon-red)",
                              cursor: "pointer",
                              padding: 4,
                              opacity: 0.8,
                            }}
                            title={isAuthenticated ? `銘柄「${item.name}」を削除` : "削除するにはパスワード認証が必要です"}
                            aria-label={`銘柄「${item.name}」を削除`}
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={onRemoveStock ? 9 : 8} style={{ textAlign: "center", padding: "32px 16px" }}>
                    <span className="muted mono tiny">該当する銘柄が見つかりません</span>
                  </td>
                </tr>
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={() => {
          setIsAddStockModalOpen(true);
        }}
      />

      {/* Add Stock Modal */}
      {onAddStock && (
        <AddStockModal
          isOpen={isAddStockModalOpen}
          onClose={() => setIsAddStockModalOpen(false)}
          indexName={indexName}
          currentCount={basket.length}
          maxStocks={maxStocks}
          onAddStock={handleAddStockSubmit}
        />
      )}
    </Card>
  );
}
