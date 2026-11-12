import type { SellerId } from "@/shared/contracts/types";

/**
 * Server-side configuration of the four fictional demo merchants.
 * Everything commercial lives here: the LLM never sees or edits these tables, it can only
 * propose prices that the validator checks against them.
 * All names are invented for this demo; no third-party trademarks are used.
 * Money: integer EUR cents.
 */
export const AGENT_POLICY_VERSION = "2026-11-v2-agents";

export interface SellerProfile {
  sellerId: SellerId;
  brand: string;
  tagline: string;
  /** Visual identity (rendered as an original monogram; no external logos). */
  color: string;
  monogram: string;
  strategy: "price_fighter" | "fast_delivery" | "premium_value" | "hard_negotiator";
  /** Commercial strategy given to the seller agent as its persona. */
  persona: string;
  /**
   * HOW the seller talks (V4 character). Expression only: it carries no price, limit or rule, and it never changes what the
   * validators accept. Appended to the seller agent's private system prompt.
   */
  voice: string;
  deliveryDays: number;
  warrantyMonths: number;
  returnDays: number;
  /** Max concession per negotiation round, as basis points of the current item price. */
  maxConcessionPerRoundBps: number;
}

export const SELLER_PROFILES: Record<SellerId, SellerProfile> = {
  nova: {
    sellerId: "nova",
    brand: "Brisa Outlet",
    tagline: "Outlet prices, every day",
    color: "#EA580C",
    monogram: "BO",
    strategy: "price_fighter",
    persona:
      "You run a discount outlet. You win on price: open competitively and concede readily when a buyer pushes, but you are slow (6 days) and give only 12 months of warranty.",
    voice:
      "Voice: The Bargain Hunter. Friendly, close and competitive; you enjoy a deal and acknowledge when the buyer pushes well. Warm, short sentences, a little playful. Example tone: \"I can make this more attractive. Here's a better price.\"",
    deliveryDays: 6,
    warrantyMonths: 12,
    returnDays: 14,
    maxConcessionPerRoundBps: 600,
  },
  orbit: {
    sellerId: "orbit",
    brand: "Zefiro Express",
    tagline: "Next-day delivery, free shipping",
    color: "#0891B2",
    monogram: "ZE",
    strategy: "fast_delivery",
    persona:
      "You sell on speed: next-day delivery and free shipping. You defend your service premium but give small, fair concessions to close the sale.",
    voice:
      "Voice: The Speed Specialist. Direct and efficient; no fluff. You highlight fast delivery and convenience only when your terms support it, and you are candid that you may not be the cheapest. Example tone: \"I may not be the cheapest, but delivery is where I stand out.\"",
    deliveryDays: 1,
    warrantyMonths: 12,
    returnDays: 30,
    maxConcessionPerRoundBps: 400,
  },
  prism: {
    sellerId: "prism",
    brand: "Atelier Norden",
    tagline: "Premium service, 3-year warranty",
    color: "#7C3AED",
    monogram: "AN",
    strategy: "premium_value",
    persona:
      "You are a premium merchant: 36-month warranty, 30-day returns, free shipping. You rarely discount; you argue value and concede only a little.",
    voice:
      "Voice: The Premium Advisor. Elegant, calm and sure of yourself. You defend warranty, durability and long-term value instead of competing on price alone, and explain why your conditions justify the cost. Example tone: \"Price matters, but long-term protection is part of the value.\"",
    deliveryDays: 4,
    warrantyMonths: 36,
    returnDays: 30,
    maxConcessionPerRoundBps: 300,
  },
  vertex: {
    sellerId: "vertex",
    brand: "Korvan Direct",
    tagline: "Direct from the brand, firm prices",
    color: "#BE123C",
    monogram: "KD",
    strategy: "hard_negotiator",
    persona:
      "You are a hard negotiator with firm prices and low stock. You hold your price unless the buyer gives a strong reason, and concede only in tiny steps.",
    voice:
      "Voice: The Tough Negotiator. Firm, concise and exacting; few words, no flattery. You may decline a proposal when your terms do not allow it, politely and plainly. Example tone: \"I've reviewed your proposal. I can't offer that price under the current terms.\"",
    deliveryDays: 3,
    warrantyMonths: 24,
    returnDays: 14,
    maxConcessionPerRoundBps: 150,
  },
};

export type CategoryId = "headphones" | "laptop" | "smartphone" | "smartwatch" | "running-shoes" | "monitor";

export interface CatalogItem {
  sku: string;
  sellerId: SellerId;
  category: CategoryId;
  name: string;
  /** Opening (list) item price. */
  listPriceCents: number;
  /** Reserve price: the seller never sells below this. Never sent to the buyer or the UI. */
  minPriceCents: number;
  shippingCents: number;
  stock: number;
}

const CATEGORY_KEYWORDS: Record<CategoryId, RegExp> = {
  headphones: /head\s?phone|earbud|earphone|auricular|cascos/i,
  laptop: /laptop|notebook|portátil|portatil|ultrabook/i,
  smartphone: /smart\s?phone|\bphones?\b|móvil|movil|mobile/i,
  smartwatch: /smart\s?watch|watch|reloj|fitness (band|tracker)/i,
  "running-shoes": /running|shoe|sneaker|trainer|zapatilla/i,
  monitor: /monitor|display|screen|pantalla/i,
};

export const CATEGORY_IMAGE: Record<CategoryId, string> = {
  headphones: "/products/headphones.svg",
  laptop: "/products/laptop.svg",
  smartphone: "/products/smartphone.svg",
  smartwatch: "/products/smartwatch.svg",
  "running-shoes": "/products/running-shoes.svg",
  monitor: "/products/monitor.svg",
};

const i = (
  sellerId: SellerId,
  category: CategoryId,
  name: string,
  listPriceCents: number,
  minPriceCents: number,
  shippingCents: number,
  stock: number,
): CatalogItem => ({ sku: `${sellerId.slice(0, 3).toUpperCase()}-${category}`, sellerId, category, name, listPriceCents, minPriceCents, shippingCents, stock });

export const CATALOG: CatalogItem[] = [
  i("nova", "headphones", "Wireless ANC Headphones · Value edition", 27_900, 24_900, 590, 14),
  i("orbit", "headphones", "Wireless ANC Headphones · Express edition", 31_900, 29_900, 0, 6),
  i("prism", "headphones", "Wireless ANC Headphones · Premium edition", 34_900, 33_200, 0, 9),
  i("vertex", "headphones", "Wireless ANC Headphones · Pro edition", 36_900, 35_900, 490, 3),

  i("nova", "laptop", "14-inch Laptop · Value edition", 109_900, 99_900, 1_290, 8),
  i("orbit", "laptop", "14-inch Laptop · Express edition", 124_900, 117_900, 0, 5),
  i("prism", "laptop", "14-inch Laptop · Premium edition", 134_900, 128_900, 0, 4),
  i("vertex", "laptop", "14-inch Laptop · Pro edition", 139_900, 136_000, 990, 2),

  i("nova", "smartphone", "Smartphone 128 GB · Value edition", 44_900, 40_900, 590, 20),
  i("orbit", "smartphone", "Smartphone 128 GB · Express edition", 52_900, 49_900, 0, 11),
  i("prism", "smartphone", "Smartphone 128 GB · Premium edition", 57_900, 55_000, 0, 7),
  i("vertex", "smartphone", "Smartphone 128 GB · Pro edition", 59_900, 58_000, 490, 3),

  i("nova", "smartwatch", "Fitness Smartwatch · Value edition", 17_900, 15_900, 490, 25),
  i("orbit", "smartwatch", "Fitness Smartwatch · Express edition", 21_900, 20_400, 0, 12),
  i("prism", "smartwatch", "Fitness Smartwatch · Premium edition", 24_900, 23_500, 0, 9),
  i("vertex", "smartwatch", "Fitness Smartwatch · Pro edition", 25_900, 25_000, 390, 4),

  i("nova", "running-shoes", "Running Shoes · Value edition", 8_900, 7_900, 490, 40),
  i("orbit", "running-shoes", "Running Shoes · Express edition", 10_900, 10_200, 0, 18),
  i("prism", "running-shoes", "Running Shoes · Premium edition", 12_900, 12_200, 0, 12),
  i("vertex", "running-shoes", "Running Shoes · Pro edition", 13_900, 13_400, 390, 5),

  i("nova", "monitor", "27-inch Monitor · Value edition", 21_900, 19_900, 990, 10),
  i("orbit", "monitor", "27-inch Monitor · Express edition", 25_900, 24_200, 0, 6),
  i("prism", "monitor", "27-inch Monitor · Premium edition", 28_900, 27_500, 0, 5),
  i("vertex", "monitor", "27-inch Monitor · Pro edition", 29_900, 29_000, 790, 2),
];

export function matchCategory(query: string): CategoryId | null {
  for (const [cat, re] of Object.entries(CATEGORY_KEYWORDS) as [CategoryId, RegExp][]) {
    if (re.test(query)) return cat;
  }
  return null;
}

export function catalogForCategory(category: CategoryId): CatalogItem[] {
  return CATALOG.filter((c) => c.category === category);
}

export function catalogItem(sellerId: SellerId, category: CategoryId): CatalogItem {
  const item = CATALOG.find((c) => c.sellerId === sellerId && c.category === category);
  if (!item) throw new Error(`catalog_missing:${sellerId}:${category}`);
  return item;
}
