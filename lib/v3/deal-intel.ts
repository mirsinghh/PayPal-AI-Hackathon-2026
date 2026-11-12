import { deliveryLabel, warrantyLabel } from "@/lib/offer-view";
import { formatEur } from "@/shared/format";
import { SELLER_BRANDS } from "@/shared/sellers";
import type { NegotiationSession, Offer } from "@/shared/contracts/types";

/**
 * "Deal intelligence": what the negotiation actually achieved, as plain arithmetic over data the server already
 * validated (the store's own opening price, the final price, your budget, the other eligible offers, the recorded
 * events). Nothing here estimates a market price or invents a saving.
 */
export interface DealIntel {
  brand: string;
  openingCents: number;
  finalCents: number;
  savedCents: number;
  /** Saved as tenths of a percent of the opening price (integer maths), or null when nothing was saved. */
  savedPctTenths: number | null;
  underBudgetCents: number;
  eligibleCount: number;
  totalCount: number;
  /** Stores that lowered their opening price during the negotiation. */
  concessions: { brand: string; savedCents: number }[];
  /** The cheapest *other* eligible offer. `diffCents` > 0 means the recommended offer is cheaper than it. */
  nextBest: { brand: string; finalCents: number; diffCents: number } | null;
  /** Counteroffers Agent D recorded towards the recommended store, and how many of its replies lowered the price. */
  asked: number;
  lowered: number;
}

export function dealIntel(session: Pick<NegotiationSession, "offers" | "events" | "intent" | "recommendedOfferId">): DealIntel | null {
  const winner = session.offers.find((o) => o.offerId === session.recommendedOfferId);
  if (!winner) return null;
  const eligible = session.offers.filter((o) => o.eligible);
  const others = eligible.filter((o) => o.offerId !== winner.offerId).sort((a, b) => a.finalPriceCents - b.finalPriceCents);
  const saved = Math.max(0, winner.initialPriceCents - winner.finalPriceCents);
  const mine = session.events.filter((e) => e.sellerId === winner.sellerId);
  const lowered = mine.filter((e) => {
    if (e.type !== "COUNTEROFFER_RECEIVED" || e.payload.held === true) return false;
    const p = e.payload.previousPriceCents;
    const n = e.payload.newPriceCents;
    return typeof p === "number" && typeof n === "number" && n < p;
  }).length;
  return {
    brand: SELLER_BRANDS[winner.sellerId].brand,
    openingCents: winner.initialPriceCents,
    finalCents: winner.finalPriceCents,
    savedCents: saved,
    savedPctTenths: saved > 0 && winner.initialPriceCents > 0 ? Math.round((saved * 1000) / winner.initialPriceCents) : null,
    underBudgetCents: session.intent.budgetCents - winner.finalPriceCents,
    eligibleCount: eligible.length,
    totalCount: session.offers.length,
    concessions: session.offers.filter((o) => o.discountCents > 0).map((o) => ({ brand: SELLER_BRANDS[o.sellerId].brand, savedCents: o.discountCents })),
    nextBest: others[0] ? { brand: SELLER_BRANDS[others[0].sellerId].brand, finalCents: others[0].finalPriceCents, diffCents: others[0].finalPriceCents - winner.finalPriceCents } : null,
    asked: mine.filter((e) => e.type === "BUYER_MESSAGE").length,
    lowered,
  };
}

const pct = (tenths: number): string => `${Math.floor(tenths / 10)}.${tenths % 10}%`;
const times = (n: number): string => (n === 1 ? "once" : `${n} times`);

/** Where the recommended offer wins or loses against the cheapest other eligible offer, in plain words. */
export function tradeoffLines(winner: Offer, others: Offer[]): string[] {
  const rival = others.filter((o) => o.eligible && o.offerId !== winner.offerId).sort((a, b) => a.finalPriceCents - b.finalPriceCents)[0];
  if (!rival) return [];
  const rb = SELLER_BRANDS[rival.sellerId].brand;
  const wb = SELLER_BRANDS[winner.sellerId].brand;
  const out: string[] = [];
  if (rival.finalPriceCents < winner.finalPriceCents) out.push(`${rb} is ${formatEur(winner.finalPriceCents - rival.finalPriceCents)} cheaper, but ${wb} wins on the rest of your priorities.`);
  const better: string[] = [];
  if (winner.deliveryDays < rival.deliveryDays) better.push(`delivers sooner (${deliveryLabel(winner.deliveryDays)} vs ${deliveryLabel(rival.deliveryDays)})`);
  if (winner.warrantyMonths > rival.warrantyMonths) better.push(`has a longer warranty (${warrantyLabel(winner.warrantyMonths)} vs ${warrantyLabel(rival.warrantyMonths)})`);
  if (winner.freeShipping && !rival.freeShipping) better.push("ships free");
  if (better.length) out.push(`Compared with ${rb}, ${wb} ${better.join(", ")}.`);
  const worse: string[] = [];
  if (winner.deliveryDays > rival.deliveryDays) worse.push(`slower delivery (${deliveryLabel(winner.deliveryDays)} vs ${deliveryLabel(rival.deliveryDays)})`);
  if (winner.warrantyMonths < rival.warrantyMonths) worse.push(`a shorter warranty (${warrantyLabel(winner.warrantyMonths)} vs ${warrantyLabel(rival.warrantyMonths)})`);
  if (worse.length) out.push(`The trade-off: ${wb} has ${worse.join(" and ")} than ${rb}.`);
  return out;
}

/** The headline facts of the deal, one sentence each. Every number is in the intel or the offers. */
export function valueLines(intel: DealIntel): string[] {
  const out: string[] = [];
  if (intel.savedCents > 0) out.push(`${intel.brand} opened at ${formatEur(intel.openingCents)}; Agent D got it down to ${formatEur(intel.finalCents)}: ${formatEur(intel.savedCents)} lower${intel.savedPctTenths !== null ? ` (${pct(intel.savedPctTenths)})` : ""}.`);
  else out.push(`${intel.brand}'s price stayed at ${formatEur(intel.finalCents)} after negotiating.`);
  out.push(intel.underBudgetCents === 0 ? "Exactly on your budget." : `${formatEur(intel.underBudgetCents)} under your budget.`);
  if (intel.asked > 0) out.push(`Agent D countered ${times(intel.asked)}; ${intel.brand} lowered its price ${intel.lowered === 0 ? "no times" : times(intel.lowered)}.`);
  if (intel.nextBest && intel.nextBest.diffCents > 0) out.push(`${formatEur(intel.nextBest.diffCents)} cheaper than the next-best eligible offer (${intel.nextBest.brand}, ${formatEur(intel.nextBest.finalCents)}).`);
  if (intel.concessions.length > 1) out.push(`${intel.concessions.length} of ${intel.totalCount} stores lowered their opening price while negotiating.`);
  return out;
}
