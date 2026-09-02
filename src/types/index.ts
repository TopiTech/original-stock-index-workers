export type PricePoint = {
  date: string;
  close: number;
  value?: number; // 独自指数の計算結果用
};

export type StockSeries = {
  ticker: string;
  name: string;
  theme: string;
  sector: string;
  latestPrice: number;
  series: PricePoint[];
};

export type BasketItem = {
  ticker: string;
  name: string;
  theme: string;
  weight: number;
};

export type StockDetail = {
  ticker: string;
  name: string;
  theme: string;
  weight: number;
  currentPrice: number;
  previousPrice: number;
  change: number;
  changePct: number;
  contributionPt: number;
  contributionPct: number;
  sparkline: number[];
};

export type Snapshot = {
  label: string;
  current: number;
  change: number;
  changePct: number;
  updatedAt: string;
  description: string;
  symbol?: string;
};

export type Timeframe = "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y";

export type BenchmarkSymbol = "^N225" | "^GSPC" | "USDJPY=X";

export interface BenchmarkOption {
  symbol: BenchmarkSymbol;
  label: string;
  shortLabel: string;
  currency: string;
}

export interface RiskMetrics {
  annualReturn: number;
  annualVolatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
  beta: number;
  winRate: number;
  bestDay: number;
  worstDay: number;
}

