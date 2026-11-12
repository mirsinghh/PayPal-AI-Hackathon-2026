import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getSession, saveSession } from "@/server/db/store";
import { resetRunSlotsForTests } from "@/server/agents/config";
import { ModelHttpError, type ModelCaller, type ModelRequest } from "@/server/agents/model";
import { runMultiAgentNegotiation } from "@/server/agents/run";
import { rankOffers } from "@/server/negotiation/ranking";
import { prepareSession, startNegotiation } from "@/server/negotiation/service";
import { createPaymentOrder, type Gateway } from "@/server/paypal/payments";
import { POST as approve } from "@/app/api/negotiations/[id]/approve/route";
import { ProviderGate, resetGroqGatesForTests, type Clock } from "@/server/ai/groq";
import { rulesBuyerRound, rulesSellerReply, validateBuyerFinal, validateSellerReply } from "@/server/agents/validate";
import { SELLER_PROFILES, catalogItem } from "@/server/agents/catalog";
import { buildLab } from "@/lib/v4/lab";
import { analysisLabel } from "@/lib/v4/provider";
import { SELLER_BRANDS } from "@/shared/sellers";
import type { Offer, ProductIntent } from "@/shared/contracts/types";

const intent: ProductIntent = { productQuery: "Wireless noise-cancelling headphones", budgetCents: 35_000, currency: "EUR", priority: "best_value", preferences: ["warranty"], language: "en" };
const ENGINE = { provider: "groq", buyerModel: "openai/gpt-oss-120b", sellerModel: "openai/gpt-oss-20b", explanationModel: "openai/gpt-oss-120b" };

interface Row { store: string; offerId: string; itemPriceCents: number; itemPrice: string; total: string; withinBudget: boolean }
interface Prompt { turn?: string; yourListPriceCents?: number; yourCurrentItemPriceCents?: number; offers?: Row[]; serverRecommendedOfferId?: string; serverRanking?: { rank: number; offerId: string }[] }
const parse = (req: ModelRequest): Prompt | null => {
  try {
    return JSON.parse(req.user);
  } catch {
    const last = [...req.history].reverse().find((t) => t.role === "user");
    return last ? JSON.parse(last.text) : null;
  }
};

function groqFake(handle: (req: ModelRequest, n: number) => string | Error | null = () => null) {
  const seen: ModelRequest[] = [];
  const caller: ModelCaller = async (req) => {
    seen.push(req);
    const custom = handle(req, seen.length);
    if (custom instanceof Error) throw custom;
    const role = req.role ?? "seller";
    const u = parse(req);
    let text: string;
    if (custom) text = custom;
    else if (role === "seller") {
      text = JSON.stringify(u?.turn === "opening" ? { action: "quote", priceCents: u.yourListPriceCents, message: "Here is my price for this item." } : { action: "concede", priceCents: u!.yourCurrentItemPriceCents! - Math.max(1, Math.floor(u!.yourCurrentItemPriceCents! / 100)), message: "A little better, as requested." });
    } else if (String(u?.turn).startsWith("negotiation_round")) {
      text = JSON.stringify({ rationale: "Pressing each store with a concrete argument.", moves: u!.offers!.map((o) => ({ store: o.store, action: "counter", targetPriceCents: Math.floor(o.itemPriceCents * 0.97), message: `Your offer is competitive, but I need better than ${o.itemPrice}.` })) });
    } else {
      text = JSON.stringify({ chosenOfferId: u!.serverRecommendedOfferId, summary: "The server's top offer balances price, delivery and warranty.", reasons: ["A good balance of price and delivery."], tradeoffs: [] });
    }
    return { text, model: role === "seller" ? "openai/gpt-oss-20b" : "openai/gpt-oss-120b", provider: "groq", inputTokens: 100, outputTokens: 40, reasoningTokens: null };
  };
  return { caller, seen };
}

async function run(caller: ModelCaller) {
  vi.stubEnv("MULTI_AGENT_NEGOTIATION", "true");
  const { session } = await startNegotiation(intent, { caller });
  await saveSession(session);
  await runMultiAgentNegotiation(session.sessionId, intent, "headphones", caller, { engine: ENGINE });
  return (await getSession(session.sessionId))!;
}

beforeEach(() => {
  resetRunSlotsForTests();
  resetGroqGatesForTests();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** The final-decision stand-in that prefers the second-ranked offer: the disagreement seen in the first real run. */
const prefersRankTwo = (req: ModelRequest) => {
  const u = parse(req);
  if (req.role !== "buyer" || u?.turn !== "final_decision") return null;
  const second = u.serverRanking!.find((r) => r.rank === 2)!.offerId;
  return JSON.stringify({ chosenOfferId: second, summary: "I like the second offer better.", reasons: ["A good balance of price and delivery."], tradeoffs: [] });
};

describe("the server's ranking decides the recommendation", () => {
  it("keeps the ranking's top offer when Agent D insists on another, records the discrepancy, and explains it with rules", async () => {
    const { caller } = groqFake((req) => prefersRankTwo(req));
    const s = await run(caller);
    const top = rankOffers(s.offers, intent.priority).recommendedOfferId;
    expect(s.recommendedOfferId).toBe(top);
    expect(s.evaluation.recommendedOfferId).toBe(top);
    expect(s.evaluation.rankedOfferIds[0]).toBe(top);
    expect(s.evaluation.source).toBe("rules_fallback"); // Agent D's text explained a different offer: not usable
    expect(s.evaluation.provider ?? null).toBeNull();
    const finals = s.events.filter((e) => e.type === "BUYER_DECISION" && e.payload.final === true);
    expect(finals).toHaveLength(1);
    expect(finals[0].payload.discrepancy).toMatchObject({ serverTopOfferId: top });
    expect(finals[0].payload.offerId).toBe(top);
    expect(s.events.some((e) => e.type === "OFFER_REJECTED_BY_SERVER" && (e.payload.reasons as string[]).includes("not_server_top_ranked"))).toBe(true);
    expect(s.agentRun).toMatchObject({ buyerChoseTopRanked: false });
    expect(s.agentRun!.agentProposalOfferId).not.toBe(top);
    // The Decision Lab states the discrepancy, and still presents the server's pick.
    const lab = buildLab(s)!;
    expect(lab.winner.offer.offerId).toBe(top);
    expect(lab.choseOffTop).toBe(true);
    expect(lab.why.join(" ")).toMatch(/Agent D's own proposal was/);
  });

  it("recovers the AI explanation when Agent D agrees after one correction (no discrepancy left)", async () => {
    let first = true;
    const { caller } = groqFake((req) => {
      const bad = prefersRankTwo(req);
      if (bad && first) {
        first = false;
        return bad;
      }
      return null;
    });
    const s = await run(caller);
    expect(s.evaluation).toMatchObject({ source: "llm", provider: "groq", modelName: "openai/gpt-oss-120b" });
    expect(s.recommendedOfferId).toBe(rankOffers(s.offers, intent.priority).recommendedOfferId);
    expect(s.events.find((e) => e.type === "BUYER_DECISION" && e.payload.final === true)!.payload.discrepancy).toBeUndefined();
    expect(analysisLabel(s.evaluation)).toBe("AI analysis · Groq · GPT-OSS 120B");
  });

  it("only the server's recommendation can be approved, and PayPal is charged that offer's stored price", async () => {
    const { caller } = groqFake((req) => prefersRankTwo(req));
    const s = await run(caller);
    const other = s.offers.find((o) => o.eligible && o.offerId !== s.recommendedOfferId)!;
    const call = (offerId: string) => approve(new Request("http://x/api", { method: "POST", body: JSON.stringify({ offerId }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id: s.sessionId }) });
    const refused = await call(other.offerId);
    expect(refused.status).toBe(409);
    expect((await refused.json()).code).toBe("OFFER_MISMATCH");
    const ok = await call(s.recommendedOfferId);
    expect(ok.status).toBe(200);
    const winner = s.offers.find((o) => o.offerId === s.recommendedOfferId)!;
    expect((await ok.json()).amountCents).toBe(winner.finalPriceCents);

    const sent: number[] = [];
    const gw: Gateway = { create: async (a) => (sent.push(a.amountCents), { id: "ORDER-1", status: "CREATED" }), capture: async () => { throw new Error("unused"); }, get: async () => ({ id: "ORDER-1", status: "CREATED" }) };
    await expect(createPaymentOrder(s.sessionId, other.offerId, gw)).rejects.toMatchObject({ code: "OFFER_MISMATCH" });
    await createPaymentOrder(s.sessionId, undefined, gw);
    expect(sent).toEqual([winner.finalPriceCents]);
  });

  it("holds for rule-based and V0 sessions too: the recommendation is always the ranking's top", async () => {
    const v0 = await prepareSession(intent, { caller: null });
    expect(v0.recommendedOfferId).toBe(rankOffers(v0.offers, intent.priority).recommendedOfferId);
  });
});

describe("HTTP 400 and truncation at the orchestration level", () => {
  it("records a generation failure as provider_generation_failed with Groq's own message, and the server's rules cover the turn", async () => {
    const { caller } = groqFake((req) => (req.role === "buyer" && String(parse(req)?.turn).startsWith("negotiation_round") ? new ModelHttpError(400, null, "groq", "generation failed: Failed to generate JSON | failed_generation(18 chars): {\"moves\":[{\"store\"") : null));
    const s = await run(caller);
    const fb = s.events.filter((e) => e.type === "AGENT_FALLBACK" && e.payload.agent === "buyer");
    expect(fb.length).toBeGreaterThan(0);
    expect(fb.every((e) => e.payload.cause === "provider_generation_failed" && e.payload.source === "rules_fallback")).toBe(true);
    expect(s.agentRun!.fallbackCauses!.provider_generation_failed).toBeGreaterThan(0);
    // The 400 is not retried by the engine (not transient): one call per failed buyer round.
    expect(s.events.filter((e) => e.type === "OFFER_RECEIVED").every((e) => e.payload.source === "groq")).toBe(true);
    expect(s.evaluation.source).toBe("llm"); // the final decision still came from Groq
  });

  it("an invalid-request 400 is a configuration problem, reported as such", async () => {
    const { caller } = groqFake((req) => (req.role === "seller" && /Tough Negotiator/.test(req.system) ? new ModelHttpError(400, null, "groq", "invalid request: Unknown parameter: 'foo'") : null));
    const s = await run(caller);
    const fb = s.events.filter((e) => e.type === "AGENT_FALLBACK" && e.sellerId === "vertex");
    expect(fb.every((e) => e.payload.cause === "provider_rejected_request")).toBe(true);
  });
});

describe("explanation claims", () => {
  const mk = (id: string, sellerId: string, finalPriceCents: number, deliveryDays: number, warrantyMonths: number, discountCents = 0, eligible = true) =>
    ({ offerId: id, sellerId, finalPriceCents, initialPriceCents: finalPriceCents + discountCents, discountCents, deliveryDays, warrantyMonths, eligible, catalog: { itemPriceCents: finalPriceCents, shippingCents: 0 } }) as unknown as Offer;
  const offers = [mk("a", "nova", 25_490, 6, 12, 1_000), mk("b", "orbit", 29_900, 1, 12, 2_000), mk("c", "prism", 33_200, 4, 36), mk("d", "vertex", 36_390, 3, 24, 0, false)];
  const scores = { a: 45, b: 52, c: 53, d: 30 };
  const fin = (summary: string, reasons = ["Good balance."], tradeoffs: string[] = [], chosenOfferId = "b") => ({ chosenOfferId, summary, reasons, tradeoffs });
  const v = (f: ReturnType<typeof fin>) => validateBuyerFinal(f, offers, 35_000, { scores });

  it("verifies best-score, savings, eligibility and which store is recommended against the stored data", () => {
    expect(v(fin("It has the highest score of all offers."))).toBe("unsupported_claim:best_score");
    expect(v(fin("Top-ranked for your priority.", [], [], "c"))).toBeNull();
    expect(v(fin("You save €15.00 compared with the opening price."))).toBe("ungrounded_amount"); // an amount the server never recorded
    expect(v(fin("You save €10.00 compared with the opening price."))).toBe("unsupported_claim:savings"); // a recorded amount, but another offer's saving
    expect(v(fin("Brisa lowered it, so you save €20.00 versus the opening price."))).toBeNull(); // 2 000 cents is the recorded discount
    expect(v(fin("Within budget.", ["It is over your budget."]))).toBe("unsupported_claim:eligibility");
    expect(v(fin("Our recommended offer is Atelier Norden."))).toBe("unsupported_claim:recommended_offer");
    expect(v(fin("A balanced choice, ahead of Atelier Norden on delivery."))).toBeNull(); // naming a rival is fine; calling it the recommendation is not
  });

  it("compares only against eligible offers, consistently (a set-aside cheaper offer never counts)", () => {
    const withIneligibleCheaper = [mk("z", "vertex", 20_000, 1, 48, 0, false), ...offers.slice(0, 3)];
    expect(validateBuyerFinal(fin("The cheapest option you can buy.", ["Fastest delivery among eligible offers."], [], "a"), withIneligibleCheaper, 35_000, { scores })).toBe("unsupported_claim:fastest_delivery");
    expect(validateBuyerFinal(fin("The cheapest option you can buy.", ["Good value."], [], "a"), withIneligibleCheaper, 35_000, { scores })).toBeNull();
  });

  it("a false claim is rejected, the reason recorded, and the explanation falls back to the server's data (never credited to Groq)", async () => {
    const { caller } = groqFake((req) => {
      const u = parse(req);
      if (req.role === "buyer" && u?.turn === "final_decision") return JSON.stringify({ chosenOfferId: u.serverRecommendedOfferId, summary: "This offer has the cheapest price of all stores.", reasons: ["Cheapest total price among offers."], tradeoffs: [] });
      return null;
    });
    const s = await run(caller);
    const top = s.offers.find((o) => o.offerId === s.recommendedOfferId)!;
    const cheapest = Math.min(...s.offers.filter((o) => o.eligible).map((o) => o.finalPriceCents));
    if (top.finalPriceCents > cheapest) {
      expect(s.events.some((e) => e.type === "OFFER_REJECTED_BY_SERVER" && (e.payload.reasons as string[]).some((r) => r.startsWith("unsupported_claim")))).toBe(true);
      expect(s.evaluation.source).toBe("rules_fallback");
      expect(s.evaluation.provider ?? null).toBeNull();
      expect(analysisLabel(s.evaluation)).toBe("Rules-based analysis");
      expect(s.agentRun!.fallbackCauses).toMatchObject({ policy_rejected: expect.any(Number) });
    }
  });
});

describe("rate limiter with a simulated clock", () => {
  const virtual = (): Clock & { t: number } => {
    const c = { t: 1_000_000, now: () => c.t, sleep: async (ms: number) => void (c.t += ms) };
    return c;
  };
  const headers = (remainingTokens: number, resetTokensMs = 60_000, limitTokens = 8000) => ({ retryAfterMs: null, remainingRequests: null, remainingTokens, resetRequestsMs: null, resetTokensMs, limitRequests: null, limitTokens });
  const gate = (c: Clock) => new ProviderGate({ maxConcurrent: 8, rpm: null, tpm: null }, c);

  it("small request: no wait when the bucket holds enough", async () => {
    const c = virtual();
    const g = gate(c);
    g.observe(headers(6000));
    const t0 = c.t;
    (await g.acquire(600, t0 + 60_000))!();
    expect(c.t - t0).toBe(0);
    expect(g.waits).toBe(0);
  });

  it("large request: waits only for the missing tokens at the refill rate (8000/min), not for a full bucket", async () => {
    const c = virtual();
    const g = gate(c);
    g.observe(headers(1000, 52_000));
    const t0 = c.t;
    (await g.acquire(3000, t0 + 60_000))!(); // needs 2000 more: 2000 / (8000/60000 per ms) = 15 000 ms
    expect(c.t - t0).toBeGreaterThanOrEqual(15_000);
    expect(c.t - t0).toBeLessThan(15_500);
  });

  it("a request larger than the whole bucket is clamped to the bucket and still gets served", async () => {
    const c = virtual();
    const g = gate(c);
    g.observe(headers(8000));
    (await g.acquire(20_000, c.t + 60_000))!();
    expect(g.waits).toBe(0);
    g.observe(headers(500, 56_000));
    const t0 = c.t;
    expect(await g.acquire(20_000, t0 + 120_000)).not.toBeNull();
    expect(c.t - t0).toBeLessThanOrEqual(56_100); // never longer than the provider's own reset
  });

  it("several concurrent requests share the budget: each reserves its estimate before the next is admitted", async () => {
    const c = virtual();
    const g = gate(c);
    g.observe(headers(3000));
    const t0 = c.t;
    const rel = await Promise.all([g.acquire(1500, t0 + 120_000), g.acquire(1500, t0 + 120_000), g.acquire(1500, t0 + 120_000)]);
    expect(rel.every((r) => r !== null)).toBe(true);
    expect(c.t - t0).toBeGreaterThanOrEqual(11_250); // only the third had to wait for 1500 tokens of refill
    expect(g.waits).toBe(1);
    rel.forEach((r) => r!());
  });

  it("partial refill while idle: time that passed since the last headers counts", async () => {
    const c = virtual();
    const g = gate(c);
    g.observe(headers(1000, 52_000));
    c.t += 3000; // 3 s idle refills 400 tokens
    const t0 = c.t;
    (await g.acquire(1400, t0 + 60_000))!();
    expect(c.t - t0).toBe(0);
  });

  it("exhausted limit: waits for the refill; and a fresh header reading corrects the optimistic accounting", async () => {
    const c = virtual();
    const g = gate(c);
    g.observe(headers(0, 60_000));
    const t0 = c.t;
    (await g.acquire(800, t0 + 60_000))!();
    expect(c.t - t0).toBeGreaterThanOrEqual(6_000);
    g.observe(headers(7000));
    const t1 = c.t;
    (await g.acquire(800, t1 + 60_000))!();
    expect(c.t - t1).toBe(0);
  });

  it("gives up without sleeping when the wait would pass the deadline", async () => {
    const c = virtual();
    const g = gate(c);
    g.observe(headers(0, 60_000));
    const t0 = c.t;
    expect(await g.acquire(4000, t0 + 5_000)).toBeNull(); // needs ~30 s
    expect(c.t).toBe(t0);
    expect(g.waits).toBe(0);
  });

  it("after a 429 nothing is admitted before the provider's retry-after, and the deadline is still respected", async () => {
    const c = virtual();
    const g = gate(c);
    g.penalize(7000);
    const t0 = c.t;
    (await g.acquire(100, t0 + 60_000))!();
    expect(c.t - t0).toBeGreaterThanOrEqual(7000);
    g.penalize(30_000);
    expect(await g.acquire(100, c.t + 5_000)).toBeNull();
  });

  it("never admits more than the configured concurrency, and released slots wake waiters in order", async () => {
    const g = new ProviderGate({ maxConcurrent: 2, rpm: null, tpm: null });
    const order: number[] = [];
    let active = 0;
    let peak = 0;
    await Promise.all(
      [1, 2, 3, 4, 5].map(async (n) => {
        const r = (await g.acquire(10, Date.now() + 5000))!;
        order.push(n);
        active++;
        peak = Math.max(peak, active);
        await new Promise((x) => setTimeout(x, 5));
        active--;
        r();
      }),
    );
    expect(peak).toBe(2);
    expect(order).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("findings of the second real Groq run", () => {
  it("a seller message may not allude to its private reserve (price rules still come first)", () => {
    const item = catalogItem("orbit", "headphones");
    const ctx = { item, profile: SELLER_PROFILES.orbit, previousItemCents: null, targetItemCents: null, budgetCents: 40_000 };
    const quote = (message: string, priceCents = 31_000) => ({ action: "quote" as const, priceCents, message });
    expect(validateSellerReply(quote("I can offer next-day delivery, staying above my reserve."), ctx)).toBe("mentions_reserve");
    expect(validateSellerReply(quote("That is my floor price, take it."), ctx)).toBe("mentions_reserve");
    expect(validateSellerReply(quote("Next-day delivery and free shipping."), ctx)).toBeNull();
    expect(validateSellerReply(quote("Staying above my reserve.", item.minPriceCents - 1), ctx)).toBe("price_below_floor");
  });

  it("the last round no longer says roundsLeft 0 (both real runs failed exactly there)", async () => {
    const { caller, seen } = groqFake();
    await run(caller);
    const rounds = seen.filter((r) => r.role === "buyer" && String(parse(r)?.turn).startsWith("negotiation_round")).map((r) => parse(r) as unknown as { turn: string; round: number; totalRounds: number; finalRound?: boolean; respondWith: string; roundsLeft?: number });
    expect(rounds.map((r) => [r.round, r.totalRounds])).toEqual([[1, 2], [2, 2]]);
    expect(rounds.every((r) => /rationale and moves/.test(r.respondWith) && /not the final decision/.test(r.respondWith) && r.finalRound === undefined)).toBe(true); // the last round was answered with the final-decision JSON in the second real run
    expect(rounds.every((r) => r.roundsLeft === undefined)).toBe(true);
    const finals = seen.filter((r) => r.role === "buyer" && parse(r)?.turn === "final_decision");
    expect(finals.length).toBeGreaterThan(0);
    expect(finals.every((r) => /chosenOfferId, summary, reasons and tradeoffs/.test((parse(r) as unknown as { respondWith: string }).respondWith))).toBe(true);
    expect(finals[0].system).toContain("Only when the turn is \"final_decision\"");
  });

  it("does not ask again after a structural failure that survived the provider's own escalated retry, and keeps a sample of the output", async () => {
    let calls = 0;
    const caller: ModelCaller = async () => {
      calls++;
      return { text: '{"unexpected":true}', model: "openai/gpt-oss-120b", provider: "groq", inputTokens: 1, outputTokens: 1, note: "recovered after one escalated retry" };
    };
    const { Agent, RunBudget, ask } = await import("@/server/agents/model");
    const { buyerRoundByStoreSchema } = await import("@/server/agents/schemas");
    const r = await ask(new Agent("buyer", "sys", "buyer"), caller, new RunBudget(Date.now(), Date.now, 24, 60_000), "{}", buyerRoundByStoreSchema, () => null);
    expect(calls).toBe(1);
    expect(r.ok).toBe(false);
    expect(r.details[0]).toContain('| output: {"unexpected":true}');
    expect(r.details[0]).toContain("[recovered after one escalated retry]");
  });
});

describe("fallback wording and attribution", () => {
  it("fallback lines are natural, per seller, use only the seller's real terms, and are never model messages", () => {
    const item = catalogItem("prism", "headphones");
    const opening = rulesSellerReply({ item, profile: SELLER_PROFILES.prism, previousItemCents: null, targetItemCents: null, budgetCents: 40_000 });
    expect(opening.message).toBe("Our price, backed by a 36-month warranty.");
    const lines = new Set(["nova", "orbit", "prism", "vertex"].map((id) => rulesSellerReply({ item: catalogItem(id as "nova", "headphones"), profile: SELLER_PROFILES[id as "nova"], previousItemCents: null, targetItemCents: null, budgetCents: 40_000 }).message));
    expect(lines.size).toBe(4);
    const hold = rulesSellerReply({ item: catalogItem("vertex", "headphones"), profile: SELLER_PROFILES.vertex, previousItemCents: catalogItem("vertex", "headphones").minPriceCents, targetItemCents: 1, budgetCents: 40_000 });
    expect(hold).toMatchObject({ action: "hold", message: "No room on the price." });
    const round = rulesBuyerRound((["nova", "orbit", "prism", "vertex"] as const).map((sellerId) => ({ sellerId, offerId: sellerId, itemPriceCents: 30_000, shippingCents: 0, eligible: true })));
    expect(new Set(round.moves.map((m) => m.message)).size).toBe(4);
    expect(round.moves.every((m) => !/nova|orbit|prism|vertex/i.test(m.message))).toBe(true);
    expect(Object.values(SELLER_BRANDS).length).toBe(4);
  });

  it("a rules fallback session is persisted as such and the UI never labels it as Groq", async () => {
    const { caller } = groqFake((req) => (req.role === "seller" && /Premium Advisor/.test(req.system) ? new Error("groq_timeout") : null));
    const s = await run(caller);
    const fallbackMsgs = s.events.filter((e) => e.payload.source === "rules_fallback" && ["OFFER_RECEIVED", "COUNTEROFFER_RECEIVED"].includes(e.type));
    expect(fallbackMsgs.length).toBeGreaterThan(0);
    expect(fallbackMsgs.every((e) => e.payload.provider == null && e.payload.model == null)).toBe(true);
    expect(fallbackMsgs.some((e) => /warranty/.test(String(e.payload.message)))).toBe(true);
  });
});
