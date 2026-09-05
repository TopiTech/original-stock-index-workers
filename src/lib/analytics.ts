import type { BasketItem, PricePoint, RiskMetrics, StockDetail, StockSeries } from "../types";
import { normalizeWeights } from "./indexEngine";

/**
 * 単純移動平均線 (SMA) を計算
 */
export function calculateSMA(data: number[], window: number): (number | null)[] {
  if (window <= 0 || data.length === 0) return data.map(() => null);
  const result: (number | null)[] = [];
  let sum = 0;

  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (i >= window) {
      sum -= data[i - window];
    }
    if (i >= window - 1) {
      result.push(Number((sum / window).toFixed(2)));
    } else {
      result.push(null);
    }
  }

  return result;
}

/**
 * 指数系列とベンチマーク系列からクオンツ・リスク指標を算出
 */
export function calculateRiskMetrics(
  customSeries: PricePoint[],
  benchmarkSeries: PricePoint[],
  riskFreeRate = 0.005, // 0.5% (日本国債等想定)
): RiskMetrics {
  const defaultMetrics: RiskMetrics = {
    annualReturn: 0,
    annualVolatility: 0,
    sharpeRatio: 0,
    maxDrawdown: 0,
    beta: 1.0,
    winRate: 0,
    bestDay: 0,
    worstDay: 0,
  };

  if (!customSeries || customSeries.length < 2) {
    return defaultMetrics;
  }

  // 1. 日次リターン配列の計算
  const customReturns: number[] = [];
  for (let i = 1; i < customSeries.length; i++) {
    const prev = customSeries[i - 1].value ?? customSeries[i - 1].close;
    const curr = customSeries[i].value ?? customSeries[i].close;
    if (prev > 0) {
      customReturns.push((curr - prev) / prev);
    }
  }

  if (customReturns.length === 0) return defaultMetrics;

  // 2. 期間リターンと年率換算リターン
  const startVal = customSeries[0].value ?? customSeries[0].close;
  const endVal = customSeries[customSeries.length - 1].value ?? customSeries[customSeries.length - 1].close;
  const totalReturn = startVal > 0 ? (endVal - startVal) / startVal : 0;
  
  // 年率換算 (CAGR: Compound Annual Growth Rate, 250営業日基準)
  const annualFactor = 250 / customReturns.length;
  const annualReturn = (Math.pow(1 + totalReturn, annualFactor) - 1) * 100;

  // 3. 年率ボラティリティ (標準偏差 * sqrt(250))
  const meanReturn = customReturns.reduce((sum, r) => sum + r, 0) / customReturns.length;
  const variance = customReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (customReturns.length - 1 || 1);
  const dailyVol = Math.sqrt(variance);
  const annualVolatility = dailyVol * Math.sqrt(250) * 100;

  // 4. シャープレシオ
  const excessReturn = (annualReturn / 100) - riskFreeRate;
  const volFraction = annualVolatility / 100;
  const sharpeRatio = volFraction > 0 ? Number((excessReturn / volFraction).toFixed(2)) : 0;

  // 5. 最大ドローダウン (MDD)
  let peak = -Infinity;
  let maxDrawdown = 0;
  for (const pt of customSeries) {
    const rawVal = pt.value ?? pt.close;
    const val = typeof rawVal === "number" && Number.isFinite(rawVal) && rawVal > 0 ? rawVal : 0;
    if (val > 0) {
      if (val > peak) {
        peak = val;
      }
      if (peak > 0) {
        const dd = ((peak - val) / peak) * 100;
        if (dd > maxDrawdown) {
          maxDrawdown = dd;
        }
      }
    }
  }

  // 6. ベータ値 (対ベンチマーク)
  let beta = 1.0;
  if (benchmarkSeries && benchmarkSeries.length >= 2) {
    const benchMap = new Map(benchmarkSeries.map((p) => [p.date, p.close]));
    const pairedReturns: { custom: number; bench: number }[] = [];

    for (let i = 1; i < customSeries.length; i++) {
      const prevDate = customSeries[i - 1].date;
      const currDate = customSeries[i].date;
      const prevC = customSeries[i - 1].value ?? customSeries[i - 1].close;
      const currC = customSeries[i].value ?? customSeries[i].close;

      const prevB = benchMap.get(prevDate);
      const currB = benchMap.get(currDate);

      if (prevC > 0 && prevB !== undefined && currB !== undefined && prevB > 0) {
        pairedReturns.push({
          custom: (currC - prevC) / prevC,
          bench: (currB - prevB) / prevB,
        });
      }
    }

    if (pairedReturns.length > 2) {
      const bMean = pairedReturns.reduce((s, p) => s + p.bench, 0) / pairedReturns.length;
      const cMean = pairedReturns.reduce((s, p) => s + p.custom, 0) / pairedReturns.length;

      let cov = 0;
      let bVar = 0;
      for (const p of pairedReturns) {
        cov += (p.custom - cMean) * (p.bench - bMean);
        bVar += Math.pow(p.bench - bMean, 2);
      }

      if (bVar > 0) {
        beta = Number((cov / bVar).toFixed(2));
      }
    }
  }

  // 7. 勝率・ベスト/ワースト日
  const winDays = customReturns.filter((r) => r > 0).length;
  const winRate = Number(((winDays / customReturns.length) * 100).toFixed(1));
  const bestDay = Number((Math.max(...customReturns) * 100).toFixed(2));
  const worstDay = Number((Math.min(...customReturns) * 100).toFixed(2));

  const safeNum = (n: number, fallback = 0) => (Number.isFinite(n) ? n : fallback);

  return {
    annualReturn: Number(safeNum(annualReturn).toFixed(2)),
    annualVolatility: Number(safeNum(annualVolatility).toFixed(2)),
    sharpeRatio: safeNum(sharpeRatio),
    maxDrawdown: Number(safeNum(maxDrawdown).toFixed(2)),
    beta: safeNum(beta, 1.0),
    winRate: safeNum(winRate),
    bestDay: safeNum(bestDay),
    worstDay: safeNum(worstDay),
  };
}

/**
 * 個別銘柄の詳細情報（前日比、寄与度、スパークライン等）を算出
 */
export function calculateStockDetails(
  basket: BasketItem[],
  stockUniverse: StockSeries[],
  baseValue = 1000,
  customSeries: PricePoint[] = [],
): StockDetail[] {
  const normalized = normalizeWeights(basket);
  const stockMap = new Map(stockUniverse.map((s) => [s.ticker, s]));

  // 直近の前日・当日の指数値
  const latestIndexVal = customSeries.length > 0 ? (customSeries[customSeries.length - 1].value ?? baseValue) : baseValue;
  const prevIndexVal = customSeries.length > 1 ? (customSeries[customSeries.length - 2].value ?? latestIndexVal) : latestIndexVal;

  return normalized.map((item) => {
    const stock = stockMap.get(item.ticker);
    const series = stock?.series || [];
    const len = series.length;

    const currentPrice = len > 0 ? series[len - 1].close : (stock?.latestPrice || 0);
    const previousPrice = len > 1 ? series[len - 2].close : currentPrice;
    
    const change = Number((currentPrice - previousPrice).toFixed(2));
    const changePct = previousPrice > 0 ? Number((((currentPrice - previousPrice) / previousPrice) * 100).toFixed(2)) : 0;

    // 指数への寄与度 (pt): (銘柄の騰落率 / 100) * (ウェイト / 100) * 前日指数値
    const weightFraction = item.weight / 100;
    const contributionPt = Number((((changePct / 100) * weightFraction) * prevIndexVal).toFixed(2));
    const contributionPct = prevIndexVal > 0 ? Number(((contributionPt / prevIndexVal) * 100).toFixed(2)) : 0;

    // スパークライン（直近10営業日分）
    const sparkline = series.slice(-10).map((p) => p.close);

    return {
      ticker: item.ticker,
      name: item.name,
      theme: item.theme || "その他",
      weight: item.weight,
      currentPrice,
      previousPrice,
      change,
      changePct,
      contributionPt,
      contributionPct,
      sparkline,
    };
  });
}
