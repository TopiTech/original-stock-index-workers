import type { BasketItem } from "../types";

export interface CustomIndex {
  id: string;
  name: string;
  description: string;
  baseValue: number;
  basket: BasketItem[];
}
