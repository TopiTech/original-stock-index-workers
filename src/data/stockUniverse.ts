import type { StockSeries } from "../types";

const dates = [
  "03/24","03/25","03/26","03/27","03/30","03/31","04/01","04/02","04/03","04/06",
  "04/07","04/08","04/09","04/10","04/13","04/14","04/15","04/16","04/17","04/20"
];

function makeSeries(base: number, multipliers: number[]) {
  return dates.map((date, i) => ({ date, close: Number((base * multipliers[i]).toFixed(2)) }));
}

const growthA = [1.00,1.03,1.02,1.01,0.97,0.95,1.02,1.00,1.01,1.015,1.017,1.065,1.055,1.073,1.068,1.092,1.098,1.125,1.105,1.113];
const growthB = [1.00,1.04,1.035,1.022,0.982,0.965,1.03,1.01,1.028,1.03,1.031,1.081,1.071,1.102,1.094,1.118,1.128,1.158,1.136,1.149];
const growthC = [1.00,1.018,1.022,1.014,0.995,0.985,1.01,0.998,1.004,1.008,1.009,1.022,1.018,1.026,1.024,1.039,1.041,1.052,1.046,1.057];
const growthD = [1.00,0.998,1.002,1.001,0.996,0.994,1.004,0.999,1.003,1.004,1.006,1.014,1.012,1.018,1.019,1.027,1.029,1.036,1.031,1.035];

export const stockUniverse: StockSeries[] = [
  { ticker: "9984", name: "ソフトバンクグループ", theme: "AI", sector: "Technology", latestPrice: 11250, series: makeSeries(10100, growthB) },
  { ticker: "8035", name: "東京エレクトロン", theme: "半導体", sector: "Technology", latestPrice: 37500, series: makeSeries(33200, growthA) },
  { ticker: "6857", name: "アドバンテスト", theme: "半導体", sector: "Technology", latestPrice: 28600, series: makeSeries(25700, growthB) },
  { ticker: "9432", name: "NTT", theme: "通信", sector: "Telecom", latestPrice: 191, series: makeSeries(183, growthC) },
  { ticker: "9433", name: "KDDI", theme: "通信", sector: "Telecom", latestPrice: 5140, series: makeSeries(4900, growthC) },
  { ticker: "4063", name: "信越化学工業", theme: "素材", sector: "Materials", latestPrice: 6720, series: makeSeries(6240, growthD) },
  { ticker: "6954", name: "ファナック", theme: "自動化", sector: "Capital Goods", latestPrice: 4720, series: makeSeries(4460, growthC) },
  { ticker: "9983", name: "ファーストリテイリング", theme: "消費", sector: "Consumer Goods", latestPrice: 74840, series: makeSeries(71000, growthD) },
  { ticker: "6501", name: "日立製作所", theme: "インフラ", sector: "Capital Goods", latestPrice: 19830, series: makeSeries(18400, growthA) },
  { ticker: "7203", name: "トヨタ自動車", theme: "自動車", sector: "Automobile", latestPrice: 3940, series: makeSeries(3670, growthD) }
];
