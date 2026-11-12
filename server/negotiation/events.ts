import { randomUUID } from "node:crypto";
import type {
  EventPhase,
  EventType,
  Evaluation,
  NegotiationEvent,
  Offer,
  ProductIntent,
  SellerId,
} from "@/shared/contracts/types";
import { SELLER_POLICIES } from "./policies";
import { formatEur } from "./intent";

const REASON_TEXT: Record<string, string> = {
  over_budget: "exceeds your budget",
  invalid_policy: "failed policy validation",
};

/**
 * Turns validated offers + evaluation into an ordered timeline (0-52 000 ms at 1x).
 * Events only describe decisions already made on the server; they never change prices.
 */
export function composeEvents(
  sessionId: string,
  intent: ProductIntent,
  offers: Offer[],
  evaluation: Pick<Evaluation, "recommendedOfferId" | "scores">,
): NegotiationEvent[] {
  const events: NegotiationEvent[] = [];
  let sequence = 0;
  const push = (
    atMs: number,
    phase: EventPhase,
    type: EventType,
    sellerId: SellerId | null,
    payload: Record<string, unknown>,
    feedText: string,
  ) =>
    events.push({
      eventId: `evt_${randomUUID()}`,
      sessionId,
      sequence: sequence++,
      atMs,
      phase,
      type,
      sellerId,
      payload,
      feedText,
    });

  push(
    500,
    "initialize",
    "AGENT_INITIALIZED",
    null,
    { productQuery: intent.productQuery, budgetCents: intent.budgetCents },
    `Your agent is looking for "${intent.productQuery}" with a maximum budget of ${formatEur(intent.budgetCents)}.`,
  );

  offers.forEach((o, i) => {
    const p = SELLER_POLICIES[o.sellerId];
    push(
      4500 + i * 1400,
      "discover",
      "SELLER_DISCOVERED",
      o.sellerId,
      { sellerId: o.sellerId, strategy: p.strategy },
      `${p.displayName} joined the simulated negotiation.`,
    );
  });

  offers.forEach((o, i) => {
    const p = SELLER_POLICIES[o.sellerId];
    push(
      10500 + i * 2200,
      "offers",
      "OFFER_RECEIVED",
      o.sellerId,
      { offerId: o.offerId, initialPriceCents: o.initialPriceCents },
      `${p.displayName} opened at ${formatEur(o.initialPriceCents)}.`,
    );
  });

  offers.forEach((o, i) => {
    const p = SELLER_POLICIES[o.sellerId];
    const base = 20500 + i * 4400;
    push(
      base,
      "negotiate",
      "BUYER_MESSAGE",
      o.sellerId,
      { sellerId: o.sellerId, message: "Can you improve your price within my budget?" },
      `Your agent asked ${p.displayName} to improve its price.`,
    );
    if (o.discountCents > 0) {
      push(
        base + 2000,
        "negotiate",
        "COUNTEROFFER_RECEIVED",
        o.sellerId,
        {
          offerId: o.offerId,
          previousPriceCents: o.initialPriceCents,
          newPriceCents: o.finalPriceCents,
          message: `Best I can do is ${formatEur(o.finalPriceCents)}.`,
        },
        `${p.displayName} made a new offer: ${formatEur(o.finalPriceCents)} (was ${formatEur(o.initialPriceCents)}).`,
      );
    }
  });

  offers.forEach((o, i) => {
    const p = SELLER_POLICIES[o.sellerId];
    const at = 38500 + i * 1700;
    push(
      at,
      "evaluate",
      "REQUIREMENT_VERIFIED",
      o.sellerId,
      { offerId: o.offerId, requirement: "within_budget", passed: o.finalPriceCents <= intent.budgetCents },
      o.finalPriceCents <= intent.budgetCents
        ? `${p.displayName} is within your budget.`
        : `${p.displayName} exceeds your budget.`,
    );
    if (!o.eligible) {
      const why = o.ineligibilityReasons.map((r) => REASON_TEXT[r] ?? r).join(", ");
      push(
        at + 600,
        "evaluate",
        "SELLER_REJECTED",
        o.sellerId,
        { offerId: o.offerId, reasonCode: o.ineligibilityReasons[0] ?? "ineligible" },
        `${p.displayName} was set aside: ${why}.`,
      );
    } else {
      push(
        at + 600,
        "evaluate",
        "OFFER_EVALUATED",
        o.sellerId,
        { offerId: o.offerId, score: evaluation.scores[o.offerId], reason: "eligible" },
        `${p.displayName} scored ${evaluation.scores[o.offerId]}/100 for your priorities.`,
      );
    }
  });

  const winner = offers.find((o) => o.offerId === evaluation.recommendedOfferId);
  if (!winner || !winner.eligible) throw new Error("Recommended offer must exist and be eligible.");
  const wp = SELLER_POLICIES[winner.sellerId];
  push(
    47000,
    "complete",
    "WINNER_SELECTED",
    winner.sellerId,
    { offerId: winner.offerId, reason: "best_match" },
    `Best match for your preferences: ${wp.displayName} at ${formatEur(winner.finalPriceCents)}.`,
  );
  push(
    51500,
    "complete",
    "NEGOTIATION_COMPLETE",
    null,
    { recommendedOfferId: winner.offerId },
    "Negotiation complete. Review the deal before paying.",
  );

  // atMs must be non-decreasing in sequence order.
  events.sort((a, b) => a.atMs - b.atMs || a.sequence - b.sequence);
  events.forEach((e, i) => (e.sequence = i));
  return events;
}
