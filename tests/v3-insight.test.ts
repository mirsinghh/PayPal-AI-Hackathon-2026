import { describe, expect, it } from "vitest";
import { prepareSession } from "@/server/negotiation/service";
import { deriveSellers } from "@/lib/negotiation-view";
import { dealIntel, tradeoffLines, valueLines } from "@/lib/v3/deal-intel";
import { deriveReasoning, reasoningForEvent, tradeoffFacts } from "@/lib/v3/reasoning";
import { buildTrail, type TrailInput } from "@/lib/v3/trail";
import type { EventPhase, EventType, NegotiationEvent, NegotiationSession, Offer, ProductIntent, SellerId } from "@/shared/contracts/types";

const intent: ProductIntent = { productQuery: "Wireless noise-cancelling headphones", budgetCents: 35_000, currency: "EUR", priority: "best_value", preferences: [], language: "en" };
let n = 0;
function ev(type: EventType, payload: Record<string, unknown> = {}, sellerId: SellerId | null = null, phase: EventPhase = "negotiate", feedText = type as string): NegotiationEvent {
  n++;
  return { eventId: `x${n}`, sessionId: "s", sequence: n, atMs: n * 100, phase, type, sellerId, payload, feedText };
}

describe("deal intelligence (real V0 session)", () => {
  it("only reports arithmetic that the session's own numbers support", async () => {
    const s = (await prepareSession(intent, { caller: null })) as NegotiationSession;
    const w = s.offers.find((o) => o.offerId === s.recommendedOfferId)!;
    const d = dealIntel(s)!;
    expect(d.openingCents).toBe(w.initialPriceCents);
    expect(d.finalCents).toBe(w.finalPriceCents);
    expect(d.savedCents).toBe(w.initialPriceCents - w.finalPriceCents);
    expect(d.underBudgetCents).toBe(intent.budgetCents - w.finalPriceCents);
    expect(d.eligibleCount).toBe(s.offers.filter((o) => o.eligible).length);
    if (d.savedCents > 0) expect(d.savedPctTenths).toBe(Math.round((d.savedCents * 1000) / w.initialPriceCents));
    // The recommended store was asked exactly as many times as the events say.
    expect(d.asked).toBe(s.events.filter((e) => e.type === "BUYER_MESSAGE" && e.sellerId === w.sellerId).length);
    const lines = valueLines(d);
    expect(lines.join(" ")).not.toMatch(/market|retail price|average/i);
  });

  it("says nothing when there is no recommendation", () => {
    expect(dealIntel({ offers: [], events: [], intent, recommendedOfferId: "" })).toBeNull();
  });

  it("states the trade-off honestly when the winner is not the cheapest", () => {
    const base = { offerId: "a", sessionId: "s", productLabel: "p", initialPriceCents: 0, finalPriceCents: 0, minPriceCents: 0, discountCents: 0, deliveryDays: 1, warrantyMonths: 12, freeShipping: true, eligible: true, ineligibilityReasons: [], offerExpiresAt: "", policyVersion: "v" };
    const winner: Offer = { ...base, offerId: "w", sellerId: "orbit", finalPriceCents: 27_000, deliveryDays: 1, warrantyMonths: 36 };
    const rival: Offer = { ...base, offerId: "r", sellerId: "nova", finalPriceCents: 25_000, deliveryDays: 6, warrantyMonths: 12, freeShipping: false };
    const lines = tradeoffLines(winner, [winner, rival]);
    expect(lines[0]).toMatch(/Brisa Outlet is €20\.00 cheaper/);
    expect(lines.join(" ")).toMatch(/delivers sooner \(Next day vs 6 days\)/);
    expect(lines.join(" ")).toMatch(/longer warranty \(3 years vs 1 year\)/);
    expect(lines.join(" ")).toMatch(/ships free/);
    expect(tradeoffLines(winner, [winner])).toEqual([]);
  });
});

describe("observable reasoning", () => {
  it("quotes a model's words only when the event says a model wrote them", () => {
    const ai = reasoningForEvent(ev("BUYER_MESSAGE", { targetPriceCents: 25_000, message: "Can you beat €259.00?", source: "gemini" }, "nova"))!;
    expect(ai.origin).toBe("ai");
    expect(ai.detail).toBe("Can you beat €259.00?");
    expect(ai.evidence).toEqual(["Target for the item: €250.00"]);
    // The V0 template message is not presented as the agent's reasoning.
    const rules = reasoningForEvent(ev("BUYER_MESSAGE", { message: "Can you improve your price within my budget?" }, "nova"))!;
    expect(rules.detail).toBeNull();
    expect(rules.origin).toBe("server");
    expect(reasoningForEvent(ev("OFFER_RECEIVED", { initialPriceCents: 1, message: "hi", source: "rules_fallback" }, "nova", "offers"))!.origin).toBe("fallback");
  });

  it("takes the buyer's recorded rationale from the event, never from nowhere", () => {
    const r = reasoningForEvent(ev("BUYER_DECISION", { round: 1, source: "gemini" }, null, "negotiate", "Round 1: Asking every seller for a small discount."))!;
    expect(r.title).toBe("Agent D's plan for round 1");
    expect(r.detail).toBe("Asking every seller for a small discount.");
    expect(r.origin).toBe("ai");
    expect(reasoningForEvent(ev("BUYER_DECISION", { final: true, source: "rules_fallback" }, null, "complete"))!.origin).toBe("fallback");
    // Real Gemini runs record the buyer's final choice with source "llm".
    expect(reasoningForEvent(ev("BUYER_DECISION", { final: true, source: "llm" }, null, "complete"))!.origin).toBe("ai");
  });

  it("labels server facts and guardrails, and never as a store decision", () => {
    expect(reasoningForEvent(ev("SELLER_REJECTED", { reasonCode: "over_budget" }, "vertex", "evaluate"))!.evidence).toEqual(["Over your budget"]);
    expect(reasoningForEvent(ev("OFFER_EVALUATED", { score: 59 }, "prism", "evaluate"))!.evidence).toEqual(["59/100 for your priority"]);
    const g = reasoningForEvent(ev("OFFER_REJECTED_BY_SERVER", { reasons: ["price_below_floor"] }, "nova"))!;
    expect(g.evidence).toContain("Not a store decision");
    expect(reasoningForEvent(ev("SELLER_DISCOVERED", {}, "nova", "discover"))).toBeNull();
    expect(deriveReasoning([])).toEqual([]);
  });

  it("computes the price vs delivery trade-off from revealed offers only", async () => {
    const s = await prepareSession(intent, { caller: null });
    const none = deriveSellers(s, []);
    expect(tradeoffFacts(none)).toEqual([]);
    const all = deriveSellers(s, s.events);
    const facts = tradeoffFacts(all);
    expect(facts.length).toBeGreaterThan(0);
    expect(facts[0]).toMatch(/has the lowest price so far/);
  });
});

describe("verification trail", () => {
  const offer = { offerId: "o", finalPriceCents: 8_796 } as Offer;
  const base: TrailInput = { negotiationFinished: true, engine: "rules", approvedAt: "2026-11-12T10:39:00Z", offer, phase: "ready", payment: null };
  const states = (i: TrailInput) => buildTrail(i).map((s) => s.state);

  it("moves one confirmed step at a time", () => {
    expect(states({ ...base, approvedAt: null, offer: null, phase: null })).toEqual(["done", "current", "todo", "todo"]);
    expect(states(base)).toEqual(["done", "done", "current", "todo"]);
  });

  it("does not claim a capture until the server record says completed", () => {
    for (const phase of ["waiting", "confirming", "cancelled", "error"] as const) expect(buildTrail({ ...base, phase })[3].state).toBe("todo");
    const unconfirmed = buildTrail({ ...base, phase: "unconfirmed" });
    expect(unconfirmed[2].state).toBe("warn");
    expect(unconfirmed[3].state).toBe("current");
    // A "completed" phase with a record that is not completed is not a capture.
    expect(buildTrail({ ...base, phase: "completed", payment: { status: "unknown_pending_reconciliation", orderId: "O", captureId: null, amountCents: 8_796 } })[3].state).not.toBe("done");
  });

  it("confirms with evidence, and flags an amount that differs from the approved offer", () => {
    const ok = buildTrail({ ...base, phase: "completed", payment: { status: "completed", orderId: "ORD1", captureId: "CAP1", amountCents: 8_796 } });
    expect(ok.map((s) => s.state)).toEqual(["done", "done", "done", "done"]);
    expect(ok[3].evidence).toContainEqual({ label: "Matches approved offer", value: "Yes" });
    expect(ok[3].evidence).toContainEqual({ label: "Capture ID", value: "CAP1" });
    const bad = buildTrail({ ...base, phase: "completed", payment: { status: "completed", orderId: "ORD1", captureId: "CAP1", amountCents: 9_000 } });
    expect(bad[3].state).toBe("warn");
    expect(bad[3].evidence).toContainEqual({ label: "Matches approved offer", value: "No" });
  });
});
