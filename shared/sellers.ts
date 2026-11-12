import type { SellerId, Strategy } from "@/shared/contracts/types";

/**
 * Public display identity of the four fictional demo merchants.
 *
 * Client components must import from here, never from `server/agents/catalog.ts`: that module also holds
 * reserve prices and LLM personas that must never reach the browser bundle. `tests/sellers.test.ts`
 * guards this copy against drifting from the server catalog.
 * All names and marks are invented for this demo; no third-party trademarks are used.
 */
export interface SellerBrand {
  sellerId: SellerId;
  brand: string;
  tagline: string;
  /** Short plain-language description of how this merchant competes. */
  pitch: string;
  /** Mark colour (an original monogram, no external logos). */
  color: string;
  monogram: string;
  strategy: Strategy;
  deliveryDays: number;
  warrantyMonths: number;
  returnDays: number;
}

export const SELLER_BRANDS: Record<SellerId, SellerBrand> = {
  nova: {
    sellerId: "nova",
    brand: "Brisa Outlet",
    tagline: "Outlet prices, every day",
    pitch: "Competes on price and concedes readily; slower delivery.",
    color: "#C2410C",
    monogram: "BO",
    strategy: "price_fighter",
    deliveryDays: 6,
    warrantyMonths: 12,
    returnDays: 14,
  },
  orbit: {
    sellerId: "orbit",
    brand: "Zefiro Express",
    tagline: "Next-day delivery, free shipping",
    pitch: "Competes on speed and service; small, fair concessions.",
    color: "#0E7490",
    monogram: "ZE",
    strategy: "fast_delivery",
    deliveryDays: 1,
    warrantyMonths: 12,
    returnDays: 30,
  },
  prism: {
    sellerId: "prism",
    brand: "Atelier Norden",
    tagline: "Premium service, 3-year warranty",
    pitch: "Competes on warranty and service; rarely discounts.",
    color: "#6D28D9",
    monogram: "AN",
    strategy: "premium_value",
    deliveryDays: 4,
    warrantyMonths: 36,
    returnDays: 30,
  },
  vertex: {
    sellerId: "vertex",
    brand: "Korvan Direct",
    tagline: "Direct from the brand, firm prices",
    pitch: "Firm prices and low stock; concedes only in small steps.",
    color: "#BE123C",
    monogram: "KD",
    strategy: "hard_negotiator",
    deliveryDays: 3,
    warrantyMonths: 24,
    returnDays: 14,
  },
};
