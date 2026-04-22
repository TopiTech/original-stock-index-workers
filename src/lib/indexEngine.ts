import type { BasketItem, StockSeries } from "../types";

export function normalizeWeights(items: BasketItem[]) {
  const total = items.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  if (total <= 0) return items;
  return items.map((item) => ({
    ...item,
    weight: Number(((item.weight / total) * 100).toFixed(4)),
  }));
}

export function calculateCustomIndex(basket: BasketItem[], stockUniverse: StockSeries[], baseValue = 1000) {
  const normalized = normalizeWeights(basket);
  const selected = normalized
    .map((item) => {
      const stock = stockUniverse.find((s) => s.ticker === item.ticker);
      return stock && stock.series.length > 0 ? { ...stock, weight: item.weight } : null;
    })
    .filter((stock): stock is StockSeries & { weight: number } => Boolean(stock));

  if (selected.length === 0) return [];

  const firstSeries = selected[0].series;
  const commonDates = firstSeries
    .map((point) => point.date)
    .filter((date) => selected.every((stock) => stock.series.some((p) => p.date === date)));

  if (commonDates.length === 0) return [];

  const firstDayValues = selected.map((stock) => {
    const firstPoint = stock.series.find((p) => p.date === commonDates[0]);
    return firstPoint?.close ?? 0;
  });

  if (firstDayValues.some((value) => value === 0)) return [];

  return commonDates.map((date) => {
    const weightedRelative = selected.reduce((sum, stock, stockIndex) => {
      const start = firstDayValues[stockIndex];
      const currentPoint = stock.series.find((p) => p.date === date);
      const current = currentPoint?.close ?? 0;
      return sum + (current / start) * (stock.weight / 100);
    }, 0);

    return { date, value: Number((baseValue * weightedRelative).toFixed(2)) };
  });
}

export function searchStocks(query: string, stockUniverse: StockSeries[]) {
  const q = query.trim().toLowerCase();
  if (!q) return stockUniverse.slice(0, 8);
  return stockUniverse.filter((stock) =>
    `${stock.ticker} ${stock.name} ${stock.theme} ${stock.sector}`.toLowerCase().includes(q)
  );
}
