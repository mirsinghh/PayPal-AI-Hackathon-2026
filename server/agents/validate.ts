import type { Offer, SellerId, SellerPolicy } from "@/shared/contracts/types";
import type { BuyerFinal, BuyerRound, SellerReply } from "./schemas";
import type { CatalogItem, SellerProfile } from "./catalog";
import { AGENT_POLICY_VERSION } from "./catalog";
import { assessEligibility } from "@/server/negotiation/validator";

/* ---------- money in free text ---------- */

function toCents(raw: string): number | null {
  const s = raw.replace(/[.,]+$/, "");
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const sep = Math.max(lastDot, lastComma);
  let whole = s;
  let frac = "";
  if (sep >= 0) {
    const after = s.length - sep - 1;
    const both = lastDot >= 0 && lastComma >= 0;
    if (both || after !== 3) {
      whole = s.slice(0, sep);
      frac = s.slice(sep + 1);
    }
  }
  whole = whole.replace(/[.,]/g, "");
  if (!/^\d+$/.test(whole) || !/^\d{0,2}$/.test(frac)) return null;
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0") || 0);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Every euro amount mentioned in text, in cents. Unparseable amounts are returned as -1 so they fail grounding. */
export function amountsInText(text: string): number[] {
  const out: number[] = [];
  const re = /(?:€|EUR)\s?(\d[\d.,]*)|(\d[\d.,]*)\s?(?:€|EUR)/gi;
  for (const m of text.matchAll(re)) out.push(toCents(m[1] ?? m[2]) ?? -1);
  return out;
}

/** null when every euro amount quoted is one of the allowed (server-known) values. */
export function ungroundedAmount(texts: string[], allowedCents: number[]): string | null {
  const allowed = new Set(allowedCents);
  for (const t of texts) for (const a of amountsInText(t)) if (!allowed.has(a)) return "ungrounded_amount";
  return null;
}

/* ---------- seller proposals ---------- */

export interface SellerContext {
  item: CatalogItem;
  profile: SellerProfile;
  /** Item price currently on the table; null while opening. */
  previousItemCents: number | null;
  /** Buyer's current counter-target (item cents), when any. */
  targetItemCents: number | null;
  budgetCents: number;
}

export function allowedSellerAmounts(c: SellerContext, proposed: number): number[] {
  const ship = c.item.shippingCents;
  const out = [proposed, proposed + ship, ship, c.budgetCents, c.item.listPriceCents];
  if (c.previousItemCents !== null) out.push(c.previousItemCents, c.previousItemCents + ship);
  if (c.targetItemCents !== null) out.push(c.targetItemCents);
  return out;
}

/** Returns a reason code when the proposal is not allowed. Pure; the single gate before an offer changes. */
export function validateSellerReply(reply: SellerReply, c: SellerContext): string | null {
  const { item, profile, previousItemCents: prev } = c;
  const p = reply.priceCents;
  if (!Number.isSafeInteger(p)) return "non_integer_price";
  if (p < item.minPriceCents) return "price_below_floor";
  if (p > item.listPriceCents) return "price_above_list";
  if (prev === null) {
    if (reply.action !== "quote") return "opening_must_be_quote";
  } else {
    if (reply.action === "quote") return "quote_only_when_opening";
    if (p > prev) return "price_increase";
    if (reply.action === "hold" && p !== prev) return "hold_changed_price";
    if (reply.action === "concede") {
      if (p >= prev) return "concede_not_lower";
      if (prev - p > Math.floor((prev * profile.maxConcessionPerRoundBps) / 10_000)) return "concession_too_large";
    }
  }
  return ungroundedAmount([reply.message], allowedSellerAmounts(c, p));
}

/* ---------- buyer proposals ---------- */

export interface BookEntry {
  sellerId: SellerId;
  offerId: string;
  itemPriceCents: number;
  shippingCents: number;
  eligible: boolean;
}

export function validateBuyerRound(round: BuyerRound, book: BookEntry[], budgetCents: number): string | null {
  const seen = new Set<SellerId>();
  const allowed: number[] = [budgetCents];
  for (const b of book) allowed.push(b.itemPriceCents, b.shippingCents, b.itemPriceCents + b.shippingCents);
  for (const m of round.moves) {
    const entry = book.find((b) => b.sellerId === m.sellerId);
    if (!entry) return "unknown_seller";
    if (seen.has(m.sellerId)) return "duplicate_move";
    seen.add(m.sellerId);
    if (m.action === "counter") {
      if (m.targetPriceCents === null) return "counter_without_target";
      if (m.targetPriceCents >= entry.itemPriceCents) return "target_not_below_current";
      allowed.push(m.targetPriceCents);
    }
  }
  return ungroundedAmount([round.rationale, ...round.moves.map((m) => m.message)], allowed);
}

export function validateBuyerFinal(final: BuyerFinal, offers: Offer[], budgetCents: number): string | null {
  const chosen = offers.find((o) => o.offerId === final.chosenOfferId);
  if (!chosen) return "unknown_offer";
  if (!chosen.eligible) return "chosen_offer_not_eligible";
  const allowed = [budgetCents];
  for (const o of offers) {
    allowed.push(o.initialPriceCents, o.finalPriceCents, o.discountCents);
    if (o.catalog) allowed.push(o.catalog.itemPriceCents, o.catalog.shippingCents);
  }
  return ungroundedAmount([final.summary, ...final.reasons, ...final.tradeoffs], allowed);
}

/* ---------- offer integrity (server-side, after any change) ---------- */

/** Builds the all-in offer for a seller at an item price and re-checks every money invariant. */
export function buildOffer(args: {
  offerId: string;
  sessionId: string;
  item: CatalogItem;
  profile: SellerProfile;
  openingItemCents: number;
  currentItemCents: number;
  budgetCents: number;
  productLabel: string;
  imageUrl: string;
  expiresAt: string;
}): Offer {
  const { item, profile } = args;
  const ship = item.shippingCents;
  const initial = args.openingItemCents + ship;
  const final = args.currentItemCents + ship;
  const min = item.minPriceCents + ship;
  const base = { initialPriceCents: initial, finalPriceCents: final, minPriceCents: min, discountCents: initial - final };
  // Per-offer policy: the discount limit is whatever the catalog floor implies for this opening price.
  const policy: SellerPolicy = {
    sellerId: item.sellerId,
    displayName: profile.brand,
    strategy: profile.strategy,
    policyVersion: AGENT_POLICY_VERSION,
    maxDiscountBps: Math.ceil(((initial - min) * 10_000) / initial),
    deliveryDays: profile.deliveryDays,
    warrantyMonths: profile.warrantyMonths,
    freeShipping: ship === 0,
  };
  const { eligible, reasons } = assessEligibility(base, policy, args.budgetCents);
  if (item.stock < 1) {
    reasons.push("out_of_stock");
  }
  return {
    offerId: args.offerId,
    sessionId: args.sessionId,
    sellerId: item.sellerId,
    productLabel: args.productLabel,
    ...base,
    deliveryDays: profile.deliveryDays,
    warrantyMonths: profile.warrantyMonths,
    freeShipping: ship === 0,
    eligible: eligible && item.stock >= 1,
    ineligibilityReasons: reasons,
    offerExpiresAt: args.expiresAt,
    policyVersion: AGENT_POLICY_VERSION,
    catalog: {
      sku: item.sku,
      productName: item.name,
      imageUrl: args.imageUrl,
      itemPriceCents: args.currentItemCents,
      shippingCents: ship,
      stock: item.stock,
      returnDays: profile.returnDays,
    },
  };
}

/* ---------- labelled rule-based fallbacks (used only when a model turn fails) ---------- */

/** Seller fallback: open at list price; later, meet the buyer halfway within the policy limits. */
export function rulesSellerReply(c: SellerContext): SellerReply {
  const { item, profile, previousItemCents: prev, targetItemCents: target } = c;
  if (prev === null) {
    return { action: "quote", priceCents: item.listPriceCents, message: "Our standard list price for this item." };
  }
  const wanted = Math.max(target ?? prev, item.minPriceCents);
  const cap = Math.floor((prev * profile.maxConcessionPerRoundBps) / 10_000);
  const step = Math.min(cap, Math.floor((prev - wanted) / 2));
  if (step <= 0) return { action: "hold", priceCents: prev, message: "We are keeping our current price." };
  return { action: "concede", priceCents: prev - step, message: "We can improve the price a little." };
}

/** Buyer fallback: ask every seller still above budget, or any seller, for 5% less. */
export function rulesBuyerRound(book: BookEntry[]): BuyerRound {
  return {
    rationale: "Asking each seller for a small price improvement.",
    moves: book.map((b) => ({
      sellerId: b.sellerId,
      action: "counter" as const,
      targetPriceCents: Math.max(1, b.itemPriceCents - Math.floor(b.itemPriceCents / 20)),
      message: "Could you improve your price a little?",
    })),
  };
}
