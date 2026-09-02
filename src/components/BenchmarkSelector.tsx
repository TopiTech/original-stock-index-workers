import type { BenchmarkOption, BenchmarkSymbol } from "../types";

interface BenchmarkSelectorProps {
  benchmarks: BenchmarkOption[];
  selectedBenchmark: BenchmarkSymbol;
  onSelectBenchmark: (symbol: BenchmarkSymbol) => void;
  loading?: boolean;
}

export function BenchmarkSelector({
  benchmarks,
  selectedBenchmark,
  onSelectBenchmark,
  loading = false,
}: BenchmarkSelectorProps) {
  return (
    <div className="row flex-wrap" style={{ gap: 6, alignItems: "center" }}>
      <span className="mono tiny muted uppercase" style={{ marginRight: 4 }}>
        比較ベンチマーク:
      </span>
      <div className="btn-group">
        {benchmarks.map((b) => {
          const isActive = selectedBenchmark === b.symbol;
          return (
            <button
              key={b.symbol}
              type="button"
              disabled={loading}
              className={`btn-group-item ${isActive ? "active" : ""}`}
              onClick={() => onSelectBenchmark(b.symbol)}
              style={{
                fontSize: 11,
                padding: "4px 10px",
                opacity: loading ? 0.6 : 1,
              }}
              title={b.label}
            >
              {b.shortLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}
