import { CATEGORY_IMAGE, matchProductCategory } from "@/shared/products";
import type { Offer } from "@/shared/contracts/types";

/** Product name as the merchant offers it (live agents) or as the buyer described it (rule-based simulation). */
export const offerName = (o: Offer): string => o.catalog?.productName ?? o.productLabel;

/**
 * Image for an offer. Live offers carry the catalog image; simulated offers only know what the buyer typed,
 * so we match the *category* and show an illustration of it (never a specific real model). No match = no image.
 */
export function offerImage(o: Offer): string | null {
  if (o.catalog?.imageUrl) return o.catalog.imageUrl;
  const cat = matchProductCategory(o.productLabel);
  return cat ? CATEGORY_IMAGE[cat] : null;
}

export const deliveryLabel = (days: number): string => (days <= 1 ? "Next day" : `${days} days`);

export function warrantyLabel(months: number): string {
  if (months >= 24 && months % 12 === 0) return `${months / 12} years`;
  if (months === 12) return "1 year";
  return `${months} months`;
}

export function ineligibleLabel(reasons: string[]): string {
  if (reasons.includes("out_of_stock")) return "Out of stock";
  if (reasons.includes("over_budget")) return "Over your budget";
  return "Not eligible";
}

export type OfferFacet = "price" | "delivery" | "warranty";

/**
 * Which eligible offers are best on each comparable facet (ties all count).
 * Derived only for display ("lowest price" labels); the recommendation itself comes from the server.
 */
export function bestFacets(offers: Offer[]): Record<OfferFacet, Set<string>> {
  const eligible = offers.filter((o) => o.eligible);
  const pick = (value: (o: Offer) => number, better: "min" | "max") => {
    if (eligible.length < 2) return new Set<string>();
    const target = (better === "min" ? Math.min : Math.max)(...eligible.map(value));
    const set = new Set(eligible.filter((o) => value(o) === target).map((o) => o.offerId));
    // If every offer ties, nothing is "best".
    return set.size === eligible.length ? new Set<string>() : set;
  };
  return {
    price: pick((o) => o.finalPriceCents, "min"),
    delivery: pick((o) => o.deliveryDays, "min"),
    warranty: pick((o) => o.warrantyMonths, "max"),
  };
}

export interface OfferDiff {
  priceCents: number;
  deliveryDays: number;
  warrantyMonths: number;
}

/** Plain arithmetic difference of an offer against the recommended one (positive = the offer has more of it). */
export function diffVs(o: Offer, base: Offer): OfferDiff {
  return {
    priceCents: o.finalPriceCents - base.finalPriceCents,
    deliveryDays: o.deliveryDays - base.deliveryDays,
    warrantyMonths: o.warrantyMonths - base.warrantyMonths,
  };
}

/** Neutral phrases ("€12.00 more", "5 days faster"). Deliberately not coloured good/bad: the reader weighs them. */
export function diffPhrases(d: OfferDiff, money: (cents: number) => string): string[] {
  const out: string[] = [];
  if (d.priceCents !== 0) out.push(`${money(Math.abs(d.priceCents))} ${d.priceCents > 0 ? "more" : "less"}`);
  if (d.deliveryDays !== 0) out.push(`${Math.abs(d.deliveryDays)} day${Math.abs(d.deliveryDays) === 1 ? "" : "s"} ${d.deliveryDays > 0 ? "slower" : "faster"}`);
  if (d.warrantyMonths !== 0) out.push(`${Math.abs(d.warrantyMonths)} months ${d.warrantyMonths > 0 ? "more" : "less"} warranty`);
  return out;
}

/** Short, stable document reference derived from the session id (not an order number: the order number is PayPal's). */
export const slipRef = (sessionId: string): string => `AD-${sessionId.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase()}`;
