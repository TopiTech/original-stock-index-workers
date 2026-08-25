import type { PricePoint } from "../types";

export type ChartPoint = {
  date: string;
  close: number;
  value: number;
  nikkei: number;
};

export function buildChartData(
  nikkeiSeries: PricePoint[],
  customSeries: PricePoint[],
  baseValue: number,
): ChartPoint[] {
  if (nikkeiSeries.length === 0 || customSeries.length === 0) return [];
  const nikkeiMap = new Map(nikkeiSeries.map((p) => [p.date, p.close]));
  const firstNikkei = nikkeiSeries[0]?.close ?? baseValue;
  let lastKnownClose: number | null = null;
  return customSeries.map((point) => {
    const nikkeiClose = nikkeiMap.get(point.date);
    if (nikkeiClose !== undefined) lastKnownClose = nikkeiClose;
    const nikkeiPoint = nikkeiClose ?? lastKnownClose ?? firstNikkei;
    return {
      date: point.date,
      close: point.close,
      value: point.value ?? 0,
      nikkei: Number((baseValue * (nikkeiPoint / firstNikkei)).toFixed(2)),
    };
  });
}
