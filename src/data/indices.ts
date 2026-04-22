import type { BasketItem } from "../types";

export interface CustomIndex {
  id: string;
  name: string;
  description: string;
  baseValue: number;
  basket: BasketItem[];
}

export const PREDEFINED_INDICES: CustomIndex[] = [
  {
    id: "ai-semi",
    name: "AI・半導体強化指数",
    description: "最先端のAI技術と半導体製造装置メーカーを中心に構成された指数です。",
    baseValue: 1000,
    basket: [
      { ticker: "9984", name: "ソフトバンクグループ", weight: 35, theme: "AI" },
      { ticker: "8035", name: "東京エレクトロン", weight: 35, theme: "半導体" },
      { ticker: "6857", name: "アドバンテスト", weight: 30, theme: "半導体" }
    ]
  },
  {
    id: "infra-tech",
    name: "次世代インフラ・通信指数",
    description: "日本の通信インフラとDXを支える大手企業で構成される安定成長指数です。",
    baseValue: 1000,
    basket: [
      { ticker: "9432", name: "NTT", weight: 30, theme: "通信" },
      { ticker: "9433", name: "KDDI", weight: 30, theme: "通信" },
      { ticker: "6501", name: "日立製作所", weight: 40, theme: "インフラ" }
    ]
  },
  {
    id: "jp-core",
    name: "日本コア・企業指数",
    description: "日本を代表する時価総額上位の優良株をバランスよく配置した指数です。",
    baseValue: 1000,
    basket: [
      { ticker: "7203", name: "トヨタ自動車", weight: 40, theme: "自動車" },
      { ticker: "4063", name: "信越化学工業", weight: 30, theme: "素材" },
      { ticker: "9983", name: "ファーストリテイリング", weight: 30, theme: "消費" }
    ]
  }
];
