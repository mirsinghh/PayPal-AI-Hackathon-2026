import { describe, expect, it } from "vitest";
import { SAMPLE_NEGOTIATION } from "@/shared/sample-negotiation";
import { prepareSession } from "@/server/negotiation/service";
import { deriveDraft, deriveSellers } from "@/lib/negotiation-view";

describe("frozen sample negotiation", () => {
  it("is exactly what the real rule engine produces today for the same request and seed", async () => {
    const fresh = await prepareSession(SAMPLE_NEGOTIATION.intent, { caller: null, seed: 42, now: new Date(SAMPLE_NEGOTIATION.createdAt) });
    expect(fresh.offers.map((o) => [o.sellerId, o.initialPriceCents, o.finalPriceCents, o.eligible])).toEqual(
      SAMPLE_NEGOTIATION.offers.map((o) => [o.sellerId, o.initialPriceCents, o.finalPriceCents, o.eligible]),
    );
    expect(fresh.events.map((e) => [e.atMs, e.type, e.sellerId])).toEqual(SAMPLE_NEGOTIATION.events.map((e) => [e.atMs, e.type, e.sellerId]));
    expect(fresh.offers.find((o) => o.offerId === fresh.recommendedOfferId)?.sellerId).toBe(
      SAMPLE_NEGOTIATION.offers.find((o) => o.offerId === SAMPLE_NEGOTIATION.recommendedOfferId)?.sellerId,
    );
  });

  it("is always labelled as the rule-based engine, never as live agents", () => {
    expect(SAMPLE_NEGOTIATION.mode).toBe("v0_rules");
    expect(SAMPLE_NEGOTIATION.events.every((e) => e.feedText.length > 0)).toBe(true);
  });
});

describe("draft slip", () => {
  const s = SAMPLE_NEGOTIATION;
  const draftAt = (ms: number) => deriveDraft(deriveSellers(s, s.events.filter((e) => e.atMs <= ms)), s.intent.budgetCents);

  it("starts empty and fills only as the producing events happen", () => {
    expect(draftAt(0)).toMatchObject({ joined: 0, offers: 0, lowest: null, recommended: null });
    const discovered = draftAt(s.events.filter((e) => e.type === "SELLER_DISCOVERED").at(-1)!.atMs);
    expect(discovered).toMatchObject({ joined: 4, offers: 0, lowest: null });
    const opened = draftAt(s.events.filter((e) => e.type === "OFFER_RECEIVED").at(-1)!.atMs);
    expect(opened.offers).toBe(4);
    expect(opened.lowest).not.toBeNull();
    expect(opened.recommended).toBeNull();
  });

  it("only names a recommended store once the server's winner event is visible", () => {
    const before = draftAt(s.events.find((e) => e.type === "WINNER_SELECTED")!.atMs - 1);
    expect(before.recommended).toBeNull();
    const after = draftAt(s.events.at(-1)!.atMs);
    const winnerSeller = s.offers.find((o) => o.offerId === s.recommendedOfferId)!.sellerId;
    expect(after.recommended?.id).toBe(winnerSeller);
  });

  it("'lowest so far' is the cheapest visible price, not necessarily the recommendation", () => {
    const end = draftAt(s.events.at(-1)!.atMs);
    const prices = deriveSellers(s, s.events).filter((x) => x.priceCents !== null && x.status !== "set_aside").map((x) => x.priceCents as number);
    expect(end.lowest?.cents).toBe(Math.min(...prices));
  });
});
