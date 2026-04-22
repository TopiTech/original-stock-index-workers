import type { PricePoint, Snapshot } from "../types";

export const nikkeiSeries: PricePoint[] = [
  { date: "03/24", close: 52252.28 },
  { date: "03/25", close: 53749.62 },
  { date: "03/26", close: 53603.65 },
  { date: "03/27", close: 53373.07 },
  { date: "03/30", close: 51885.85 },
  { date: "03/31", close: 51063.72 },
  { date: "04/01", close: 53739.68 },
  { date: "04/02", close: 52463.27 },
  { date: "04/03", close: 53123.49 },
  { date: "04/06", close: 53413.68 },
  { date: "04/07", close: 53429.56 },
  { date: "04/08", close: 56308.42 },
  { date: "04/09", close: 55895.32 },
  { date: "04/10", close: 56924.11 },
  { date: "04/13", close: 56502.77 },
  { date: "04/14", close: 57877.39 },
  { date: "04/15", close: 58134.24 },
  { date: "04/16", close: 59518.34 },
  { date: "04/17", close: 58475.90 },
  { date: "04/20", close: 58824.89 }
];

export const nikkeiSnapshot: Snapshot = {
  label: "日経225",
  current: 58824.89,
  change: 348.99,
  changePct: 0.60,
  open: 58821.16,
  high: 59169.13,
  low: 58687.96,
  updatedAt: "2026/04/20 15:45 JST",
  description: "東証プライム市場の225銘柄で構成される価格加重型指数。日本株を代表するベンチマークです。"
};
