import { motion } from "framer-motion";
import { Database, Wifi, Activity, Cpu } from "lucide-react";
import { Badge } from "./ui";

export function Header() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="top-header"
    >
      <div className="row space-between flex-wrap" style={{ gap: 16 }}>
        <div>
          <div className="row" style={{ gap: 10, marginBottom: 6 }}>
            <div className="pulse-dot green" />
            <span className="mono tiny uppercase" style={{ color: "var(--neon-cyan)", letterSpacing: 2 }}>
              FINANCIAL TERMINAL // CLOUDFLARE EDGE
            </span>
          </div>
          <h1>ORIGINAL INDEX TRACKER</h1>
          <p className="muted" style={{ margin: "6px 0 0", fontSize: 13, maxWidth: 680, lineHeight: 1.5 }}>
            独自投資戦略・テーマ別ポートフォリオの客観的株価指数化プラットフォーム。
            日経225とのリアルタイム・パフォーマンス比較・銘柄配分分析。
          </p>
        </div>

        <div className="header-meta">
          <Badge variant="cyan">
            <Database size={11} />
            D1 ENGINE
          </Badge>
          <Badge variant="green">
            <Wifi size={11} />
            LIVE FEED
          </Badge>
          <Badge variant="magenta">
            <Cpu size={11} />
            WORKERS v2.0
          </Badge>
        </div>
      </div>
    </motion.header>
  );
}

