import type { Offer, SellerId, SellerPolicy } from "@/shared/contracts/types";
import { SELLER_BRANDS } from "@/shared/sellers";
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

/**
 * (kept for callers that only need the floor) The lowest item price this seller may answer with right now: its private reserve, or the largest concession its own
 * per-round limit allows, whichever is higher. Same arithmetic as `validateSellerReply`; it only lets the seller see its
 * own limit (private context), it does not change any rule.
 */
export function lowestAllowedItemCents(item: CatalogItem, profile: SellerProfile, previousItemCents: number): number {
  return Math.max(item.minPriceCents, previousItemCents - Math.floor((previousItemCents * profile.maxConcessionPerRoundBps) / 10_000));
}

/**
 * The exact window a seller may answer within this turn, in integer cents, using the same arithmetic as
 * `validateSellerReply`: opening = between reserve and list price; later = never above the current price, never below the
 * reserve, and a concession is at most the per-round cap. `canConcede` is false when the floor equals the current price
 * (the seller can only hold). Private to that seller: it is only ever put in that seller's own prompt.
 */
export interface PriceWindow {
  minItemCents: number;
  maxItemCents: number;
  actions: ("quote" | "concede" | "hold")[];
  canConcede: boolean;
}
export function sellerPriceWindow(item: CatalogItem, profile: SellerProfile, previousItemCents: number | null): PriceWindow {
  if (previousItemCents === null) return { minItemCents: item.minPriceCents, maxItemCents: item.listPriceCents, actions: ["quote"], canConcede: false };
  const lowest = lowestAllowedItemCents(item, profile, previousItemCents);
  const canConcede = lowest < previousItemCents;
  return { minItemCents: Math.min(lowest, previousItemCents), maxItemCents: previousItemCents, actions: canConcede ? ["concede", "hold"] : ["hold"], canConcede };
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
  // The reserve is private: a message may not even allude to it (seen in the second real Groq run: "staying above my reserve").
  if (/\b(reserve price|my reserve|our reserve|the reserve|above (my|our) reserve|below (my|our) reserve|floor price|minimum price|cost price)\b/i.test(reply.message)) return "mentions_reserve";
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

export interface FinalCheck {
  /** The server's top-ranked eligible offer. When given, Agent D's final choice must be that offer (the ranking decides). */
  topOfferId?: string;
  /** The server's stored scores, used to verify "highest score" claims. */
  scores?: Record<string, number>;
}

/**
 * Validates Agent D's final decision. Scope of every comparative claim: the ELIGIBLE offers (the ones that can be bought);
 * an offer set aside by the server never counts as "cheaper" or "faster". Claims are checked only about the chosen offer
 * (summary and reasons); the trade-offs may mention other stores' strengths. Only claims about data we hold are checked:
 * price, delivery, warranty, score, savings, eligibility and which store is recommended.
 */
export function validateBuyerFinal(final: BuyerFinal, offers: Offer[], budgetCents: number, check: FinalCheck = {}): string | null {
  const chosen = offers.find((o) => o.offerId === final.chosenOfferId);
  if (!chosen) return "unknown_offer";
  if (!chosen.eligible) return "chosen_offer_not_eligible";
  if (check.topOfferId && chosen.offerId !== check.topOfferId) return "not_server_top_ranked";
  const allowed = [budgetCents];
  for (const o of offers) {
    allowed.push(o.initialPriceCents, o.finalPriceCents, o.discountCents);
    if (o.catalog) allowed.push(o.catalog.itemPriceCents, o.catalog.shippingCents);
  }
  const grounded = ungroundedAmount([final.summary, ...final.reasons, ...final.tradeoffs], allowed);
  if (grounded) return grounded;

  const buyable = offers.filter((o) => o.eligible);
  const praise = [final.summary, ...final.reasons].join(" ");
  if (/\b(lowest|cheapest|best)\s+(total\s+)?(price|cost)\b|\bcheapest\b|\blowest total\b/i.test(praise) && chosen.finalPriceCents > Math.min(...buyable.map((o) => o.finalPriceCents))) return "unsupported_claim:lowest_price";
  if (/\bfastest\b/i.test(praise) && chosen.deliveryDays > Math.min(...buyable.map((o) => o.deliveryDays))) return "unsupported_claim:fastest_delivery";
  if (/\blongest\s+warranty\b/i.test(praise) && chosen.warrantyMonths < Math.max(...buyable.map((o) => o.warrantyMonths))) return "unsupported_claim:longest_warranty";
  if (check.scores && /\b(highest|best|top)\s+(match\s+)?score\b|\b(highest|top)[- ]ranked\b/i.test(praise)) {
    const best = Math.max(...buyable.map((o) => check.scores?.[o.offerId] ?? -1));
    if ((check.scores[chosen.offerId] ?? -1) < best) return "unsupported_claim:best_score";
  }
  // A "saving" must be a saving the server recorded: the chosen offer's discount from its own opening price.
  for (const m of praise.matchAll(/\bsav(?:e|es|ed|ing|ings)\b[^.]{0,50}/gi)) {
    for (const cents of amountsInText(m[0])) if (cents !== chosen.discountCents) return "unsupported_claim:savings";
  }
  if (/\b(over|exceeds?|above|beyond)\s+(your\s+|the\s+)?budget\b|\bnot eligible\b|\bineligible\b/i.test(praise)) return "unsupported_claim:eligibility";
  for (const o of offers) {
    if (o.offerId === chosen.offerId) continue;
    const brand = SELLER_BRANDS[o.sellerId].brand;
    if (new RegExp(`(recommend[a-z]*|winner|best (match|value|pick|choice)).{0,12}${brand}`, "i").test(praise)) return "unsupported_claim:recommended_offer";
  }
  return null;
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

/**
 * Seller fallback (rules, used only when a model turn fails): open at list price; later, meet the buyer halfway within the
 * policy limits. The wording is in each seller's register and uses only the seller's own real terms; it is stored and shown as
 * "Rules fallback", never as a model message.
 */
export function rulesSellerReply(c: SellerContext): SellerReply {
  const { item, profile, previousItemCents: prev, targetItemCents: target } = c;
  const say = SELLER_FALLBACK_LINES[profile.strategy];
  if (prev === null) {
    return { action: "quote", priceCents: item.listPriceCents, message: say.open(profile) };
  }
  const wanted = Math.max(target ?? prev, item.minPriceCents);
  const cap = Math.floor((prev * profile.maxConcessionPerRoundBps) / 10_000);
  const step = Math.min(cap, Math.floor((prev - wanted) / 2));
  if (step <= 0) return { action: "hold", priceCents: prev, message: say.hold(profile) };
  return { action: "concede", priceCents: prev - step, message: say.concede(profile) };
}

const SELLER_FALLBACK_LINES: Record<SellerProfile["strategy"], { open: (p: SellerProfile) => string; hold: (p: SellerProfile) => string; concede: (p: SellerProfile) => string }> = {
  price_fighter: {
    open: () => "Here is our outlet price for this item.",
    hold: () => "That is already a sharp outlet price, so I will hold it.",
    concede: () => "Okay, I can sharpen the price a bit for you.",
  },
  fast_delivery: {
    open: (p) => (p.deliveryDays <= 1 ? "Our price, with next-day delivery included." : "Our price for this item."),
    hold: (p) => (p.deliveryDays <= 1 ? "The speed is part of the price, so I will hold it." : "I will hold the price."),
    concede: () => "I can adjust the price slightly; the service stays the same.",
  },
  premium_value: {
    open: (p) => `Our price, backed by a ${p.warrantyMonths}-month warranty.`,
    hold: (p) => `The ${p.warrantyMonths}-month warranty is part of the value, so I will hold the price.`,
    concede: () => "A small adjustment is possible; the full terms stay included.",
  },
  hard_negotiator: {
    open: () => "Listed price. Firm.",
    hold: () => "No room on the price.",
    concede: () => "One small step. That is all.",
  },
};

const BUYER_FALLBACK_LINES: Record<SellerId, string> = {
  nova: "Your outlet price is a good start. Can you sharpen it a little more?",
  orbit: "I like the delivery speed. Can you improve the price a little?",
  prism: "The warranty is valuable. Could you adjust the price a little?",
  vertex: "Your terms are clear. Is there any room on the price?",
};

/** Buyer fallback: ask every seller for 5% less, in a line that fits each store. Stored and shown as "Rules fallback". */
export function rulesBuyerRound(book: BookEntry[]): BuyerRound {
  return {
    rationale: "Asking each store for a small price improvement.",
    moves: book.map((b) => ({
      sellerId: b.sellerId,
      action: "counter" as const,
      targetPriceCents: Math.max(1, b.itemPriceCents - Math.floor(b.itemPriceCents / 20)),
      message: BUYER_FALLBACK_LINES[b.sellerId],
    })),
  };
}
