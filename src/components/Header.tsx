import { motion } from "framer-motion";
import { TrendingUp, Shield, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { Badge } from "./ui";
import { useAuth } from "../hooks/useAuth";
import { ThemeControls } from "./ThemeControls";
import { DataFreshness } from "./DataFreshness";

interface HeaderProps {
  onNavigateToAdmin?: () => void;
  benchmarkUpdatedAt?: number | null;
  calculationUpdatedAt?: number | null;
  dataLoading?: boolean;
  syncing?: boolean;
}

export function Header({
  onNavigateToAdmin,
  benchmarkUpdatedAt,
  calculationUpdatedAt,
  dataLoading = false,
  syncing = false,
}: HeaderProps) {
  const { session, isAuthenticated, isAdmin, isUser, maxStocks, maxIndices, logout } = useAuth();

  const limitsText = isUser && (maxStocks || maxIndices)
    ? `(${[maxStocks ? `${maxStocks}銘柄` : "", maxIndices ? `${maxIndices}指数` : ""].filter(Boolean).join(" / ")}上限)`
    : "";

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="top-header"
    >
      <div className="row space-between flex-wrap" style={{ gap: 12, alignItems: "center" }}>
        <div className="header-brand row" style={{ gap: 10, alignItems: "center" }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 6,
              background: "linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)",
              border: "1px solid var(--border-cyan)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--neon-cyan)",
            }}
            aria-hidden="true"
          >
            <TrendingUp size={16} strokeWidth={2.2} />
          </div>
          <div>
            <h1 style={{ fontSize: "clamp(1.1rem, 2vw, 1.35rem)", margin: 0 }}>
              ORIGINAL INDEX TRACKER
            </h1>
            <p className="muted header-desc" style={{ margin: 0, fontSize: 11, lineHeight: 1.2 }}>
              独自投資戦略・テーマ別ポートフォリオの客観的株価指数化プラットフォーム
            </p>
          </div>
        </div>

        <div className="header-meta row flex-wrap" style={{ gap: 8, alignItems: "center" }}>
          <DataFreshness
            benchmarkUpdatedAt={benchmarkUpdatedAt}
            calculationUpdatedAt={calculationUpdatedAt}
            loading={dataLoading}
            syncing={syncing}
          />

          {/* Theme & Accent Controls */}
          <ThemeControls />

          {/* Auth status indicator */}
          {isAuthenticated ? (
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <Badge variant={isAdmin ? "magenta" : "cyan"}>
                {isAdmin ? <ShieldCheck size={11} /> : <KeyRound size={11} />}
                {session?.name} {limitsText}
              </Badge>
              <button
                type="button"
                onClick={logout}
                className="btn btn-sm btn-outline"
                style={{ padding: "4px 8px", fontSize: 11 }}
                aria-label="ログアウト"
              >
                ログアウト
              </button>
            </div>
          ) : (
            <Badge variant="muted">
              <Lock size={11} />
              未認証 (閲覧モード)
            </Badge>
          )}

          {/* Admin Page button */}
          {onNavigateToAdmin && (
            <button
              type="button"
              onClick={onNavigateToAdmin}
              className="btn btn-sm btn-outline admin-nav-btn"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 9px",
                fontSize: 11,
              }}
            >
              <Shield size={12} />
              管理者ページ
            </button>
          )}
        </div>
      </div>
    </motion.header>
  );
}
