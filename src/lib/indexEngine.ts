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

  // 全銘柄から存在する全日付を抽出してソート
  const allDates = Array.from(new Set(
    selected.flatMap(stock => stock.series.map(p => p.date))
  )).sort();

  if (allDates.length === 0) return [];

  // 各銘柄の各日付における価格をマッピング（データがない場合は前の日の価格を使用：フォワードフィル）
  const stockPriceMatrix = selected.map(stock => {
    const priceMap = new Map(stock.series.map(p => [p.date, p.close]));
    let lastPrice = 0;
    
    return allDates.map(date => {
      const price = priceMap.get(date);
      if (price !== undefined && price > 0) {
        lastPrice = price;
        return price;
      }
      return lastPrice; // 前日の価格を流用
    });
  });

  // 基準日の価格（全銘柄の最初の有効な価格）を取得
  const basePrices = stockPriceMatrix.map(prices => {
    return prices.find(p => p > 0) || 0;
  });

  // いずれかの銘柄で一度も価格が取れなかった場合は計算不可
  if (basePrices.some(bp => bp === 0)) return [];

  return allDates.map((date, dateIndex) => {
    const weightedRelative = selected.reduce((sum, stock, stockIndex) => {
      const start = basePrices[stockIndex];
      const current = stockPriceMatrix[stockIndex][dateIndex];
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
