import { describe, expect, it } from "vitest";
import { CATALOG, CATEGORY_IMAGE, SELLER_PROFILES, matchCategory } from "@/server/agents/catalog";
import { SELLER_POLICIES } from "@/server/negotiation/policies";
import { SELLER_BRANDS } from "@/shared/sellers";
import { matchProductCategory, CATEGORY_IMAGE as SHARED_IMAGE } from "@/shared/products";
import { parseRequest } from "@/lib/request-parse";
import { deriveSellers, activePulses } from "@/lib/negotiation-view";
import { bestFacets, diffPhrases, diffVs, offerImage } from "@/lib/offer-view";
import { buildScenario } from "@/server/negotiation/scenario";
import { composeEvents } from "@/server/negotiation/events";
import { rankOffers } from "@/server/negotiation/ranking";
import { SELLER_IDS, type NegotiationSession, type ProductIntent } from "@/shared/contracts/types";
import { formatEur } from "@/shared/format";

describe("client-safe seller identity stays in sync with the server catalog", () => {
  it.each(SELLER_IDS)("%s", (id) => {
    const shared = SELLER_BRANDS[id];
    const server = SELLER_PROFILES[id];
    expect(shared.brand).toBe(server.brand);
    expect(shared.brand).toBe(SELLER_POLICIES[id].displayName);
    expect(shared.tagline).toBe(server.tagline);
    expect(shared.monogram).toBe(server.monogram);
    expect(shared.strategy).toBe(server.strategy);
    expect(shared.deliveryDays).toBe(server.deliveryDays);
    expect(shared.warrantyMonths).toBe(server.warrantyMonths);
    expect(shared.returnDays).toBe(server.returnDays);
  });

  it("never exposes reserve prices or personas through the shared module", () => {
    const text = JSON.stringify(SELLER_BRANDS);
    expect(text).not.toContain("persona");
    expect(text).not.toContain("minPrice");
    // sanity: the server catalog does hold them
    expect(CATALOG.every((c) => c.minPriceCents > 0)).toBe(true);
  });

  it("product category matching and images agree with the server", () => {
    expect(SHARED_IMAGE).toEqual(CATEGORY_IMAGE);
    for (const q of ["wireless headphones", "gaming laptop", "a smartphone", "smart watch", "running shoes", "27 inch monitor", "toaster", "iPhone 15"]) {
      expect(matchProductCategory(q)).toBe(matchCategory(q));
    }
  });
});

describe("parseRequest", () => {
  it("extracts product and budget from natural language", () => {
    expect(parseRequest("Find me wireless headphones under €300")).toEqual({ query: "Wireless headphones", budgetCents: 30_000 });
    expect(parseRequest("a 27-inch monitor, max €250.")).toEqual({ query: "27-inch monitor", budgetCents: 25_000 });
    expect(parseRequest("laptop for work up to €1,200")).toEqual({ query: "Laptop for work", budgetCents: 120_000 });
    expect(parseRequest("running shoes below 99.50 euros")).toEqual({ query: "Running shoes", budgetCents: 9_950 });
  });
  it("leaves the budget empty when it is not sure", () => {
    expect(parseRequest("noise cancelling headphones").budgetCents).toBeNull();
    expect(parseRequest("a 14 inch laptop with 16 gb").budgetCents).toBeNull();
  });
  it("handles empty input", () => {
    expect(parseRequest("   ")).toEqual({ query: "", budgetCents: null });
  });
});

const intent: ProductIntent = {
  productQuery: "Wireless noise-cancelling headphones",
  budgetCents: 35_000,
  currency: "EUR",
  priority: "best_value",
  preferences: [],
  language: "en",
};

function session(): NegotiationSession {
  const offers = buildScenario("ses_t", intent, { seed: 42 });
  const ranked = rankOffers(offers, intent.priority);
  const evaluation = {
    evaluationId: "e",
    sessionId: "ses_t",
    rankedOfferIds: ranked.rankedOfferIds,
    recommendedOfferId: ranked.recommendedOfferId,
    scores: ranked.scores,
    aiSummary: "",
    aiReasons: [],
    tradeoffs: [],
    source: "rules_fallback" as const,
    modelName: null,
    validatedAt: "",
  };
  return {
    sessionId: "ses_t",
    createdAt: "",
    expiresAt: "",
    status: "completed",
    intent,
    offers,
    events: composeEvents("ses_t", intent, offers, evaluation),
    evaluation,
    recommendedOfferId: ranked.recommendedOfferId,
    approvedOfferId: null,
    approvedAt: null,
    aiStatus: "fallback",
    schemaVersion: "1.0",
    mode: "v0_rules",
  };
}

describe("negotiation view model", () => {
  it("reveals nothing before the matching events happen", () => {
    const s = session();
    const none = deriveSellers(s, []);
    expect(none.every((x) => x.status === "waiting" && x.priceCents === null && x.offer === null)).toBe(true);
  });

  it("follows the recorded events and never shows an offer early", () => {
    const s = session();
    const upToDiscovery = s.events.filter((e) => e.atMs < 10_500);
    const afterDiscovery = deriveSellers(s, upToDiscovery);
    expect(afterDiscovery.every((x) => x.status === "joined" && x.priceCents === null && x.offer === null)).toBe(true);

    const all = deriveSellers(s, s.events);
    expect(all.filter((x) => x.winner)).toHaveLength(1);
    const winner = all.find((x) => x.winner)!;
    expect(winner.offer?.offerId).toBe(s.recommendedOfferId);
    for (const x of all) {
      const offer = s.offers.find((o) => o.sellerId === x.id)!;
      if (offer.eligible) expect(x.priceCents).toBe(offer.discountCents > 0 ? offer.finalPriceCents : offer.initialPriceCents);
    }
  });

  it("never invents an 'awaiting reply' state in the rule-based simulation", () => {
    const s = session();
    const mid = s.events.filter((e) => e.atMs <= 21_000);
    expect(deriveSellers(s, mid).some((x) => x.awaitingReply)).toBe(false);
  });

  it("tracks awaiting reply for live runs only while negotiating", () => {
    const s = { ...session(), mode: "multi_agent" as const, status: "negotiating" as const };
    const firstAsk = s.events.find((e) => e.type === "BUYER_MESSAGE")!;
    const upToAsk = s.events.filter((e) => e.sequence <= firstAsk.sequence);
    const asked = deriveSellers(s, upToAsk).find((x) => x.id === firstAsk.sellerId)!;
    expect(asked.awaitingReply).toBe(true);
    expect(asked.status).toBe("asked");
  });

  it("only emits message pulses for recorded ask/offer events inside the window", () => {
    const s = session();
    const ask = s.events.find((e) => e.type === "BUYER_MESSAGE")!;
    expect(activePulses(s.events, ask.atMs - 1, 900)).toEqual([]);
    const p = activePulses(s.events, ask.atMs + 100, 900);
    expect(p).toEqual([{ key: ask.eventId, sellerId: ask.sellerId, direction: "out" }]);
    expect(activePulses(s.events, ask.atMs + 5_000, 900).some((x) => x.key === ask.eventId)).toBe(false);
    // discovery / evaluation events never produce a moving marker
    const disc = s.events.find((e) => e.type === "SELLER_DISCOVERED")!;
    expect(activePulses(s.events, disc.atMs + 50, 900)).toEqual([]);
  });
});

describe("offer view helpers", () => {
  it("shows a category illustration for simulated offers and none for unknown products", () => {
    const [o] = buildScenario("ses_x", intent, { seed: 7 });
    expect(offerImage(o)).toBe("/products/headphones.svg");
    expect(offerImage({ ...o, productLabel: "Garden gnome" })).toBeNull();
    expect(offerImage({ ...o, catalog: { sku: "x", productName: "n", imageUrl: "/products/laptop.svg", itemPriceCents: 1, shippingCents: 0, stock: 1, returnDays: 1 } })).toBe("/products/laptop.svg");
  });

  it("marks best facets only among eligible offers and never when everything ties", () => {
    const offers = buildScenario("ses_x", intent, { seed: 42 });
    const f = bestFacets(offers);
    const eligible = offers.filter((o) => o.eligible);
    const cheapest = Math.min(...eligible.map((o) => o.finalPriceCents));
    for (const id of f.price) expect(offers.find((o) => o.offerId === id)!.finalPriceCents).toBe(cheapest);
    expect(bestFacets(offers.map((o) => ({ ...o, eligible: true, deliveryDays: 3, warrantyMonths: 12, finalPriceCents: 100 }))).price.size).toBe(0);
  });

  it("describes differences neutrally", () => {
    const [a, b] = buildScenario("ses_x", intent, { seed: 42 });
    const phrases = diffPhrases(diffVs({ ...a, finalPriceCents: b.finalPriceCents + 1200, deliveryDays: b.deliveryDays - 5, warrantyMonths: b.warrantyMonths + 24 }, b), formatEur);
    expect(phrases).toEqual(["€12.00 more", "5 days faster", "24 months more warranty"]);
  });
});
