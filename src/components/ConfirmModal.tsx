import { useRef } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, AlertCircle, X } from "lucide-react";
import { useModalFocus } from "../hooks/useModalFocus";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "primary" | "warning";
  loading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "実行する",
  cancelText = "キャンセル",
  variant = "danger",
  loading = false,
}: ConfirmModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const handleClose = () => {
    if (!loading) onClose();
  };
  useModalFocus(isOpen, dialogRef, handleClose, confirmBtnRef);

  if (!isOpen) return null;

  const isDanger = variant === "danger";

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--surface-overlay)",
        backdropFilter: "blur(8px)",
        padding: 16,
      }}
    >
      <motion.div
        className="modal-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-description"
        data-modal-dialog
        ref={dialogRef}
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        style={{
          width: "100%",
          maxWidth: 420,
          backgroundColor: "var(--bg-surface)",
          border: `1px solid ${isDanger ? "var(--neon-red)" : "var(--border-cyan)"}`,
          borderRadius: 14,
          boxShadow: isDanger
            ? "0 20px 60px rgba(0,0,0,0.8), 0 0 25px rgba(244, 63, 94, 0.2)"
            : "0 20px 60px rgba(0,0,0,0.8), 0 0 25px rgba(6, 182, 212, 0.2)",
          overflow: "hidden",
        }}
      >
        <div
          className="row space-between"
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-subtle)",
            background: isDanger
              ? "linear-gradient(90deg, rgba(244, 63, 94, 0.1), transparent)"
              : "linear-gradient(90deg, rgba(6, 182, 212, 0.1), transparent)",
          }}
        >
          <div className="row" style={{ gap: 8 }}>
            {isDanger ? (
              <AlertTriangle size={18} style={{ color: "var(--neon-red)" }} />
            ) : (
              <AlertCircle size={18} style={{ color: "var(--neon-cyan)" }} />
            )}
            <h2 id="confirm-modal-title" style={{ fontSize: 16, margin: 0, fontWeight: 700 }}>
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            aria-label="閉じる"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "20px 22px" }}>
          <p
            id="confirm-modal-description"
            style={{
              fontSize: 13,
              marginTop: 0,
              marginBottom: 20,
              lineHeight: 1.6,
              color: "var(--text-primary)",
              whiteSpace: "pre-line",
            }}
          >
            {description}
          </p>

          <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={handleClose}
              disabled={loading}
            >
              {cancelText}
            </button>
            <button
              ref={confirmBtnRef}
              type="button"
              className={`btn btn-sm ${isDanger ? "btn-danger" : "btn-default"}`}
              onClick={async () => {
                await onConfirm();
              }}
              disabled={loading}
              style={{
                background: isDanger ? "var(--neon-red)" : undefined,
                color: isDanger ? "#ffffff" : undefined,
                border: "none",
              }}
            >
              {loading ? "処理中..." : confirmText}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
