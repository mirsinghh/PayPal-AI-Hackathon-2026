import type { SellerId, SellerPolicy } from "@/shared/contracts/types";

export const POLICY_VERSION = "2026-11-v1";

/** Fictional sellers (ids are stable internal keys; brands are fictional).  Their policies are fixed per session and can never be changed by the LLM. */
export const SELLER_POLICIES: Record<SellerId, SellerPolicy> = {
  nova: {
    sellerId: "nova",
    displayName: "Brisa Outlet",
    strategy: "price_fighter",
    policyVersion: POLICY_VERSION,
    maxDiscountBps: 1200,
    deliveryDays: 6,
    warrantyMonths: 12,
    freeShipping: false,
  },
  orbit: {
    sellerId: "orbit",
    displayName: "Zefiro Express",
    strategy: "fast_delivery",
    policyVersion: POLICY_VERSION,
    maxDiscountBps: 800,
    deliveryDays: 1,
    warrantyMonths: 12,
    freeShipping: true,
  },
  prism: {
    sellerId: "prism",
    displayName: "Atelier Norden",
    strategy: "premium_value",
    policyVersion: POLICY_VERSION,
    maxDiscountBps: 500,
    deliveryDays: 4,
    warrantyMonths: 36,
    freeShipping: true,
  },
  vertex: {
    sellerId: "vertex",
    displayName: "Korvan Direct",
    strategy: "hard_negotiator",
    policyVersion: POLICY_VERSION,
    maxDiscountBps: 300,
    deliveryDays: 3,
    warrantyMonths: 24,
    freeShipping: false,
  },
};

/** Opening price relative to the scenario's reference price, in basis points. */
export const OPENING_PRICE_BPS: Record<SellerId, number> = {
  nova: 9700,
  orbit: 10000,
  prism: 10400,
  vertex: 11200,
};
