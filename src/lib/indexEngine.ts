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
    // この日付で有効なデータ（価格 > 0 かつ 基準価格が存在する）を持つ銘柄を抽出
    const availableStocks = selected.filter((_, stockIndex) => {
      const price = stockPriceMatrix[stockIndex][dateIndex];
      const start = basePrices[stockIndex];
      return price > 0 && start > 0;
    });

    if (availableStocks.length === 0) {
      return { date, value: baseValue };
    }

    // 利用可能な銘柄の合計ウェイトを計算して再正規化
    const totalWeightOfAvailable = availableStocks.reduce((sum, s) => sum + s.weight, 0);

    const weightedRelative = availableStocks.reduce((sum, stock) => {
      const stockIndex = selected.findIndex(s => s.ticker === stock.ticker);
      const start = basePrices[stockIndex];
      const current = stockPriceMatrix[stockIndex][dateIndex];
      
      // ウェイトを再正規化して適用
      const normalizedWeight = stock.weight / totalWeightOfAvailable;
      return sum + (current / start) * normalizedWeight;
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
