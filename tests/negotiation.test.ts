import { describe, expect, it } from "vitest";
import { buildScenario } from "@/server/negotiation/scenario";
import { rankOffers } from "@/server/negotiation/ranking";
import { composeEvents } from "@/server/negotiation/events";
import { eurosToCents, formatEur, parseIntent } from "@/server/negotiation/intent";
import { policyViolations } from "@/server/negotiation/validator";
import { SELLER_POLICIES } from "@/server/negotiation/policies";
import type { ProductIntent, Priority } from "@/shared/contracts/types";

const intent = (over: Partial<ProductIntent> = {}): ProductIntent => ({
  productQuery: "Wireless noise-cancelling headphones",
  budgetCents: 35_000,
  currency: "EUR",
  priority: "best_value",
  preferences: ["warranty"],
  language: "en",
  ...over,
});

describe("intent validation", () => {
  it("accepts a valid intent", () => {
    expect(parseIntent(intent()).ok).toBe(true);
  });
  it.each([4_999, 1_000_001, -1, 100.5])("rejects budget %s", (b) => {
    const r = parseIntent(intent({ budgetCents: b }));
    expect(r.ok).toBe(false);
  });
  it("rejects short or html queries", () => {
    expect(parseIntent(intent({ productQuery: "ab" })).ok).toBe(false);
    expect(parseIntent(intent({ productQuery: "<script>x</script>" })).ok).toBe(false);
  });
  it("parses euros to cents with no float drift", () => {
    expect(eurosToCents("350")).toBe(35_000);
    expect(eurosToCents("349.99")).toBe(34_999);
    expect(eurosToCents("1,200.5")).toBe(120_050);
    expect(eurosToCents("abc")).toBeNull();
    expect(formatEur(29_900)).toBe("€299.00");
    expect(formatEur(120_050)).toBe("€1,200.50");
  });
});

describe("scenario builder", () => {
  const cases: [string, number][] = [
    ["Wireless noise-cancelling headphones", 35_000],
    ["Laptop for work", 120_000],
    ["Running shoes", 18_000],
    ["Cheap thing", 5_000],
    ["Luxury watch", 1_000_000],
  ];
  it.each(cases)("builds 4 valid offers with an eligible one for %s", (q, budget) => {
    const offers = buildScenario("ses_1", intent({ productQuery: q, budgetCents: budget }));
    expect(offers).toHaveLength(4);
    expect(new Set(offers.map((o) => o.sellerId)).size).toBe(4);
    for (const o of offers) {
      expect(policyViolations(o, SELLER_POLICIES[o.sellerId])).toEqual([]);
      expect(o.discountCents).toBe(o.initialPriceCents - o.finalPriceCents);
      expect(o.eligible).toBe(o.finalPriceCents <= budget);
    }
    expect(offers.some((o) => o.eligible)).toBe(true);
  });
  it("is reproducible for the same seed", () => {
    const a = buildScenario("s", intent(), { seed: 42 });
    const b = buildScenario("s", intent(), { seed: 42 });
    expect(a.map((o) => o.finalPriceCents)).toEqual(b.map((o) => o.finalPriceCents));
  });
});

describe("ranking", () => {
  it("never recommends an ineligible offer and is deterministic", () => {
    for (const priority of ["lowest_price", "fast_delivery", "best_value"] as Priority[]) {
      for (let seed = 1; seed <= 50; seed++) {
        const offers = buildScenario("s", intent({ priority }), { seed });
        const r1 = rankOffers(offers, priority);
        const r2 = rankOffers(offers, priority);
        expect(r1).toEqual(r2);
        const winner = offers.find((o) => o.offerId === r1.recommendedOfferId)!;
        expect(winner.eligible).toBe(true);
      }
    }
  });
  it("does not always pick the same seller across priorities", () => {
    const winners = new Set<string>();
    for (const priority of ["lowest_price", "fast_delivery", "best_value"] as Priority[]) {
      for (let seed = 1; seed <= 30; seed++) {
        const offers = buildScenario("s", intent({ priority }), { seed });
        const r = rankOffers(offers, priority);
        winners.add(offers.find((o) => o.offerId === r.recommendedOfferId)!.sellerId);
      }
    }
    expect(winners.size).toBeGreaterThan(1);
  });
});

describe("event composer", () => {
  it("produces an ordered, consistent timeline ending with one completion", () => {
    const offers = buildScenario("ses", intent(), { seed: 7 });
    const ranking = rankOffers(offers, "best_value");
    const events = composeEvents("ses", intent(), offers, ranking);
    events.forEach((e, i) => {
      expect(e.sequence).toBe(i);
      if (i > 0) expect(e.atMs).toBeGreaterThanOrEqual(events[i - 1].atMs);
      expect(e.atMs).toBeLessThanOrEqual(52_000);
    });
    expect(events.filter((e) => e.type === "NEGOTIATION_COMPLETE")).toHaveLength(1);
    expect(events.at(-1)!.type).toBe("NEGOTIATION_COMPLETE");
    expect(events.filter((e) => e.type === "WINNER_SELECTED")).toHaveLength(1);
    // counteroffer only after the offer for the same seller
    for (const c of events.filter((e) => e.type === "COUNTEROFFER_RECEIVED")) {
      const offer = events.find((e) => e.type === "OFFER_RECEIVED" && e.sellerId === c.sellerId)!;
      expect(offer.sequence).toBeLessThan(c.sequence);
    }
  });
});
