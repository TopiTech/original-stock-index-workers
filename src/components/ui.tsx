import type { PropsWithChildren, ReactNode } from "react";

export function Card({ children, className = "", style = {} }: PropsWithChildren<{ className?: string, style?: React.CSSProperties }>) {
  return <div className={`card ${className}`} style={style}>{children}</div>;
}

export function Button({ children, className = "", variant = "default", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "outline" }) {
  return (
    <button {...props} className={`btn ${variant === "outline" ? "btn-outline" : "btn-default"} ${className}`}>
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className || ""}`} />;
}

export function Pill({ children }: PropsWithChildren) {
  return <span className="pill">{children}</span>;
}

export function Stat({ label, value, icon }: { label: string; value: ReactNode; icon?: ReactNode }) {
  return (
    <div className="stat">
      <div>
        <div className="muted tiny uppercase">{label}</div>
        <div className="stat-value">{value}</div>
      </div>
      {icon ? <div className="stat-icon">{icon}</div> : null}
    </div>
  );
}
