import { Sun, Moon } from "lucide-react";
import { useTheme, ACCENT_OPTIONS } from "../lib/theme";

export function ThemeControls() {
  const { theme, accent, toggleTheme, setAccent } = useTheme();

  return (
    <div className="theme-controls row" style={{ gap: 8, alignItems: "center" }}>
      {/* Dark / Light Mode Toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        className="btn btn-sm btn-outline theme-toggle-btn"
        title={theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"}
        aria-label={theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"}
        style={{
          padding: "5px 9px",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          minHeight: 32,
        }}
      >
        {theme === "dark" ? (
          <>
            <Sun size={14} style={{ color: "var(--neon-yellow)" }} />
            <span className="theme-toggle-label">LIGHT</span>
          </>
        ) : (
          <>
            <Moon size={14} style={{ color: "var(--neon-cyan)" }} />
            <span className="theme-toggle-label">DARK</span>
          </>
        )}
      </button>

      {/* Accent Color Palette Picker */}
      <div
        className="accent-picker row"
        style={{
          gap: 5,
          padding: "4px 7px",
          background: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 8,
          alignItems: "center",
        }}
        role="radiogroup"
        aria-label="アクセントカラーの選択"
      >
        {ACCENT_OPTIONS.map((opt) => {
          const isSelected = accent === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              title={`アクセント: ${opt.label}`}
              aria-label={`アクセントカラーを${opt.label}に変更`}
              onClick={() => setAccent(opt.key)}
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: opt.color,
                border: isSelected ? "2px solid #ffffff" : "2px solid transparent",
                boxShadow: isSelected ? `0 0 10px ${opt.color}` : "none",
                cursor: "pointer",
                padding: 0,
                transform: isSelected ? "scale(1.15)" : "scale(1)",
                transition: "all 0.15s ease",
                outline: "none",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
