import { rankOffers, WEIGHTS } from "@/server/negotiation/ranking";
import { deliveryLabel, diffPhrases, diffVs, ineligibleLabel, warrantyLabel } from "@/lib/offer-view";
import { providerOfEvent } from "./provider";
import { formatEur } from "@/shared/format";
import { SELLER_BRANDS } from "@/shared/sellers";
import type { NegotiationEvent, NegotiationSession, Offer, Priority, SellerId } from "@/shared/contracts/types";

/**
 * Agent D's Decision Lab: the recommendation explained with data that already exists.
 *
 * Where each number comes from:
 *  - SCORES are the ones the server's ranking engine stored in `session.evaluation.scores`. Nothing is re-scored here
 *    except in the clearly labelled what-if view, which calls the very same `rankOffers`.
 *  - COMPONENTS (price / delivery / warranty points) are the real terms of that scoring formula (`WEIGHTS` and the same
 *    min-max normalisation across the four offers), recomputed from the stored offers. They are shown only when they
 *    add up to the stored score; otherwise the breakdown is hidden rather than guessed.
 *  - FACETS (cheapest, fastest...) are arithmetic over the eligible offers.
 *  - EVIDENCE keeps its origin: an AI turn, a rules fallback, a server check or a computation, each with the persisted
 *    events it came from.
 */
export type Component = "price" | "delivery" | "warranty";
export const COMPONENT_LABEL: Record<Component, string> = { price: "Price", delivery: "Delivery", warranty: "Warranty" };
export const PRIORITY_NAME: Record<Priority, string> = { lowest_price: "Lowest price", fast_delivery: "Fast delivery", best_value: "Best value" };

export type Components = Record<Component, number>;

function norm(value: number, min: number, max: number, higherIsBetter: boolean): number {
  if (max === min) return 100;
  const x = (value - min) / (max - min);
  return (higherIsBetter ? x : 1 - x) * 100;
}

/** Points each component contributes to an offer's 0-100 score (same formula as the server's `rankOffers`). */
export function scoreComponents(offers: readonly Offer[], priority: Priority): Record<string, Components> {
  const prices = offers.map((o) => o.finalPriceCents);
  const days = offers.map((o) => o.deliveryDays);
  const warranty = offers.map((o) => o.warrantyMonths);
  const w = WEIGHTS[priority];
  const out: Record<string, Components> = {};
  for (const o of offers) {
    out[o.offerId] = {
      price: (w.price * norm(o.finalPriceCents, Math.min(...prices), Math.max(...prices), false)) / 100,
      delivery: (w.delivery * norm(o.deliveryDays, Math.min(...days), Math.max(...days), false)) / 100,
      warranty: (w.warranty * norm(o.warrantyMonths, Math.min(...warranty), Math.max(...warranty), true)) / 100,
    };
  }
  return out;
}

export interface LabRow {
  offer: Offer;
  sellerId: SellerId;
  brand: string;
  /** The server's stored score (0-100). It is a ranking score, not a probability. */
  score: number | null;
  /** 1-based rank among eligible offers (null for offers that cannot be bought). */
  rank: number | null;
  eligible: boolean;
  whyNot: string | null;
  components: Components | null;
}

export type EvidenceOrigin = "ai" | "fallback" | "server" | "computed";
export const EVIDENCE_LABEL: Record<EvidenceOrigin, string> = { ai: "AI agent message", fallback: "Rules fallback", server: "Server check", computed: "Computed from offers" };

export interface EventRef {
  eventId: string;
  sequence: number;
  type: string;
  sellerId: SellerId | null;
}

export interface Evidence {
  id: string;
  origin: EvidenceOrigin;
  text: string;
  /** Persisted events this evidence comes from (empty for pure computations over the offers). */
  events: EventRef[];
}

export interface Conclusion {
  id: string;
  title: string;
  evidence: Evidence[];
}

export interface Facet {
  id: "cheapest" | "fastest" | "warranty" | "match" | "budget";
  label: string;
  sellerIds: SellerId[];
  value: string;
}

export interface LabData {
  winner: LabRow;
  rows: LabRow[];
  priority: Priority;
  weights: { price: number; delivery: number; warranty: number };
  /** True when the components reproduce every stored score exactly. */
  breakdownReliable: boolean;
  facets: Facet[];
  why: string[];
  conclusions: Conclusion[];
  explanation: { text: string; origin: EvidenceOrigin; model: string | null; provider: string | null };
  /** Agent D's own advantages / trade-offs for the pick (same origin as the explanation). */
  advantages: string[];
  tradeoffs: string[];
  /** The buyer agent chose an offer other than the server's top-ranked one (it was validated as eligible). */
  choseOffTop: boolean;
  runnerUp: LabRow | null;
}

const ref = (e: NegotiationEvent): EventRef => ({ eventId: e.eventId, sequence: e.sequence, type: e.type, sellerId: e.sellerId });

export function buildLab(session: Pick<NegotiationSession, "offers" | "events" | "intent" | "evaluation" | "recommendedOfferId" | "status" | "mode">): LabData | null {
  const { offers, evaluation: ev, intent } = session;
  const winnerOffer = offers.find((o) => o.offerId === session.recommendedOfferId);
  if (session.status === "negotiating" || session.status === "preparing" || !winnerOffer || !ev) return null;

  const comps = scoreComponents(offers, intent.priority);
  const reliable = offers.every((o) => typeof ev.scores[o.offerId] === "number" && Math.round(comps[o.offerId].price + comps[o.offerId].delivery + comps[o.offerId].warranty) === ev.scores[o.offerId]);
  const rankOf = new Map(ev.rankedOfferIds.map((id, i) => [id, i + 1]));

  const rows: LabRow[] = offers
    .map<LabRow>((o) => ({
      offer: o,
      sellerId: o.sellerId,
      brand: SELLER_BRANDS[o.sellerId].brand,
      score: typeof ev.scores[o.offerId] === "number" ? ev.scores[o.offerId] : null,
      rank: o.eligible ? (rankOf.get(o.offerId) ?? null) : null,
      eligible: o.eligible,
      whyNot: o.eligible ? null : ineligibleLabel(o.ineligibilityReasons),
      components: reliable ? comps[o.offerId] : null,
    }))
    .sort((a, b) => Number(!a.eligible) - Number(!b.eligible) || (a.rank ?? 99) - (b.rank ?? 99) || a.brand.localeCompare(b.brand));
  const winner = rows.find((r) => r.offer.offerId === winnerOffer.offerId) as LabRow;
  const runnerUp = rows.find((r) => r.eligible && r.offer.offerId !== winnerOffer.offerId) ?? null;
  const eligible = rows.filter((r) => r.eligible);

  /* ---- facets ---- */
  const best = (value: (o: Offer) => number, dir: "min" | "max"): SellerId[] => {
    if (eligible.length === 0) return [];
    const t = (dir === "min" ? Math.min : Math.max)(...eligible.map((r) => value(r.offer)));
    return eligible.filter((r) => value(r.offer) === t).map((r) => r.sellerId);
  };
  const cheapest = best((o) => o.finalPriceCents, "min");
  const fastest = best((o) => o.deliveryDays, "min");
  const longest = best((o) => o.warrantyMonths, "max");
  const underBudget = eligible.filter((r) => r.offer.finalPriceCents <= intent.budgetCents);
  const get = (id: SellerId) => (offers.find((o) => o.sellerId === id) as Offer);
  const facets: Facet[] = [
    { id: "cheapest", label: "Cheapest offer", sellerIds: cheapest, value: cheapest[0] ? formatEur(get(cheapest[0]).finalPriceCents) : "—" },
    { id: "fastest", label: "Fastest delivery", sellerIds: fastest, value: fastest[0] ? deliveryLabel(get(fastest[0]).deliveryDays) : "—" },
    { id: "warranty", label: "Longest warranty", sellerIds: longest, value: longest[0] ? warrantyLabel(get(longest[0]).warrantyMonths) : "—" },
    { id: "match", label: "Best match", sellerIds: [winner.sellerId], value: winner.score !== null ? `${winner.score}/100` : "—" },
    { id: "budget", label: "Under budget", sellerIds: underBudget.map((r) => r.sellerId), value: `${underBudget.length} of ${rows.length} within ${formatEur(intent.budgetCents)}` },
  ];

  /* ---- why this offer won: your priority -> the score -> the winner ---- */
  const w = WEIGHTS[intent.priority];
  const why: string[] = [`You chose “${PRIORITY_NAME[intent.priority]}”, so the server's score weighs price ${w.price}%, delivery ${w.delivery}% and warranty ${w.warranty}%.`];
  if (reliable && runnerUp && winner.components && runnerUp.components) {
    const parts = (["price", "delivery", "warranty"] as const)
      .map((c) => ({ c, d: (winner.components as Components)[c] - (runnerUp.components as Components)[c] }))
      .filter((x) => Math.abs(x.d) >= 0.5)
      .map((x) => `${x.d > 0 ? "+" : "−"}${Math.abs(x.d).toFixed(1)} on ${COMPONENT_LABEL[x.c].toLowerCase()}`);
    if (parts.length) why.push(`Against the runner-up, ${winner.brand} gains ${parts.join(", ")} (score points).`);
  }
  for (const p of intent.preferences) {
    const o = winner.offer;
    if (p === "warranty") why.push(`You also asked for a solid warranty: ${winner.brand} offers ${warrantyLabel(o.warrantyMonths)}${longest.includes(winner.sellerId) ? ", the longest among eligible offers" : ""}.`);
    if (p === "free_shipping") why.push(o.freeShipping ? `You also asked for free shipping: ${winner.brand} ships free.` : `You asked for free shipping, but ${winner.brand} charges for shipping; the server's score does not use this preference.`);
    if (p === "fast_delivery") why.push(`You also asked for fast delivery: ${winner.brand} delivers in ${deliveryLabel(o.deliveryDays).toLowerCase()}${fastest.includes(winner.sellerId) ? ", the fastest among eligible offers" : ""}.`);
  }
  // The server's ranking decides the recommendation. If Agent D proposed another offer, that discrepancy was recorded on the
  // final decision event; it is shown as technical information and never changes the recommended offer.
  const discrepancy = session.events.find((e) => e.type === "BUYER_DECISION" && e.payload.final === true)?.payload.discrepancy as { agentProposalOfferId?: string } | undefined;
  const proposed = discrepancy?.agentProposalOfferId ? offers.find((o) => o.offerId === discrepancy.agentProposalOfferId) : undefined;
  const legacyOffTop = !discrepancy && ev.rankedOfferIds[0] !== undefined && ev.rankedOfferIds[0] !== session.recommendedOfferId; // sessions from before the rule
  const choseOffTop = !!proposed || legacyOffTop;
  if (proposed) why.push(`Agent D's own proposal was ${SELLER_BRANDS[proposed.sellerId].brand}. The server's ranking decides which offer is recommended, so ${winnerOffer.sellerId === proposed.sellerId ? "" : SELLER_BRANDS[winnerOffer.sellerId].brand + " "}stands (recorded as a technical discrepancy).`);
  else if (legacyOffTop) why.push("Agent D chose a different offer from the server's top-ranked one. The server checked that it is eligible and within budget before accepting it.");

  /* ---- evidence, per conclusion ---- */
  const evOf = (types: string[], sellerId?: SellerId) => session.events.filter((e) => types.includes(e.type) && (!sellerId || e.sellerId === sellerId)).map(ref);
  const finalDecision = session.events.find((e) => e.type === "BUYER_DECISION" && e.payload.final === true);
  const explanationOrigin: EvidenceOrigin = ev.source === "llm" ? "ai" : "fallback";
  const winnerEvidence: Evidence[] = [
    { id: "w-expl", origin: explanationOrigin, text: ev.aiSummary, events: finalDecision ? [ref(finalDecision)] : [] },
    ...(winner.score !== null ? [{ id: "w-score", origin: "server" as const, text: `Server score for ${winner.brand}: ${winner.score}/100 (rank ${winner.rank ?? "–"} of ${eligible.length} eligible).`, events: evOf(["OFFER_EVALUATED"], winner.sellerId) }] : []),
    { id: "w-budget", origin: "server", text: `Server budget check: ${formatEur(winner.offer.finalPriceCents)} against your ${formatEur(intent.budgetCents)} budget.`, events: evOf(["REQUIREMENT_VERIFIED"], winner.sellerId) },
    { id: "w-pick", origin: "server", text: "The recommendation was validated by the server before it became approvable.", events: evOf(["WINNER_SELECTED"]) },
    { id: "w-facts", origin: "computed", text: [cheapest.includes(winner.sellerId) ? "Cheapest eligible offer" : null, fastest.includes(winner.sellerId) ? "Fastest eligible delivery" : null, longest.includes(winner.sellerId) ? "Longest eligible warranty" : null].filter(Boolean).join(" · ") || "Not the best on any single measure: it wins on the combined score.", events: [] },
  ];
  const conclusions: Conclusion[] = [{ id: "winner", title: `Why ${winner.brand}`, evidence: winnerEvidence }];
  for (const r of rows) {
    if (r.offer.offerId === winnerOffer.offerId) continue;
    const phrases = diffPhrases(diffVs(r.offer, winner.offer), formatEur);
    const items: Evidence[] = [];
    if (!r.eligible) items.push({ id: `${r.sellerId}-out`, origin: "server", text: `${r.brand} was set aside by the server: ${r.whyNot?.toLowerCase()}. This is not a decision by the store.`, events: evOf(["SELLER_REJECTED", "REQUIREMENT_VERIFIED"], r.sellerId) });
    else if (r.score !== null) items.push({ id: `${r.sellerId}-score`, origin: "server", text: `Server score for ${r.brand}: ${r.score}/100${winner.score !== null ? ` (${winner.brand}: ${winner.score}/100)` : ""}.`, events: evOf(["OFFER_EVALUATED"], r.sellerId) });
    if (phrases.length) items.push({ id: `${r.sellerId}-diff`, origin: "computed", text: `Compared with ${winner.brand}: ${phrases.join(", ")}.`, events: [] });
    conclusions.push({ id: r.sellerId, title: `Why not ${r.brand}`, evidence: items });
  }

  return {
    winner,
    rows,
    priority: intent.priority,
    weights: w,
    breakdownReliable: reliable,
    facets,
    why,
    conclusions,
    explanation: { text: ev.aiSummary, origin: explanationOrigin, model: ev.modelName, provider: ev.source === "llm" ? (ev.provider ?? (finalDecision ? providerOfEvent(finalDecision) : null) ?? "gemini") : null },
    advantages: ev.aiReasons,
    tradeoffs: ev.tradeoffs,
    choseOffTop,
    runnerUp,
  };
}

/** What-if comparison: the same ranking engine under another priority. Informational; it changes nothing. */
export function whatIf(offers: readonly Offer[], priority: Priority): { winnerOfferId: string; rankedOfferIds: string[]; scores: Record<string, number> } | null {
  try {
    const r = rankOffers([...offers], priority);
    return { winnerOfferId: r.recommendedOfferId, rankedOfferIds: r.rankedOfferIds, scores: r.scores };
  } catch {
    return null; // no eligible offers
  }
}

/** Plain-words comparison of one store against another (used when you select a store in the lab). */
export function compareTo(a: Offer, base: Offer): string[] {
  const d = diffVs(a, base);
  const out = diffPhrases(d, formatEur);
  if (a.freeShipping !== base.freeShipping) out.push(a.freeShipping ? "free shipping (the pick charges for it)" : "paid shipping (the pick ships free)");
  return out;
}

