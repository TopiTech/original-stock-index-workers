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
    <div className="benchmark-selector row flex-wrap">
      <span className="benchmark-selector-label mono tiny muted uppercase">
        比較ベンチマーク:
      </span>
      <div className="btn-group benchmark-options" role="group" aria-label="比較ベンチマーク">
        {benchmarks.map((b) => {
          const isActive = selectedBenchmark === b.symbol;
          return (
            <button
              key={b.symbol}
              type="button"
              disabled={loading}
              className={`btn-group-item ${isActive ? "active" : ""}`}
              aria-pressed={isActive}
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
