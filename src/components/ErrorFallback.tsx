import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Card } from "./ui";

interface ErrorFallbackProps {
  error: string;
  onRetry?: () => void;
}

export function ErrorFallback({ error, onRetry }: ErrorFallbackProps) {
  return (
    <div
      className="app"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        padding: 24,
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        style={{ width: "100%", maxWidth: 480 }}
      >
        <Card
          className="section"
          style={{ textAlign: "center", borderColor: "var(--neon-red)" }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "rgba(255, 0, 68, 0.1)",
              border: "1px solid var(--neon-red)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
              color: "var(--neon-red)",
            }}
          >
            <AlertTriangle size={28} />
          </div>
          <h2 style={{ color: "var(--neon-red)", marginBottom: 12 }}>システムエラー</h2>
          <p className="muted" style={{ marginBottom: 24, lineHeight: 1.6 }}>
            {error}
          </p>
          <div className="row" style={{ justifyContent: "center", gap: 12 }}>
            {onRetry && (
              <button className="btn btn-default" onClick={onRetry}>
                <RefreshCw size={14} style={{ marginRight: 6 }} />
                再試行
              </button>
            )}
            <button className="btn btn-outline" onClick={() => window.location.reload()}>
              ページを更新
            </button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
