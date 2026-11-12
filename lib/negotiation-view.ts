import { SELLER_BRANDS } from "@/shared/sellers";
import {
  SELLER_IDS,
  type NegotiationEvent,
  type NegotiationSession,
  type Offer,
  type SellerId,
} from "@/shared/contracts/types";

/**
 * Pure view-model for the negotiation screen. Everything here is derived from persisted events
 * (and the session's offers, revealed only once the matching event is visible), so the UI can never
 * show activity the backend did not record.
 */
export type SellerStatus = "waiting" | "joined" | "asked" | "offered" | "countered" | "set_aside" | "winner";

export interface SellerState {
  id: SellerId;
  brand: string;
  tagline: string;
  discovered: boolean;
  status: SellerStatus;
  /** Current all-in offer price once an offer event is visible. */
  priceCents: number | null;
  /** Price before the latest counter-offer (only when it actually changed). */
  previousCents: number | null;
  openingCents: number | null;
  message: string | null;
  /** "gemini" = real model reply, "rules_fallback" = deterministic fallback, null = rule-based simulation. */
  source: "gemini" | "rules_fallback" | null;
  /** Buyer asked, seller hasn't replied yet (a real, recorded state). */
  awaitingReply: boolean;
  rejectedReason: string | null;
  score: number | null;
  winner: boolean;
  /** Offer terms, revealed once this seller's offer event is visible. */
  offer: Offer | null;
  /** This seller's own events, oldest first. */
  history: NegotiationEvent[];
}

export type EventKind = "buyer" | "seller" | "decision" | "system" | "warning";

export function eventKind(e: NegotiationEvent): EventKind {
  switch (e.type) {
    case "BUYER_MESSAGE":
    case "BUYER_DECISION":
    case "AGENT_INITIALIZED":
      return "buyer";
    case "OFFER_RECEIVED":
    case "COUNTEROFFER_RECEIVED":
    case "SELLER_DISCOVERED":
      return "seller";
    case "WINNER_SELECTED":
    case "NEGOTIATION_COMPLETE":
      return "decision";
    case "AGENT_FALLBACK":
    case "OFFER_REJECTED_BY_SERVER":
    case "SELLER_REJECTED":
      return "warning";
    default:
      return "system";
  }
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function deriveSellers(session: NegotiationSession, visible: NegotiationEvent[]): SellerState[] {
  // "Awaiting reply" is only a real state for live agents. The rule-based simulation pre-computes every
  // reply, and a seller that simply holds its price emits no event, so waiting there would be invented.
  const trackReplies = session.mode === "multi_agent" && session.status === "negotiating";
  const offerById = new Map(session.offers.map((o) => [o.offerId, o]));
  return SELLER_IDS.map((id) => {
    const brand = SELLER_BRANDS[id];
    const mine = visible.filter((e) => e.sellerId === id);
    const first = (t: string) => mine.find((e) => e.type === t);
    const last = (t: string) => [...mine].reverse().find((e) => e.type === t);

    const opened = first("OFFER_RECEIVED");
    const counter = last("COUNTEROFFER_RECEIVED");
    const lastAsk = last("BUYER_MESSAGE");
    const lastReply = [opened, counter]
      .filter((e): e is NegotiationEvent => !!e)
      .sort((a, b) => a.atMs - b.atMs || a.sequence - b.sequence)
      .at(-1);
    const rejected = last("SELLER_REJECTED");
    const evaluated = last("OFFER_EVALUATED");
    const winner = mine.some(
      (e) =>
        e.type === "WINNER_SELECTED" && offerById.get(String(e.payload.offerId))?.sellerId === id,
    );

    const awaitingReply = trackReplies && !!lastAsk && (!lastReply || lastReply.sequence < lastAsk.sequence) && !rejected && !winner;
    const sourceRaw = lastReply ? lastReply.payload.source : null;
    const priceCents = counter ? num(counter.payload.newPriceCents) : opened ? num(opened.payload.initialPriceCents) : null;
    const previousRaw = counter ? num(counter.payload.previousPriceCents) : null;
    const offerId = String(opened?.payload.offerId ?? counter?.payload.offerId ?? rejected?.payload.offerId ?? "");
    const offer = opened || rejected ? (offerById.get(offerId) ?? session.offers.find((o) => o.sellerId === id) ?? null) : null;

    let status: SellerStatus = "waiting";
    if (mine.some((e) => e.type === "SELLER_DISCOVERED")) status = "joined";
    if (opened) status = "offered";
    if (counter) status = "countered";
    if (awaitingReply) status = "asked";
    if (rejected) status = "set_aside";
    if (winner) status = "winner";

    return {
      id,
      brand: brand.brand,
      tagline: brand.tagline,
      discovered: status !== "waiting",
      status,
      priceCents,
      previousCents: previousRaw !== null && previousRaw !== priceCents ? previousRaw : null,
      openingCents: opened ? num(opened.payload.initialPriceCents) : null,
      message: lastReply && sourceRaw && typeof lastReply.payload.message === "string" ? lastReply.payload.message : null,
      source: sourceRaw === "gemini" || sourceRaw === "rules_fallback" ? sourceRaw : null,
      awaitingReply,
      rejectedReason: rejected ? String(rejected.payload.reasonCode ?? "ineligible") : null,
      score: evaluated ? num(evaluated.payload.score) : null,
      winner,
      offer,
      history: mine,
    };
  });
}

export interface Pulse {
  key: string;
  sellerId: SellerId;
  /** out = buyer agent asks the seller; in = seller sends an offer to the buyer. */
  direction: "out" | "in";
}

/** Events that happened within the last `windowMs` and travel along an edge. */
export function activePulses(events: NegotiationEvent[], elapsed: number, windowMs: number): Pulse[] {
  const out: Pulse[] = [];
  for (const e of events) {
    if (!e.sellerId) continue;
    const age = elapsed - e.atMs;
    if (age < 0 || age >= windowMs) continue;
    if (e.type === "BUYER_MESSAGE") out.push({ key: e.eventId, sellerId: e.sellerId, direction: "out" });
    else if (e.type === "OFFER_RECEIVED" || e.type === "COUNTEROFFER_RECEIVED") {
      out.push({ key: e.eventId, sellerId: e.sellerId, direction: "in" });
    }
  }
  return out;
}

export function rejectionLabel(code: string | null): string {
  if (code === "over_budget") return "Over your budget";
  if (code === "out_of_stock") return "Out of stock";
  if (code === "invalid_policy") return "Failed policy check";
  return "Set aside";
}

export const STATUS_LABEL: Record<SellerStatus, string> = {
  waiting: "Waiting to join",
  joined: "Joined",
  asked: "Awaiting reply",
  offered: "Offer received",
  countered: "Counter-offer",
  set_aside: "Set aside",
  winner: "Best match",
};

export interface AgentActivity {
  /** What the buyer agent is doing right now, derived only from markers currently travelling. */
  state: "idle" | "asking" | "receiving";
  sellerId: SellerId | null;
}

/** Drives the buyer node's `data-speaker` attribute and caption. No travelling marker = idle (nothing is claimed). */
export function agentActivity(pulses: Pulse[]): AgentActivity {
  const last = pulses.at(-1);
  if (!last) return { state: "idle", sellerId: null };
  return { state: last.direction === "out" ? "asking" : "receiving", sellerId: last.sellerId };
}

export interface Draft {
  joined: number;
  offers: number;
  total: number;
  counters: number;
  /** The cheapest priced offer so far. Plain arithmetic over visible events, NOT the server's recommendation. */
  lowest: { id: SellerId; brand: string; cents: number } | null;
  withinBudget: number;
  /** Only set once the winner event has happened (the server's recommendation). */
  recommended: { id: SellerId; brand: string; cents: number } | null;
}

/**
 * The deal slip as it fills in. Every value derives from events that are already visible, and each row stays empty
 * (a placeholder) until the event that produces it. "Lowest so far" is deliberately not called a recommendation.
 */
export function deriveDraft(sellers: SellerState[], budgetCents: number): Draft {
  const priced = sellers.filter((s) => s.priceCents !== null && s.status !== "set_aside");
  const lowest = priced.reduce<SellerState | null>((m, s) => (m === null || (s.priceCents as number) < (m.priceCents as number) ? s : m), null);
  const win = sellers.find((s) => s.winner) ?? null;
  const pick = (s: SellerState | null) => (s && s.priceCents !== null ? { id: s.id, brand: s.brand, cents: s.priceCents } : null);
  return {
    joined: sellers.filter((s) => s.discovered).length,
    offers: sellers.filter((s) => s.priceCents !== null).length,
    total: sellers.length,
    counters: sellers.filter((s) => s.previousCents !== null).length,
    lowest: pick(lowest),
    withinBudget: priced.filter((s) => (s.priceCents as number) <= budgetCents).length,
    recommended: pick(win),
  };
}
