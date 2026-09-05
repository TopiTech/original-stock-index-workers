import { motion } from "framer-motion";
import { Database, Wifi, Shield, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { Badge } from "./ui";
import { useAuth } from "../hooks/useAuth";
import { ThemeControls } from "./ThemeControls";

interface HeaderProps {
  onNavigateToAdmin?: () => void;
}

export function Header({ onNavigateToAdmin }: HeaderProps) {
  const { session, isAuthenticated, isAdmin, isUser, maxStocks, maxIndices, logout } = useAuth();

  const limitsText = isUser && (maxStocks || maxIndices)
    ? `(${[maxStocks ? `${maxStocks}銘柄` : "", maxIndices ? `${maxIndices}指数` : ""].filter(Boolean).join(" / ")}上限)`
    : "";

  return (
    <motion.header
      initial={{ opacity: 0, y: -15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="top-header"
    >
      <div className="row space-between flex-wrap" style={{ gap: 16 }}>
        <div className="header-brand">
          <div className="row" style={{ gap: 10, marginBottom: 6 }}>
            <div className="pulse-dot green" />
            <span className="mono tiny uppercase" style={{ color: "var(--neon-cyan)", letterSpacing: 2 }}>
              FINANCIAL TERMINAL // CLOUDFLARE EDGE
            </span>
          </div>
          <h1>ORIGINAL INDEX TRACKER</h1>
          <p className="muted header-desc" style={{ margin: "6px 0 0", fontSize: 13, maxWidth: 680, lineHeight: 1.5 }}>
            独自投資戦略・テーマ別ポートフォリオの客観的株価指数化プラットフォーム。
            日経225とのリアルタイム・パフォーマンス比較・銘柄配分分析。
          </p>
        </div>

        <div className="header-meta row flex-wrap" style={{ gap: 10, alignItems: "center" }}>
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
                gap: 6,
                borderColor: "var(--border-cyan)",
                color: "var(--neon-cyan)",
              }}
            >
              <Shield size={13} />
              管理者ページ
            </button>
          )}

          <div className="header-badges row" style={{ gap: 6 }}>
            <Badge variant="cyan">
              <Database size={11} />
              D1 ENGINE
            </Badge>
            <Badge variant="green">
              <Wifi size={11} />
              LIVE FEED
            </Badge>
          </div>
        </div>
      </div>
    </motion.header>
  );
}

