import type { EventPhase, NegotiationEvent, SellerId } from "@/shared/contracts/types";
import { SELLER_IDS } from "@/shared/contracts/types";
import { cycleMs, type AgentDVisualState } from "./manifest";
import type { ReactionInput } from "./director";

/**
 * Event -> Agent D adapter (the only place that decides what the mascot expresses).
 *
 * Rules that keep the character honest:
 *  - It reads persisted `NegotiationEvent`s only. It never invents an event, a reply or a price.
 *  - Expression follows what the payload really says: a "discount" needs a recorded price drop, a held price is just a
 *    reply, a server guardrail is a validation notice (never a store saying no).
 *  - `accept` and `payment_approved` are NOT mapped from negotiation events at all. They come only from the approval
 *    and payment endpoints' verified responses (see cueForApproval / cueForPayment).
 */

export type IndicatorKind = "fallback" | "validation";
export interface Indicator {
  kind: IndicatorKind;
  label: string;
}

export interface AgentDCue {
  /** The event id; the director plays a key once. */
  key: string;
  /** Short reaction on top of the ambient loop, or null when the event only updates data/text. */
  reaction: { state: AgentDVisualState; cycles?: number } | null;
  /** Informational chip (AI fallback, server validation). Deliberately NOT a facial reaction. */
  indicator: Indicator | null;
  /** Where Agent D should be standing for this event: the store it is about, or the comparison spot. */
  walkTo: Spot | null;
}

/** A store, or the middle of the stage where Agent D thinks and compares. */
export type Spot = SellerId | "center";

export const WALK_MS = 700;
/** The walk is a 'running' reaction timed to the movement across the stage. */
export const WALK_CYCLES = WALK_MS / cycleMs("run");

const isSeller = (v: unknown): v is SellerId => typeof v === "string" && (SELLER_IDS as readonly string[]).includes(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Ambient loop that fits the phase the persisted events have reached. */
export function baseStateForPhase(phase: EventPhase | null): AgentDVisualState {
  switch (phase) {
    case null:
    case "initialize":
      return "thinking"; // reading the mission
    case "discover":
    case "offers":
      return "searching";
    case "negotiate":
      return "negotiating";
    case "evaluate":
      return "thinking"; // comparing
    case "complete":
      return "idle";
  }
}

export function cueForEvent(e: NegotiationEvent): AgentDCue {
  const cue: AgentDCue = { key: e.eventId, reaction: null, indicator: null, walkTo: null };
  const seller = isSeller(e.sellerId) ? e.sellerId : null;

  switch (e.type) {
    case "AGENT_INITIALIZED":
      return cue; // ambient 'thinking' (phase initialize) already says it

    case "SELLER_DISCOVERED":
      return { ...cue, walkTo: seller, reaction: { state: "running", cycles: WALK_CYCLES } };

    case "OFFER_RECEIVED":
      return { ...cue, walkTo: seller, reaction: { state: "offer_received" } };

    case "BUYER_MESSAGE":
      // Agent D sends a counteroffer: the pack's laptop-and-arrows pose.
      return { ...cue, walkTo: seller, reaction: { state: "counteroffer" } };

    case "COUNTEROFFER_RECEIVED": {
      const prev = num(e.payload.previousPriceCents);
      const next = num(e.payload.newPriceCents);
      // Only a recorded, real drop earns the discount tag. A held price is simply a reply.
      const dropped = prev !== null && next !== null && next < prev && e.payload.held !== true;
      return { ...cue, walkTo: seller, reaction: { state: dropped ? "discount" : "offer_received" } };
    }

    case "SELLER_REJECTED": {
      // "Set aside" is a server verdict (over budget, out of stock, policy), not a store changing its mind.
      const reason = String(e.payload.reasonCode ?? "");
      return { ...cue, walkTo: e.phase === "evaluate" ? "center" : seller, reaction: { state: reason === "out_of_stock" ? "surprised" : "reject" } };
    }

    case "REQUIREMENT_VERIFIED":
    case "OFFER_EVALUATED":
    case "BUYER_DECISION":
      // Agent D is already thinking/comparing (ambient state); it just does that at the comparison spot.
      return { ...cue, walkTo: "center" };

    case "WINNER_SELECTED":
      return { ...cue, walkTo: seller, reaction: { state: "success" } };

    case "NEGOTIATION_COMPLETE":
      // A finished run that found nothing is a 'no', not a celebration. A normal finish adds no reaction:
      // the recommendation is ready, nothing has been paid.
      return e.payload.outcome === "no_offer_within_budget" ? { ...cue, reaction: { state: "reject" } } : cue;

    case "AGENT_FALLBACK":
      return { ...cue, indicator: { kind: "fallback", label: "Rules fallback used for one AI turn" } };

    case "OFFER_REJECTED_BY_SERVER":
      return { ...cue, indicator: { kind: "validation", label: "Server validation stopped a proposal" } };
  }
}

/** Reaction input for the director, plus the walk that precedes it when Agent D has to change stores. */
export function reactionsForCue(cue: AgentDCue, currentSpot: string | null): ReactionInput[] {
  const out: ReactionInput[] = [];
  const needsWalk = cue.walkTo !== null && cue.walkTo !== currentSpot && cue.reaction?.state !== "running";
  if (needsWalk) out.push({ key: `${cue.key}:walk`, state: "running", cycles: WALK_CYCLES, sellerId: cue.walkTo });
  if (cue.reaction) out.push({ key: cue.key, state: cue.reaction.state, cycles: cue.reaction.cycles, sellerId: cue.walkTo });
  return out;
}

/** Documentation/test helper: what Agent D is showing while this event is the latest recorded one. */
export function visualForEvent(e: NegotiationEvent): AgentDVisualState {
  return cueForEvent(e).reaction?.state ?? baseStateForPhase(e.phase);
}

/* ---------- Reactions that are NOT negotiation events: verified responses only ---------- */

/** `accept`: only when POST /approve answered 2xx with the very offer that was approved. */
export function cueForApproval(response: { approvedOfferId?: unknown } | null | undefined, offerId: string): ReactionInput | null {
  if (!response || response.approvedOfferId !== offerId) return null;
  return { key: `approval:${offerId}`, state: "accept" };
}

/** `payment_approved`: only when the payment record itself says "completed". Approval in PayPal is not enough. */
export function cueForPayment(payment: { status?: unknown; orderId?: unknown } | null | undefined): ReactionInput | null {
  if (!payment || payment.status !== "completed") return null;
  return { key: `payment:${String(payment.orderId ?? "completed")}`, state: "payment_approved" };
}
