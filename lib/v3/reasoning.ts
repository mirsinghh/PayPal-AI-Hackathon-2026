import { deliveryLabel, warrantyLabel } from "@/lib/offer-view";
import type { SellerState } from "@/lib/negotiation-view";
import { formatEur } from "@/shared/format";
import { SELLER_BRANDS } from "@/shared/sellers";
import { isAi } from "./activity";
import type { NegotiationEvent } from "@/shared/contracts/types";

/**
 * Observable reasoning: what the persisted events say about *why* Agent D acted, and nothing else.
 *
 * Each item comes from one recorded event and says where its words came from:
 *   ai        text written by a real model turn (payload.source === "gemini")
 *   fallback  the rules engine covered a failed or rejected AI turn
 *   server    a fact the server computed or checked (budget check, score, set-aside, winner)
 *   computed  arithmetic over the offers on screen (see `tradeoffFacts`)
 * No private "thoughts" are invented: when an event carries no explanation the item simply has none.
 */
export type ReasoningOrigin = "ai" | "fallback" | "server" | "computed";

export interface ReasoningItem {
  eventId: string;
  title: string;
  /** Recorded text (a model's rationale or message), only when the event carries it. */
  detail: string | null;
  /** Concrete numbers/facts from the payload. */
  evidence: string[];
  origin: ReasoningOrigin;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const brandOf = (e: NegotiationEvent): string => (e.sellerId ? SELLER_BRANDS[e.sellerId].brand : "A store");
const originOf = (e: NegotiationEvent): ReasoningOrigin => (isAi(e.payload.source) ? "ai" : e.payload.source === "rules_fallback" ? "fallback" : "server");
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function reasoningForEvent(e: NegotiationEvent): ReasoningItem | null {
  const brand = brandOf(e);
  const item = (title: string, origin: ReasoningOrigin, detail: string | null = null, evidence: string[] = []): ReasoningItem => ({ eventId: e.eventId, title, detail, evidence, origin });
  // Words only count as the model's when the event says a model (or the fallback) produced them.
  const said = isAi(e.payload.source) || e.payload.source === "rules_fallback" ? text(e.payload.message) : null;

  switch (e.type) {
    case "BUYER_DECISION": {
      const round = num(e.payload.round);
      const rationale = e.feedText.replace(/^Round \d+:\s*/, "").trim() || null;
      return e.payload.final === true
        ? item("Agent D's final choice", originOf(e), rationale, ["Validated by the server before it became the recommendation"])
        : item(round !== null ? `Agent D's plan for round ${round}` : "Agent D's plan", originOf(e), rationale);
    }
    case "OFFER_RECEIVED": {
      const p = num(e.payload.initialPriceCents);
      return item(`${brand} opened`, originOf(e), said, p !== null ? [`Opening offer ${formatEur(p)}`] : []);
    }
    case "BUYER_MESSAGE": {
      const target = num(e.payload.targetPriceCents);
      return item(`Agent D asked ${brand} for a better price`, originOf(e), said, target !== null ? [`Target for the item: ${formatEur(target)}`] : []);
    }
    case "COUNTEROFFER_RECEIVED": {
      const prev = num(e.payload.previousPriceCents);
      const next = num(e.payload.newPriceCents);
      const ev =
        prev !== null && next !== null ? (next < prev && e.payload.held !== true ? [`${formatEur(prev)} → ${formatEur(next)}`] : [`Price kept at ${formatEur(next)}`]) : [];
      return item(`${brand} replied`, originOf(e), said, ev);
    }
    case "REQUIREMENT_VERIFIED":
      return item(`Budget check: ${brand}`, "server", null, [e.payload.passed === true ? "Within your budget" : "Over your budget"]);
    case "OFFER_EVALUATED": {
      const score = num(e.payload.score);
      return item(`Scored ${brand}`, "server", null, score !== null ? [`${score}/100 for your priority`] : []);
    }
    case "SELLER_REJECTED":
      return item(`Set ${brand} aside`, "server", null, [e.payload.reasonCode === "over_budget" ? "Over your budget" : e.payload.reasonCode === "out_of_stock" ? "Out of stock" : "Failed the policy check"]);
    case "WINNER_SELECTED":
      return item(`Strongest eligible offer: ${brand}`, "server", null, [e.payload.reason === "buyer_agent_choice_validated" ? "Chosen by the buyer agent, then validated by the server" : "Highest match score among eligible offers"]);
    case "AGENT_FALLBACK":
      return item("A rule-based move covered an AI turn", "fallback", e.feedText, ["Not a store decision"]);
    case "OFFER_REJECTED_BY_SERVER":
      return item("The server rejected a proposal", "server", e.feedText, ["Not a store decision", "The last valid price stands"]);
    default:
      return null;
  }
}

export function deriveReasoning(visible: readonly NegotiationEvent[]): ReasoningItem[] {
  return visible.flatMap((e) => reasoningForEvent(e) ?? []);
}

/**
 * The trade-off Agent D is weighing, computed from the offers already revealed on screen: who is cheapest, who is
 * fastest, who has the longest warranty. Arithmetic over visible data, labelled "computed" in the UI.
 */
export function tradeoffFacts(sellers: readonly SellerState[]): string[] {
  const live = sellers.filter((s) => s.offer && s.priceCents !== null && s.status !== "set_aside");
  if (live.length < 2) return [];
  const price = (s: SellerState) => s.priceCents as number;
  const cheapest = [...live].sort((a, b) => price(a) - price(b))[0];
  const fastest = [...live].sort((a, b) => (a.offer!.deliveryDays - b.offer!.deliveryDays) || price(a) - price(b))[0];
  const warranty = [...live].sort((a, b) => (b.offer!.warrantyMonths - a.offer!.warrantyMonths) || price(a) - price(b))[0];
  const out: string[] = [];
  if (cheapest.id !== fastest.id && fastest.offer!.deliveryDays < cheapest.offer!.deliveryDays)
    out.push(`${cheapest.brand} has the lowest price so far (${formatEur(price(cheapest))}), but ${fastest.brand} delivers sooner (${deliveryLabel(fastest.offer!.deliveryDays)} vs ${deliveryLabel(cheapest.offer!.deliveryDays)}).`);
  else out.push(`${cheapest.brand} has the lowest price so far (${formatEur(price(cheapest))}).`);
  if (warranty.id !== cheapest.id && warranty.offer!.warrantyMonths > cheapest.offer!.warrantyMonths)
    out.push(`${warranty.brand} offers the longest warranty (${warrantyLabel(warranty.offer!.warrantyMonths)}) for ${formatEur(price(warranty))}.`);
  return out;
}
