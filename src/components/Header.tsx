import { motion } from "framer-motion";
import { Database, Wifi } from "lucide-react";

export function Header() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="hero"
    >
      <div className="row space-between" style={{ marginBottom: 12 }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="badge badge-cyan">
            <Database size={10} />
            D1_SYNC
          </span>
          <span className="badge badge-magenta">
            <Wifi size={10} />
            LIVE_FEED
          </span>
        </div>
        <div className="muted tiny mono" style={{ letterSpacing: 2, opacity: 0.6 }}>
          v2.0.0 — CLOUDFLARE_EDGE
        </div>
      </div>

      <h1 style={{ margin: 0, fontSize: "clamp(28px, 4vw, 40px)" }}>
        ORIGINAL INDEX TRACKER
      </h1>
      <p className="muted" style={{ marginTop: 12, fontSize: 14, maxWidth: 720, lineHeight: 1.6 }}>
        独自指数共有プラットフォーム。あなたの投資戦略を、客観的な「指標」へ昇華する。
        個人のポートフォリオや特定のテーマをカスタム指数として定義・共有し、
        パフォーマンスをリアルタイムで可視化します。
      </p>
    </motion.header>
  );
}
