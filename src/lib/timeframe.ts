import type { Timeframe } from "../types";

export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  "1W": "1週間",
  "1M": "1か月",
  "3M": "3か月",
  "6M": "6か月",
  YTD: "年初来",
  "1Y": "全期間",
};

export function filterByTimeframe<T extends { date: string }>(data: T[], timeframe: Timeframe): T[] {
  if (data.length === 0) return [];
  if (timeframe === "1W") return data.slice(-5);
  if (timeframe === "1M") return data.slice(-22);
  if (timeframe === "3M") return data.slice(-65);
  if (timeframe === "6M") return data.slice(-130);
  if (timeframe === "YTD") {
    const currentYear = new Date().getFullYear().toString();
    const ytdData = data.filter((point) => point.date.startsWith(currentYear));
    return ytdData.length > 0 ? ytdData : data.slice(-22);
  }
  return data;
}
