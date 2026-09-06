import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
  compact?: boolean;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon = <Inbox size={22} />,
  compact = false,
}: EmptyStateProps) {
  return (
    <div className={`empty-state ${compact ? "empty-state-compact" : ""}`} role="status">
      <div className="empty-state-icon" aria-hidden="true">
        {icon}
      </div>
      <div className="empty-state-copy">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {actionLabel && onAction && (
        <button type="button" className="btn btn-sm btn-default" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
