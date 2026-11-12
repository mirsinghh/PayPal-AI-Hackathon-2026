import type { Offer, Priority } from "@/shared/contracts/types";

export const WEIGHTS: Record<Priority, { price: number; delivery: number; warranty: number }> = {
  lowest_price: { price: 65, delivery: 15, warranty: 20 },
  fast_delivery: { price: 25, delivery: 60, warranty: 15 },
  best_value: { price: 45, delivery: 25, warranty: 30 },
};

function norm(value: number, min: number, max: number, higherIsBetter: boolean): number {
  if (max === min) return 100;
  const x = (value - min) / (max - min);
  return (higherIsBetter ? x : 1 - x) * 100;
}

export interface RankingResult {
  rankedOfferIds: string[];
  scores: Record<string, number>;
  recommendedOfferId: string;
}

/**
 * Deterministic ranking. Normalisation runs across the session's four offers;
 * weights are applied only to eligible offers. Ties: higher score, lower final price, seller id.
 */
export function rankOffers(offers: Offer[], priority: Priority): RankingResult {
  const prices = offers.map((o) => o.finalPriceCents);
  const days = offers.map((o) => o.deliveryDays);
  const warranty = offers.map((o) => o.warrantyMonths);
  const w = WEIGHTS[priority];

  const scores: Record<string, number> = {};
  for (const o of offers) {
    const raw =
      (w.price * norm(o.finalPriceCents, Math.min(...prices), Math.max(...prices), false) +
        w.delivery * norm(o.deliveryDays, Math.min(...days), Math.max(...days), false) +
        w.warranty * norm(o.warrantyMonths, Math.min(...warranty), Math.max(...warranty), true)) /
      100;
    scores[o.offerId] = Math.round(raw);
  }

  const eligible = offers.filter((o) => o.eligible);
  if (eligible.length === 0) throw new Error("No eligible offers to rank.");
  const ranked = [...eligible].sort(
    (a, b) =>
      scores[b.offerId] - scores[a.offerId] ||
      a.finalPriceCents - b.finalPriceCents ||
      a.sellerId.localeCompare(b.sellerId),
  );
  return {
    rankedOfferIds: ranked.map((o) => o.offerId),
    scores,
    recommendedOfferId: ranked[0].offerId,
  };
}
