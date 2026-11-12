import { formatEur } from "@/shared/format";
import type { Preference, Priority, SellerId } from "@/shared/contracts/types";

/**
 * Scripted lines for the RULE-BASED simulation (engine V0).
 *
 * The V0 engine persists only terse lines ("Can you improve your price within my budget?"). V4 gives each character a
 * voice by composing a line from DATA THE SERVER ALREADY VALIDATED: prices recorded in events, the store's own terms,
 * the shopper's stated priority/preferences, and offers that were already visible earlier in the replay.
 *
 * Rules (tests/v4-scripts.test.ts):
 *  - No model is called. The result is deterministic: same event -> same line.
 *  - Euro amounts quoted in a line are always amounts the server recorded (prices, budget), never computed ones.
 *  - Comparisons mention only offers that were already known when the line is spoken.
 *  - A line never claims a fact the data does not show (e.g. "next-day" only when delivery is <= 1 day).
 *  - These lines are always shown as "Rule-based simulation": they are never presented as AI messages.
 */

export interface TermFacts {
  deliveryDays: number | null;
  warrantyMonths: number | null;
  freeShipping: boolean | null;
}

export interface KnownOffer extends TermFacts {
  sellerId: SellerId;
  /** Latest all-in price the server validated for this store. */
  totalCents: number;
}

/** Deterministic pick: the same seed always chooses the same variant. */
export function pick<T>(variants: readonly T[], seed: string): T {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  return variants[Math.abs(h) % variants.length];
}

const ship = (f: TermFacts): string => (f.freeShipping ? " and free shipping" : "");
/** "next-day", "6-day": reads naturally before the noun ("6-day delivery"). */
const delivery = (f: TermFacts): string | null => (f.deliveryDays === null ? null : f.deliveryDays <= 1 ? "next-day" : `${f.deliveryDays}-day`);
/** "3-year", "18-month": reads naturally before "warranty". */
const warranty = (f: TermFacts): string | null => (f.warrantyMonths === null ? null : f.warrantyMonths >= 12 && f.warrantyMonths % 12 === 0 ? `${f.warrantyMonths / 12}-year` : `${f.warrantyMonths}-month`);

/* ---------- seller: opening offer ---------- */

export function sellerOpening(id: SellerId, priceCents: number, f: TermFacts, seed: string): string {
  const price = formatEur(priceCents);
  const d = delivery(f);
  const w = warranty(f);
  switch (id) {
    case "nova":
      return pick(
        [
          f.deliveryDays !== null && f.deliveryDays >= 4 ? `Here's my outlet price: ${price}. Delivery takes ${f.deliveryDays} days, and that's how I keep it low.` : `Here's my outlet price: ${price}. Good value, and I'm open to talking.`,
          `${price}, straight up. Great value, and I like to close deals.`,
        ],
        seed,
      );
    case "orbit":
      return pick([`${price}${d ? `, ${d} delivery` : ""}${ship(f)}. Speed is where I stand out.`, `Fast and simple: ${price}${d ? ` with ${d} delivery` : ""}.`], seed);
    case "prism":
      return pick(
        [
          f.warrantyMonths !== null && f.warrantyMonths >= 24 ? `${price} with a ${w} warranty${ship(f)}. Long-term protection is part of the value.` : `${price}${w ? ` with a ${w} warranty` : ""}${ship(f)}.`,
          `My proposal is ${price}${w ? `, backed by a ${w} warranty` : ""}.`,
        ],
        seed,
      );
    case "vertex":
      return pick([`${price}. Firm.${d ? ` ${cap(d)} delivery` : ""}${w ? `, ${w} warranty` : ""}.`, `${price}, direct from the brand. I don't haggle for sport.`], seed);
  }
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- buyer: the ask ---------- */

export interface AskContext {
  target: SellerId;
  priority: Priority;
  preferences: readonly Preference[];
  budgetCents: number;
  /** The store being asked (already visible), and the other offers already visible at this point of the replay. */
  own: KnownOffer | null;
  others: readonly KnownOffer[];
}

const LEAD: Record<SellerId, (own: KnownOffer | null) => string[]> = {
  nova: () => ["Your outlet price is a good start.", "Nice price to start with."],
  orbit: (o) => (o && o.deliveryDays !== null && o.deliveryDays <= 2 ? ["I like the speed you offer.", "Fast delivery is a strong point."] : ["Thanks for the offer."]),
  prism: (o) => (o && o.warrantyMonths !== null && o.warrantyMonths >= 24 ? ["The warranty is a real plus.", "I can see the value in your terms."] : ["Thanks for the offer."]),
  vertex: () => ["Thanks for the clear offer.", "I see your terms are firm."],
};

function priorityClause(priority: Priority, preferences: readonly Preference[]): string {
  const base =
    priority === "lowest_price" ? "Price is my shopper's top priority." : priority === "fast_delivery" ? "Delivery speed matters most to my shopper." : "My shopper is weighing price, delivery and warranty together.";
  const extra = preferences.includes("warranty") ? " A solid warranty counts too." : preferences.includes("free_shipping") ? " Free shipping would help." : preferences.includes("fast_delivery") && priority !== "fast_delivery" ? " Quick delivery counts too." : "";
  return base + extra;
}

/** One comparison, only against offers already known: cheaper, faster or longer warranty, whichever fits the priority first. */
export function comparisonClause(ctx: Pick<AskContext, "own" | "others" | "priority">): string | null {
  const { own, others } = ctx;
  if (!own || others.length === 0) return null;
  const cheaper = others.filter((o) => o.totalCents < own.totalCents).sort((a, b) => a.totalCents - b.totalCents)[0];
  const faster = own.deliveryDays !== null ? others.find((o) => o.deliveryDays !== null && o.deliveryDays < (own.deliveryDays as number)) : undefined;
  const longer = own.warrantyMonths !== null ? others.find((o) => o.warrantyMonths !== null && o.warrantyMonths > (own.warrantyMonths as number)) : undefined;
  const order = ctx.priority === "fast_delivery" ? ["faster", "cheaper", "longer"] : ctx.priority === "best_value" ? ["cheaper", "longer", "faster"] : ["cheaper", "faster", "longer"];
  for (const k of order) {
    if (k === "cheaper" && cheaper) return `Another store is at ${formatEur(cheaper.totalCents)} in total.`;
    if (k === "faster" && faster) return "Another seller delivers sooner.";
    if (k === "longer" && longer) return "Another seller offers a longer warranty.";
  }
  return null;
}

export function buyerAsk(ctx: AskContext, seed: string): string {
  const lead = pick(LEAD[ctx.target](ctx.own), seed + ":lead");
  const close = pick(["Can you improve your proposal?", "What can you offer?", "Can you do better?"], seed + ":close");
  return [lead, priorityClause(ctx.priority, ctx.preferences), comparisonClause(ctx), close].filter(Boolean).join(" ");
}

/* ---------- seller: the reply ---------- */

export function sellerReply(id: SellerId, o: { previousCents: number | null; newCents: number; held: boolean }, f: TermFacts, seed: string): string {
  const now = formatEur(o.newCents);
  const d = delivery(f);
  const w = warranty(f);
  if (o.held) {
    switch (id) {
      case "nova":
        return pick([`I can't go lower than ${now} on this one.`, `${now} is already a sharp price.`], seed);
      case "orbit":
        return pick([`${now} is my price. The delivery is the value.`, `I can't move on ${now}; the service is included.`], seed);
      case "prism":
        return pick([`I'll keep ${now}. The warranty is part of what you are buying.`, `${now} reflects the full service I offer.`], seed);
      case "vertex":
        return pick([`I've reviewed your proposal. I can't offer that price under the current terms.`, `${now} stands.`], seed);
    }
  }
  const was = o.previousCents !== null ? ` (was ${formatEur(o.previousCents)})` : "";
  switch (id) {
    case "nova":
      return pick([`You drive a hard bargain. I can do ${now}${was}.`, `I can make this more attractive: ${now}${was}.`, `Okay, you convinced me: ${now}${was}.`], seed);
    case "orbit":
      return pick([`I can adjust to ${now}${was}.${d ? ` ${cap(d)} delivery stays.` : ""}`, `${now} is my best adjustment${was}. Speed is where I stand out.`], seed);
    case "prism":
      return pick(
        [
          f.warrantyMonths !== null && f.warrantyMonths >= 24 ? `I can come to ${now}${was}, with the ${w} warranty still included.` : `I can come to ${now}${was}.`,
          f.warrantyMonths !== null && f.warrantyMonths >= 24 ? `A small adjustment to ${now}. Long-term protection stays part of the value.` : `A small adjustment to ${now}.`,
        ],
        seed,
      );
    case "vertex":
      return pick([`${now}${was}. That's the limit under the current terms.`, `One small step: ${now}. That is all I can do.`], seed);
  }
}
