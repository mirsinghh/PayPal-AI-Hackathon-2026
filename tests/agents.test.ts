import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Isolated store per test run; must be set before importing the store.
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "agentdeal-agents-"));

import { getSession, saveSession } from "@/server/db/store";
import { catalogItem, matchCategory, SELLER_PROFILES } from "@/server/agents/catalog";
import { resetRunSlotsForTests } from "@/server/agents/config";
import { ModelHttpError, RateLimiter, type ModelCaller, type ModelRequest } from "@/server/agents/model";
import { EventRecorder } from "@/server/agents/recorder";
import { runMultiAgentNegotiation } from "@/server/agents/run";
import { runSingleCallNegotiation } from "@/server/agents/single";
import type { SellerReply } from "@/server/agents/schemas";
import { amountsInText, ungroundedAmount, validateSellerReply, type SellerContext } from "@/server/agents/validate";
import { isNegotiationStale, startNegotiation } from "@/server/negotiation/service";
import { PaymentError, createPaymentOrder, type Gateway } from "@/server/paypal/payments";
import { POST as approve } from "@/app/api/negotiations/[id]/approve/route";
import { formatEur } from "@/shared/format";
import type { NegotiationSession, ProductIntent } from "@/shared/contracts/types";

const intent: ProductIntent = {
  productQuery: "Wireless noise-cancelling headphones",
  budgetCents: 35_000,
  currency: "EUR",
  priority: "best_value",
  preferences: [],
  language: "en",
};

/* ---------- scripted model ---------- */

interface BookRow {
  store: string;
  sellerId?: string;
  offerId: string;
  itemPriceCents: number;
  itemPrice: string;
  total: string;
  withinBudget: boolean;
}
/** What the server sends to the agents (see run.ts prompts). */
interface Prompt {
  turn?: string;
  yourListPriceCents?: number;
  yourCurrentItemPriceCents?: number;
  offers?: BookRow[];
}
interface Ctx {
  agent: string; // "buyer" or the seller brand
  user: Prompt | null;
  req: ModelRequest;
  nth: number; // how many calls this agent made before this one
}
type Handler = (c: Ctx) => unknown;
interface Call {
  agent: string;
  req: ModelRequest;
}

function fakeModel(handler: Handler = good) {
  const calls: Call[] = [];
  const caller: ModelCaller = async (req) => {
    const agent = req.system.includes("Buyer Agent of a shopper")
      ? "buyer"
      : /sales agent of "([^"]+)"/.exec(req.system)![1];
    let user: Prompt | null = null;
    try {
      user = JSON.parse(req.user);
    } catch {
      // Corrective message after a server rejection: the original request is the last user turn in memory.
      const lastUser = [...req.history].reverse().find((t) => t.role === "user");
      user = lastUser ? JSON.parse(lastUser.text) : null;
    }
    const nth = calls.filter((c) => c.agent === agent).length;
    calls.push({ agent, req });
    const out = handler({ agent, user, req, nth });
    if (out instanceof Error) throw out;
    return { text: typeof out === "string" ? out : JSON.stringify(out), model: "fake-model", inputTokens: 10, outputTokens: 5 };
  };
  return { caller, calls };
}

/** A well-behaved market: sellers open at list and concede 1%; the buyer counters 3% below and picks the cheapest. */
function good(c: Ctx): unknown {
  const u = c.user;
  if (c.agent !== "buyer") {
    if (u?.turn === "opening") return { action: "quote", priceCents: u.yourListPriceCents!, message: "Our price for this item." };
    const cur = u!.yourCurrentItemPriceCents!;
    return { action: "concede", priceCents: cur - Math.max(1, Math.floor(cur / 100)), message: "We can do a little better." };
  }
  if (String(u?.turn).startsWith("negotiation_round")) {
    return {
      rationale: "Asking every seller for a small discount.",
      moves: u!.offers!.map((o) => ({
        store: o.store,
        action: "counter",
        targetPriceCents: Math.floor(o.itemPriceCents * 0.97),
        message: `Can you beat ${o.itemPrice}?`,
      })),
    };
  }
  const best = u!.offers!.filter((o) => o.withinBudget).sort((a, b) => a.total.localeCompare(b.total, "en", { numeric: true }))[0];
  return { chosenOfferId: (u as unknown as { serverRecommendedOfferId?: string }).serverRecommendedOfferId ?? best.offerId, summary: `Best value for you at ${best.total} all-in.`, reasons: ["A good balance of price and delivery."], tradeoffs: [] };
}

async function newSession(caller: ModelCaller | null = fakeModel().caller): Promise<{ s: NegotiationSession; run: (() => Promise<void>) | null }> {
  vi.stubEnv("MULTI_AGENT_NEGOTIATION", "true");
  const { session, run } = await startNegotiation(intent, { caller });
  await saveSession(session);
  return { s: session, run };
}

async function runWith(handler: Handler, opts: Parameters<typeof runMultiAgentNegotiation>[4] = {}) {
  const m = fakeModel(handler);
  const { s } = await newSession(m.caller);
  await runMultiAgentNegotiation(s.sessionId, intent, "headphones", m.caller, opts);
  return { session: (await getSession(s.sessionId))!, calls: m.calls };
}

function assertMoneyInvariants(s: NegotiationSession) {
  for (const o of s.offers) {
    const cat = o.catalog!;
    const item = catalogItem(o.sellerId, "headphones");
    expect([o.initialPriceCents, o.finalPriceCents, o.minPriceCents, o.discountCents].every(Number.isSafeInteger)).toBe(true);
    expect(o.finalPriceCents).toBe(cat.itemPriceCents + cat.shippingCents);
    expect(cat.itemPriceCents).toBeGreaterThanOrEqual(item.minPriceCents);
    expect(cat.itemPriceCents).toBeLessThanOrEqual(item.listPriceCents);
    expect(o.finalPriceCents).toBeGreaterThanOrEqual(o.minPriceCents);
    expect(o.discountCents).toBe(o.initialPriceCents - o.finalPriceCents);
    expect(o.eligible).toBe(o.finalPriceCents <= intent.budgetCents && o.ineligibilityReasons.length === 0);
  }
}

beforeEach(() => {
  resetRunSlotsForTests();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/* ---------- the real multi-agent flow ---------- */

describe("multi-agent negotiation (fake model, real orchestration)", () => {
  it("runs one buyer and four independent seller contexts and persists every event", async () => {
    const { session, calls } = await runWith(good);

    expect(session.status).toBe("ready");
    expect(session.mode).toBe("multi_agent");
    assertMoneyInvariants(session);

    // Separate agents with separate contexts: each seller prompt only knows its own persona and floor.
    const sellerSystems = new Set(calls.filter((c) => c.agent !== "buyer").map((c) => c.req.system));
    expect(sellerSystems.size).toBe(4);
    for (const brand of Object.values(SELLER_PROFILES).map((p) => p.brand)) {
      const mine = calls.filter((c) => c.agent === brand);
      expect(mine.length).toBeGreaterThanOrEqual(3); // opening + two rounds
      // Memory: each later turn carries that agent's own previous exchanges, and nobody else's.
      expect(mine.at(-1)!.req.history.length).toBeGreaterThanOrEqual(4);
      for (const other of Object.values(SELLER_PROFILES).filter((p) => p.brand !== brand)) {
        expect(JSON.stringify(mine.at(-1)!.req.history)).not.toContain(other.brand);
      }
    }
    // Never one big call pretending to be many agents; hard caps respected.
    expect(calls.length).toBeLessThanOrEqual(16);
    expect(session.agentRun!.llmCallsAttempted).toBe(calls.length);

    // Events: ordered, unique, one completion, real model attribution.
    session.events.forEach((e, i) => expect(e.sequence).toBe(i));
    expect(new Set(session.events.map((e) => e.eventId)).size).toBe(session.events.length);
    expect(session.events.filter((e) => e.type === "NEGOTIATION_COMPLETE")).toHaveLength(1);
    expect(session.events.filter((e) => e.type === "OFFER_RECEIVED")).toHaveLength(4);
    const rounds = new Set(session.events.filter((e) => e.type === "COUNTEROFFER_RECEIVED").map((e) => e.payload.round));
    expect([...rounds].sort()).toEqual([1, 2]);
    expect(session.events.filter((e) => e.type === "OFFER_RECEIVED").every((e) => e.payload.source === "gemini")).toBe(true);

    // Validated, eligible recommendation chosen by the buyer agent.
    const winner = session.offers.find((o) => o.offerId === session.recommendedOfferId)!;
    expect(winner.eligible).toBe(true);
    expect(session.evaluation.source).toBe("llm");
    expect(session.aiStatus).toBe("succeeded");
    // Premium-priced seller that cannot reach the budget is set aside by the server, not by the model.
    const korvan = session.offers.find((o) => o.sellerId === "vertex")!;
    expect(korvan.eligible).toBe(false);
    expect(korvan.ineligibilityReasons).toContain("over_budget");
  });

  it("rejects out-of-limit prices, tells the agent why, and accepts the corrected reply", async () => {
    const { session, calls } = await runWith((c) => {
      if (c.agent === "Brisa Outlet" && c.user?.turn === "opening" && c.nth === 0) {
        return { action: "quote", priceCents: 1_000, message: "Insane clearance price." }; // below the reserve
      }
      return good(c);
    });
    const brisa = calls.filter((c) => c.agent === "Brisa Outlet");
    expect(brisa[1].req.user).toContain("rejected by the server");
    expect(brisa[1].req.user).toContain("price_below_floor");
    const rej = session.events.find((e) => e.type === "OFFER_REJECTED_BY_SERVER" && e.sellerId === "nova");
    expect(rej?.payload.reasons).toEqual(["price_below_floor"]);
    const open = session.events.find((e) => e.type === "OFFER_RECEIVED" && e.sellerId === "nova")!;
    expect(open.payload.source).toBe("gemini");
    expect(open.payload.itemPriceCents).toBeGreaterThanOrEqual(catalogItem("nova", "headphones").minPriceCents);
    assertMoneyInvariants(session);
  });

  it("falls back to a labelled rule-based move when the agent keeps violating policy", async () => {
    const { session } = await runWith((c) => {
      if (c.agent === "Zefiro Express") {
        return c.user?.turn === "opening"
          ? { action: "quote", priceCents: 999_999, message: "Premium price." } // above list
          : { action: "concede", priceCents: 1, message: "Free!" };
      }
      return good(c);
    });
    const open = session.events.find((e) => e.type === "OFFER_RECEIVED" && e.sellerId === "orbit")!;
    expect(open.payload.source).toBe("rules_fallback");
    expect(open.payload.itemPriceCents).toBe(catalogItem("orbit", "headphones").listPriceCents);
    expect(session.events.some((e) => e.type === "AGENT_FALLBACK" && e.sellerId === "orbit")).toBe(true);
    expect(session.agentRun!.fallbackCount).toBeGreaterThan(0);
    // Other sellers are unaffected and the run still finishes with valid money.
    expect(session.status).toBe("ready");
    assertMoneyInvariants(session);
  });

  it("enforces non-increasing prices and the per-round concession cap", async () => {
    const { session } = await runWith((c) => {
      const u = c.user;
      if (c.agent === "Korvan Direct" && u?.turn !== "opening" && u) {
        const cur = u.yourCurrentItemPriceCents!;
        // Korvan may only concede 1.5%; propose a 10% cut, then a price increase.
        return c.nth % 2 === 0 ? { action: "concede", priceCents: Math.floor(cur * 0.9), message: "Big cut." } : { action: "concede", priceCents: cur + 100, message: "Up." };
      }
      return good(c);
    });
    const k = session.offers.find((o) => o.sellerId === "vertex")!;
    expect(k.catalog!.itemPriceCents).toBeGreaterThanOrEqual(Math.floor(catalogItem("vertex", "headphones").listPriceCents * (1 - 0.015 * 2)));
    expect(session.events.some((e) => e.type === "OFFER_REJECTED_BY_SERVER" && e.sellerId === "vertex")).toBe(true);
    assertMoneyInvariants(session);
  });

  it("rejects messages that quote amounts the server did not provide (incl. leaking the reserve)", async () => {
    const reserve = formatEur(catalogItem("prism", "headphones").minPriceCents);
    const { session } = await runWith((c) => {
      if (c.agent === "Atelier Norden" && c.user?.turn === "opening") {
        return { action: "quote", priceCents: catalogItem("prism", "headphones").listPriceCents, message: `My floor is ${reserve}.` };
      }
      return good(c);
    });
    expect(session.events.some((e) => e.type === "OFFER_REJECTED_BY_SERVER" && e.payload.reasons && (e.payload.reasons as string[]).includes("ungrounded_amount"))).toBe(true);
    expect(JSON.stringify(session.events)).not.toContain(reserve);
  });

  it.each([
    ["HTTP 500", () => new ModelHttpError(500)],
    ["HTTP 400", () => new ModelHttpError(400)],
    ["garbage text", () => "I'd love to help!"],
    ["empty object", () => ({})],
  ])("survives model failures (%s): completes with every turn labelled as fallback", async (_n, make) => {
    const { session } = await runWith(() => make());
    expect(session.status).toBe("ready");
    expect(session.agentRun!.llmCallsSucceeded).toBe(0);
    expect(session.evaluation.source).toBe("rules_fallback");
    expect(session.aiStatus).toBe("fallback");
    expect(session.events.some((e) => e.payload.source === "gemini")).toBe(false);
    expect(session.events.filter((e) => e.type === "AGENT_FALLBACK").length).toBeGreaterThan(0);
    expect(session.offers.find((o) => o.offerId === session.recommendedOfferId)!.eligible).toBe(true);
    assertMoneyInvariants(session);
  }, 30_000);

  it("stops at the model-call cap and still finishes honestly", async () => {
    const { session, calls } = await runWith(good, { maxModelCalls: 6 });
    expect(calls.length).toBeLessThanOrEqual(6);
    expect(session.agentRun!.stoppedReason).toBe("call_cap");
    expect(session.status).toBe("ready");
    assertMoneyInvariants(session);
  });

  it("stops at a daily-quota 429, finishes labelled, and makes the next run use V0 (circuit breaker)", async () => {
    const { session, calls } = await runWith(() => new ModelHttpError(429, 36_000_000));
    expect(session.status).toBe("ready");
    expect(session.agentRun!.stoppedReason).toBe("quota_exhausted");
    expect(calls.length).toBeLessThanOrEqual(4); // one attempt per opening agent, then the run stops
    expect(session.events.some((e) => e.payload.source === "gemini")).toBe(false);
    assertMoneyInvariants(session);
    const next = await startNegotiation(intent, { caller: fakeModel().caller });
    expect(next.run).toBeNull();
    expect(next.session.mode).toBe("v0_rules");
    expect(next.session.fallbackReason).toBe("model_quota_exhausted");
  });

  it("stops negotiating at the deadline", async () => {
    let t = 0;
    const { session } = await runWith(good, { now: () => (t += 20_000), deadlineMs: 60_000 });
    expect(session.agentRun!.stoppedReason).toBe("deadline");
    expect(session.status).toBe("ready");
  });

  it("ends with status failed when no seller reaches the budget", async () => {
    // Everyone holds their list price; with a €300 budget only the cheapest is reachable via concessions.
    const tight: ProductIntent = { ...intent, budgetCents: 25_500 };
    const m = fakeModel((c) => {
      const u = c.user;
      if (c.agent !== "buyer" && u && u.turn !== "opening") return { action: "hold", priceCents: u.yourCurrentItemPriceCents, message: "Price is firm." };
      return good(c);
    });
    vi.stubEnv("MULTI_AGENT_NEGOTIATION", "true");
    const { session } = await startNegotiation(tight, { caller: m.caller });
    await saveSession(session);
    await runMultiAgentNegotiation(session.sessionId, tight, "headphones", m.caller);
    const done = (await getSession(session.sessionId))!;
    expect(done.status).toBe("failed");
    expect(done.events.at(-1)!.payload.outcome).toBe("no_offer_within_budget");
  });
});

describe("rate limiter", () => {
  it("paces requests per minute and refuses to wait past the deadline", async () => {
    const lim = new RateLimiter(2);
    const deadline = Date.now() + 1_000;
    expect(await lim.acquire(deadline)).toBe(true);
    expect(await lim.acquire(deadline)).toBe(true);
    expect(await lim.acquire(deadline)).toBe(false); // the next slot is ~60s away
  });
  it("does nothing when disabled", async () => {
    expect(await new RateLimiter(0).acquire(0)).toBe(true);
  });
});

describe("single-call test engine", () => {
  const item = (id: "nova" | "orbit" | "prism" | "vertex") => catalogItem(id, "headphones");
  const script = (over: { orbitOpen?: number } = {}) => ({
    openings: (["nova", "orbit", "prism", "vertex"] as const).map((id) => ({
      sellerId: id,
      action: "quote",
      priceCents: id === "orbit" && over.orbitOpen ? over.orbitOpen : item(id).listPriceCents,
      message: "Our list price for this item.",
    })),
    rounds: [1, 2].map((r) => ({
      buyer: {
        rationale: "Asking for a small discount.",
        moves: [{ sellerId: "orbit", action: "counter", targetPriceCents: 30_000, message: "Could you do a bit better?" }],
      },
      replies: [{ sellerId: "orbit", action: "concede", priceCents: item("orbit").listPriceCents - 300 * r, message: "We can improve a little." }],
    })),
    final: { chosenSellerId: "orbit", summary: "Zefiro Express has the best balance.", reasons: ["Fast delivery and fair price."], tradeoffs: [] },
  });

  async function runScript(sc: unknown) {
    let realCalls = 0;
    const real: ModelCaller = async () => {
      realCalls++;
      return { text: JSON.stringify(sc), model: "fake-model", inputTokens: 100, outputTokens: 50 };
    };
    vi.stubEnv("MULTI_AGENT_NEGOTIATION", "true");
    const { session } = await startNegotiation(intent, { caller: real });
    await saveSession(session);
    await runSingleCallNegotiation(session.sessionId, intent, "headphones", real, null);
    return { done: (await getSession(session.sessionId))!, realCalls: () => realCalls };
  }

  it("makes exactly one real model call and still completes with valid, validated offers", async () => {
    const { done, realCalls } = await runScript(script());
    expect(realCalls()).toBe(1);
    expect(done.status).toBe("ready");
    expect(done.agentRun!.engine).toBe("single_call_script");
    expect(done.agentRun!.realModelCalls).toBe(1);
    expect(done.agentRun!.inputTokens).toBe(100);
    expect(done.offers.find((o) => o.offerId === done.recommendedOfferId)!.sellerId).toBe("orbit");
    expect(done.events.filter((e) => e.type === "COUNTEROFFER_RECEIVED").length).toBeGreaterThan(0);
    assertMoneyInvariants(done);
  });

  it("still validates the script: an out-of-limit price becomes a labelled fallback", async () => {
    const { done, realCalls } = await runScript(script({ orbitOpen: 1_000 }));
    expect(realCalls()).toBe(1);
    const open = done.events.find((e) => e.type === "OFFER_RECEIVED" && e.sellerId === "orbit")!;
    expect(open.payload.source).toBe("rules_fallback");
    expect(done.events.some((e) => e.type === "OFFER_REJECTED_BY_SERVER" && e.sellerId === "orbit")).toBe(true);
    assertMoneyInvariants(done);
  });

  it("falls back everywhere when the single call returns garbage", async () => {
    const { done, realCalls } = await runScript("not a script");
    expect(realCalls()).toBe(2); // one retry
    expect(done.status).toBe("ready");
    expect(done.evaluation.source).toBe("rules_fallback");
    assertMoneyInvariants(done);
  });
});

/* ---------- duplicate events ---------- */

describe("event persistence", () => {
  it("ignores duplicate events, even under concurrency", async () => {
    const { s } = await newSession();
    const rec = new EventRecorder(s.sessionId, Date.now());
    const evt = { key: "dup", phase: "negotiate" as const, type: "BUYER_MESSAGE" as const, sellerId: "nova" as const, payload: {}, feedText: "x" };
    const results = await Promise.all(Array.from({ length: 10 }, () => rec.record(evt)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await rec.record(evt)).toBe(false);
    const saved = (await getSession(s.sessionId))!;
    expect(saved.events).toHaveLength(1);
    expect(saved.events[0].sequence).toBe(0);
  });

  it("does not overwrite fields changed by someone else (read-modify-write under lock)", async () => {
    const { s } = await newSession();
    const rec = new EventRecorder(s.sessionId, Date.now());
    await rec.record({ key: "a", phase: "initialize", type: "AGENT_INITIALIZED", sellerId: null, payload: {}, feedText: "a" });
    const cur = (await getSession(s.sessionId))!;
    cur.approvedAt = "2026-01-01T00:00:00.000Z";
    await saveSession(cur);
    await rec.record({ key: "b", phase: "discover", type: "SELLER_DISCOVERED", sellerId: "nova", payload: {}, feedText: "b" });
    const saved = (await getSession(s.sessionId))!;
    expect(saved.approvedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(saved.events.map((e) => e.sequence)).toEqual([0, 1]);
  });
});

/* ---------- payment protection ---------- */

function gateway() {
  const amounts: number[] = [];
  const gw: Gateway = {
    async create(a) {
      amounts.push(a.amountCents);
      return { id: `ORDER-${randomUUID()}`, status: "CREATED" };
    },
    async capture() {
      throw new Error("not used");
    },
    async get() {
      throw new Error("not used");
    },
  };
  return { gw, amounts };
}

const req = (offerId: string) => new Request("http://x/approve", { method: "POST", body: JSON.stringify({ offerId }) });

describe("payment protection with multi-agent offers", () => {
  it("cannot approve while the agents are still negotiating", async () => {
    const { s } = await newSession();
    const res = await approve(req("anything"), { params: Promise.resolve({ id: s.sessionId }) });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("NEGOTIATION_NOT_READY");
  });

  it("approves only the server-validated recommendation and pays exactly its all-in cents, idempotently", async () => {
    const { session } = await runWith(good);
    const id = session.sessionId;
    const winner = session.offers.find((o) => o.offerId === session.recommendedOfferId)!;
    const other = session.offers.find((o) => o.offerId !== winner.offerId)!;
    const { gw, amounts } = gateway();

    // No order without human approval.
    await expect(createPaymentOrder(id, undefined, gw)).rejects.toMatchObject({ code: "NOT_APPROVED" });
    expect(amounts).toHaveLength(0);

    // A different offer (even if it exists) cannot be approved.
    const bad = await approve(req(other.offerId), { params: Promise.resolve({ id }) });
    expect(bad.status).toBe(409);
    expect((await bad.json()).code).toBe("OFFER_MISMATCH");
    const ok = await approve(req(winner.offerId), { params: Promise.resolve({ id }) });
    expect(ok.status).toBe(200);
    expect((await ok.json()).amountCents).toBe(winner.finalPriceCents);

    await expect(createPaymentOrder(id, other.offerId, gw)).rejects.toBeInstanceOf(PaymentError);
    const first = await createPaymentOrder(id, undefined, gw);
    const second = await createPaymentOrder(id, undefined, gw);
    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.payment.paymentAttemptId).toBe(first.payment.paymentAttemptId);
    expect(amounts).toEqual([winner.finalPriceCents]);
    expect(winner.finalPriceCents).toBe(winner.catalog!.itemPriceCents + winner.catalog!.shippingCents);
  });

  it("refuses to approve an ineligible offer", async () => {
    const { session } = await runWith(good);
    const korvan = session.offers.find((o) => o.sellerId === "vertex")!;
    const res = await approve(req(korvan.offerId), { params: Promise.resolve({ id: session.sessionId }) });
    expect(res.status).toBe(409); // not the recommendation
  });
});

/* ---------- feature flag & fallback to V0 ---------- */

describe("engine selection (feature flag)", () => {
  it("uses the untouched V0 when the flag is off", async () => {
    vi.stubEnv("MULTI_AGENT_NEGOTIATION", "false");
    const m = fakeModel();
    const { session, run } = await startNegotiation(intent, { caller: m.caller });
    expect(run).toBeNull();
    expect(session.mode).toBe("v0_rules");
    expect(session.fallbackReason).toBeNull();
    expect(session.status).toBe("ready");
    expect(m.calls).toHaveLength(0);
  });

  it.each([
    ["no API key", intent, null, "no_api_key"],
    ["a product outside the catalog", { ...intent, productQuery: "Ergonomic office chair" }, undefined, "no_catalog_match"],
    ["a budget below every catalog price", { ...intent, budgetCents: 5_000 }, undefined, "budget_below_catalog"],
  ] as const)("falls back to V0 with a recorded reason for %s", async (_n, i, caller, reason) => {
    vi.stubEnv("MULTI_AGENT_NEGOTIATION", "true");
    const { session, run } = await startNegotiation(i as ProductIntent, { caller: caller === undefined ? fakeModel().caller : caller });
    expect(run).toBeNull();
    expect(session.mode).toBe("v0_rules");
    expect(session.fallbackReason).toBe(reason);
    expect(session.status).toBe("ready");
  });

  it("starts a live negotiating session when everything is available", async () => {
    vi.stubEnv("MULTI_AGENT_NEGOTIATION", "true");
    const { session, run } = await startNegotiation(intent, { caller: fakeModel().caller });
    expect(run).toBeTypeOf("function");
    expect(session.mode).toBe("multi_agent");
    expect(session.status).toBe("negotiating");
    expect(session.offers).toEqual([]);
  });

  it("marks runs that never finished as stale", async () => {
    const { s } = await newSession();
    expect(isNegotiationStale(s)).toBe(false);
    expect(isNegotiationStale(s, Date.now() + 120_000)).toBe(true);
  });
});

/* ---------- pure validators ---------- */

describe("validators", () => {
  it("parses euro amounts in free text", () => {
    expect(amountsInText("From €299.00 or €1,299.50, shipping €5, 12.5 EUR")).toEqual([29_900, 129_950, 500, 1_250]);
    expect(ungroundedAmount(["Only €299.00"], [29_900])).toBeNull();
    expect(ungroundedAmount(["Only €1.23"], [29_900])).toBe("ungrounded_amount");
  });

  const item = catalogItem("nova", "headphones");
  const base: SellerContext = { item, profile: SELLER_PROFILES.nova, previousItemCents: 27_000, targetItemCents: 25_000, budgetCents: 35_000 };
  it.each([
    [{ action: "concede", priceCents: 26_500, message: "A bit lower for you." }, base, null],
    [{ action: "concede", priceCents: 24_000, message: "Below the reserve." }, base, "price_below_floor"],
    [{ action: "concede", priceCents: 27_100, message: "Higher than before." }, base, "price_increase"],
    [{ action: "concede", priceCents: 20_000 + 5_000, message: "Huge cut." }, { ...base, previousItemCents: 27_900 }, "concession_too_large"],
    [{ action: "hold", priceCents: 26_000, message: "Holding the price." }, base, "hold_changed_price"],
    [{ action: "quote", priceCents: 26_000, message: "Quoting again." }, base, "quote_only_when_opening"],
    [{ action: "concede", priceCents: 26_500, message: "Opening move." }, { ...base, previousItemCents: null }, "opening_must_be_quote"],
    [{ action: "quote", priceCents: 28_000, message: "Above list." }, { ...base, previousItemCents: null }, "price_above_list"],
  ])("validateSellerReply %#", (reply, ctx, expected) => {
    expect(validateSellerReply(reply as SellerReply, ctx)).toBe(expected);
  });

  it("matches catalog categories", () => {
    expect(matchCategory("Wireless noise-cancelling headphones")).toBe("headphones");
    expect(matchCategory("a new smartphone")).toBe("smartphone");
    expect(matchCategory("Laptop for work")).toBe("laptop");
    expect(matchCategory("Running shoes")).toBe("running-shoes");
    expect(matchCategory("garden gnome")).toBeNull();
  });
});
