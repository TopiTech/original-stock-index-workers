import type { PricePoint } from "../types";

export type ChartPoint = {
  date: string;
  value: number;
  nikkei: number;
  close: number;
};

export function buildChartData(
  nikkeiSeries: PricePoint[],
  customSeries: PricePoint[],
  baseValue: number,
): ChartPoint[] {
  if (nikkeiSeries.length === 0 || customSeries.length === 0) return [];
  const safeBase = typeof baseValue === "number" && Number.isFinite(baseValue) && baseValue > 0 ? baseValue : 1000;

  const nikkeiMap = new Map(nikkeiSeries.map((p) => [p.date, p.close]));

  // Find the benchmark baseline price corresponding to the first date of customSeries
  const startDate = customSeries[0]?.date;
  const nikkeiAtStart = startDate ? nikkeiMap.get(startDate) : undefined;
  const firstNikkei = nikkeiAtStart && nikkeiAtStart > 0
    ? nikkeiAtStart
    : (nikkeiSeries[0]?.close && nikkeiSeries[0].close > 0 ? nikkeiSeries[0].close : safeBase);

  let lastKnownClose: number = firstNikkei;
  return customSeries.map((point) => {
    const nikkeiClose = nikkeiMap.get(point.date);
    if (nikkeiClose !== undefined && nikkeiClose > 0) {
      lastKnownClose = nikkeiClose;
    }
    const nikkeiPoint = nikkeiClose && nikkeiClose > 0 ? nikkeiClose : lastKnownClose;
    const customVal = point.value ?? point.close ?? safeBase;

    return {
      date: point.date,
      value: customVal,
      close: customVal,
      nikkei: Number((safeBase * (nikkeiPoint / firstNikkei)).toFixed(2)),
    };
  });
}
