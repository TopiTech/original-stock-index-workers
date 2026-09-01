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

  const sortedNikkei = [...nikkeiSeries].sort((a, b) => a.date.localeCompare(b.date));
  const sortedCustom = [...customSeries].sort((a, b) => a.date.localeCompare(b.date));

  // Filter customSeries to start from the benchmark start date to avoid flat dummy lines
  // when customSeries has older historical data than nikkeiSeries.
  const minNikkeiDate = sortedNikkei[0]?.date;
  const alignedCustom = minNikkeiDate
    ? sortedCustom.filter((p) => p.date >= minNikkeiDate)
    : sortedCustom;

  if (alignedCustom.length === 0) return [];

  const nikkeiMap = new Map(sortedNikkei.map((p) => [p.date, p.close]));

  // Find the benchmark baseline price corresponding to the first date of alignedCustom
  const startDate = alignedCustom[0]?.date;
  const nikkeiAtStart = startDate ? nikkeiMap.get(startDate) : undefined;
  const firstNikkei = nikkeiAtStart && nikkeiAtStart > 0
    ? nikkeiAtStart
    : (sortedNikkei[0]?.close && sortedNikkei[0].close > 0 ? sortedNikkei[0].close : safeBase);

  let lastKnownClose: number = firstNikkei;
  return alignedCustom.map((point) => {
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
