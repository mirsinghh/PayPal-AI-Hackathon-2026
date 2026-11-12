import { randomUUID } from "node:crypto";
import {
  SELLER_IDS,
  type Offer,
  type ProductIntent,
  type SellerId,
} from "@/shared/contracts/types";
import { OPENING_PRICE_BPS, SELLER_POLICIES } from "./policies";
import { ScenarioError, assessEligibility } from "./validator";

export const OFFER_TTL_MS = 30 * 60 * 1000;

/** Small deterministic PRNG so scenarios are reproducible in tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Integer helper: round(a * bps / 10000) without floats on the money value. */
function mulBps(cents: number, bps: number): number {
  return Math.round((cents * bps) / 10_000);
}

function buildOnce(
  sessionId: string,
  intent: ProductIntent,
  rand: () => number,
  now: Date,
): Offer[] {
  // Reference price sits 88-97% of the budget: cheaper sellers fit, the premium seller often does not.
  const refBps = 8800 + Math.floor(rand() * 900);
  const reference = mulBps(intent.budgetCents, refBps);
  const expires = new Date(now.getTime() + OFFER_TTL_MS).toISOString();

  return SELLER_IDS.map((sellerId: SellerId) => {
    const policy = SELLER_POLICIES[sellerId];
    const jitter = 9800 + Math.floor(rand() * 400); // +-2%
    const initial = mulBps(mulBps(reference, OPENING_PRICE_BPS[sellerId]), jitter);
    // Seller concedes between 60% and 100% of its maximum allowed discount.
    const usedBps = Math.floor(policy.maxDiscountBps * (0.6 + rand() * 0.4));
    const final = initial - Math.floor((initial * usedBps) / 10_000);
    // Policy floor derived from max discount; round up so final >= min always holds.
    const min = initial - Math.floor((initial * policy.maxDiscountBps) / 10_000);
    const base = {
      initialPriceCents: initial,
      finalPriceCents: final,
      minPriceCents: min,
      discountCents: initial - final,
    };
    const { eligible, reasons } = assessEligibility(base, policy, intent.budgetCents);
    return {
      offerId: `off_${randomUUID()}`,
      sessionId,
      sellerId,
      productLabel: intent.productQuery,
      ...base,
      deliveryDays: policy.deliveryDays,
      warrantyMonths: policy.warrantyMonths,
      freeShipping: policy.freeShipping,
      eligible,
      ineligibilityReasons: reasons,
      offerExpiresAt: expires,
      policyVersion: policy.policyVersion,
    } satisfies Offer;
  });
}

/**
 * Builds four hypothetical offers. Regenerates once if no offer fits the budget,
 * then fails honestly instead of inventing a winner.
 */
export function buildScenario(
  sessionId: string,
  intent: ProductIntent,
  opts: { seed?: number; now?: Date } = {},
): Offer[] {
  const now = opts.now ?? new Date();
  const seed = opts.seed ?? hashSeed(`${intent.productQuery.toLowerCase()}|${intent.budgetCents}`);
  for (let attempt = 0; attempt < 2; attempt++) {
    const offers = buildOnce(sessionId, intent, mulberry32(seed + attempt * 7919), now);
    const valid = offers.every((o) => !o.ineligibilityReasons.includes("invalid_policy"));
    if (valid && offers.some((o) => o.eligible)) return offers;
  }
  throw new ScenarioError("Could not prepare a consistent scenario.");
}
