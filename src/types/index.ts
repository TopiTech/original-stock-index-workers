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

export type Snapshot = {
  label: string;
  current: number;
  change: number;
  changePct: number;
  open: number;
  high: number;
  low: number;
  updatedAt: string;
  description: string;
};
