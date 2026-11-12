import type { Offer, SellerPolicy } from "@/shared/contracts/types";

export class ScenarioError extends Error {
  code = "SCENARIO_UNAVAILABLE" as const;
}

/**
 * Checks the monetary invariants of an offer against its seller policy.
 * Returns a list of violated rules; an empty list means the offer is internally valid.
 */
export function policyViolations(
  o: Pick<Offer, "initialPriceCents" | "finalPriceCents" | "minPriceCents" | "discountCents">,
  policy: SellerPolicy,
): string[] {
  const v: string[] = [];
  const ints = [o.initialPriceCents, o.finalPriceCents, o.minPriceCents, o.discountCents];
  if (!ints.every(Number.isSafeInteger)) v.push("non_integer_amount");
  if (!(o.minPriceCents > 0)) v.push("non_positive_min_price");
  if (!(o.initialPriceCents >= o.finalPriceCents)) v.push("final_above_initial");
  if (!(o.finalPriceCents >= o.minPriceCents)) v.push("final_below_policy_floor");
  if (o.discountCents !== o.initialPriceCents - o.finalPriceCents) v.push("discount_mismatch");
  // discount <= maxDiscountBps, using integer math only
  if (o.discountCents * 10_000 > o.initialPriceCents * policy.maxDiscountBps) v.push("discount_over_limit");
  return v;
}

/** Marks eligibility. Budget is a hard constraint; any policy violation makes the offer ineligible. */
export function assessEligibility(
  o: Pick<Offer, "initialPriceCents" | "finalPriceCents" | "minPriceCents" | "discountCents">,
  policy: SellerPolicy,
  budgetCents: number,
): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (policyViolations(o, policy).length > 0) reasons.push("invalid_policy");
  if (o.finalPriceCents > budgetCents) reasons.push("over_budget");
  return { eligible: reasons.length === 0, reasons };
}
