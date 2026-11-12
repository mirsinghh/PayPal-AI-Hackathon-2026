import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Isolated store; must be set before the store module loads.
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "agentdeal-v3-"));

import { getSession, saveSession } from "@/server/db/store";
import { resetRunSlotsForTests } from "@/server/agents/config";
import type { ModelCaller, ModelRequest } from "@/server/agents/model";
import { runMultiAgentNegotiation } from "@/server/agents/run";
import { prepareSession, startNegotiation } from "@/server/negotiation/service";
import { deriveSellers } from "@/lib/negotiation-view";
import { activityForEvent, currentStatusLine, deriveActivity } from "@/lib/v3/activity";
import { phaseSteps, PHASES } from "@/lib/v3/phase";
import { choreoReducer, initialChoreo } from "@/lib/v3/mascot/choreography";
import { cueForEvent } from "@/lib/v3/mascot/event-map";
import { SELLER_IDS, type NegotiationEvent, type NegotiationSession, type ProductIntent } from "@/shared/contracts/types";

const intent: ProductIntent = {
  productQuery: "Wireless noise-cancelling headphones",
  budgetCents: 35_000,
  currency: "EUR",
  priority: "best_value",
  preferences: [],
  language: "en",
};

/* ---------- a scripted model, same contract as tests/agents.test.ts ---------- */
interface Row { store: string; sellerId?: string; offerId: string; itemPriceCents: number; itemPrice: string; total: string; withinBudget: boolean }
interface Prompt { turn?: string; yourListPriceCents?: number; yourCurrentItemPriceCents?: number; offers?: Row[] }
type Handler = (c: { agent: string; user: Prompt | null; nth: number }) => unknown;

function fakeModel(handler: Handler): ModelCaller {
  const counts = new Map<string, number>();
  return async (req: ModelRequest) => {
    const agent = req.system.includes("Buyer Agent of a shopper") ? "buyer" : /sales agent of "([^"]+)"/.exec(req.system)![1];
    let user: Prompt | null = null;
    try {
      user = JSON.parse(req.user);
    } catch {
      const last = [...req.history].reverse().find((t) => t.role === "user");
      user = last ? JSON.parse(last.text) : null;
    }
    const nth = counts.get(agent) ?? 0;
    counts.set(agent, nth + 1);
    const out = handler({ agent, user, nth });
    return { text: JSON.stringify(out), model: "fake-model", inputTokens: 10, outputTokens: 5 };
  };
}

function good({ agent, user: u }: { agent: string; user: Prompt | null; nth: number }): unknown {
  if (agent !== "buyer") {
    if (u?.turn === "opening") return { action: "quote", priceCents: u.yourListPriceCents!, message: "Our price for this item." };
    const cur = u!.yourCurrentItemPriceCents!;
    return { action: "concede", priceCents: cur - Math.max(1, Math.floor(cur / 100)), message: "We can do a little better." };
  }
  if (String(u?.turn).startsWith("negotiation_round")) {
    return {
      rationale: "Asking every seller for a small discount.",
      moves: u!.offers!.map((o) => ({ store: o.store, action: "counter", targetPriceCents: Math.floor(o.itemPriceCents * 0.97), message: `Can you beat ${o.itemPrice}?` })),
    };
  }
  const best = u!.offers!.filter((o) => o.withinBudget).sort((a, b) => a.total.localeCompare(b.total, "en", { numeric: true }))[0];
  return { chosenOfferId: (u as unknown as { serverRecommendedOfferId?: string }).serverRecommendedOfferId ?? best.offerId, summary: `Best value for you at ${best.total} all-in.`, reasons: ["A good balance of price and delivery."], tradeoffs: [] };
}

async function liveSession(handler: Handler): Promise<NegotiationSession> {
  vi.stubEnv("MULTI_AGENT_NEGOTIATION", "true");
  const caller = fakeModel(handler);
  const { session } = await startNegotiation(intent, { caller });
  await saveSession(session);
  await runMultiAgentNegotiation(session.sessionId, intent, "headphones", caller, {});
  return (await getSession(session.sessionId))!;
}

beforeEach(() => {
  resetRunSlotsForTests();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** What every engine's persisted events must satisfy once V3 reads them. */
function assertV3Reads(session: NegotiationSession) {
  const events = session.events;
  expect(events.length).toBeGreaterThan(0);

  // 1. Every recorded event is understood: it yields a sentence, and the sentence is grounded in the event.
  for (const e of events) {
    const line = activityForEvent(e);
    expect(line, e.type).not.toBeNull();
    expect(line!.eventId).toBe(e.eventId);
  }
  expect(deriveActivity(events)).toHaveLength(events.length);

  // 2. The mascot never claims an approval or a payment from negotiation events.
  for (const e of events) {
    const state = cueForEvent(e).reaction?.state;
    expect(state).not.toBe("accept");
    expect(state).not.toBe("payment_approved");
  }

  // 3. Replaying the events one by one (as the live page does) is deterministic and never runs ahead of the data.
  let s = initialChoreo();
  for (let i = 1; i <= events.length; i++) {
    s = choreoReducer(s, { type: "sync", events: events.slice(0, i) });
    expect(s.processed).toBe(i);
  }
  const again = events.reduce((acc, _e, i) => choreoReducer(acc, { type: "sync", events: events.slice(0, i + 1) }), initialChoreo());
  expect(again).toEqual(s);

  // 4. The progress rail only reaches the phase the events reached, and completes with the run.
  const rail = phaseSteps(events, false);
  const reached = PHASES.indexOf(events.at(-1)!.phase);
  expect(rail.filter((p) => p.state === "done")).toHaveLength(reached);
  expect(phaseSteps(events, true).every((p) => p.state === "done")).toBe(true);

  // 5. The sellers' state is built from events alone: nothing is revealed before its event.
  expect(deriveSellers(session, []).every((x) => x.priceCents === null && x.offer === null)).toBe(true);
  expect(deriveSellers(session, events).filter((x) => x.winner)).toHaveLength(1);
  expect(SELLER_IDS.length).toBe(4);
}

describe("V3 reads the V0 rule engine (replay)", () => {
  it("understands every event of a real V0 session", async () => {
    const session = await prepareSession(intent, { caller: null });
    expect(session.events.some((e) => e.type === "COUNTEROFFER_RECEIVED")).toBe(true);
    assertV3Reads({ ...session, mode: "v0_rules" });
  });

  it("gives a discount reaction for every V0 counteroffer (V0 only records real reductions)", async () => {
    const session = await prepareSession(intent, { caller: null });
    for (const e of session.events.filter((x) => x.type === "COUNTEROFFER_RECEIVED")) {
      expect(Number(e.payload.newPriceCents)).toBeLessThan(Number(e.payload.previousPriceCents));
      expect(cueForEvent(e).reaction?.state).toBe("discount");
    }
  });

  it("shows nothing but the phase description before the first event", () => {
    expect(currentStatusLine([]).text).toMatch(/Opening the mission/);
  });
});

describe("V3 reads the multi-agent engine (live)", () => {
  it("understands every event of a real multi-agent run", async () => {
    const session = await liveSession(good);
    expect(session.mode).toBe("multi_agent");
    assertV3Reads(session);
  });

  it("separates server guardrails and AI fallbacks from store decisions", async () => {
    const session = await liveSession((c) => {
      if (c.agent === "Brisa Outlet" && c.user?.turn === "opening" && c.nth === 0) return { action: "quote", priceCents: 1_000, message: "Insane clearance price." }; // below the reserve
      if (c.agent === "Zefiro Express") return c.user?.turn === "opening" ? { action: "quote", priceCents: 999_999, message: "Premium price." } : { action: "concede", priceCents: 1, message: "Free!" };
      return good(c);
    });
    assertV3Reads(session);

    const rejected = session.events.filter((e) => e.type === "OFFER_REJECTED_BY_SERVER");
    const fallbacks = session.events.filter((e) => e.type === "AGENT_FALLBACK");
    expect(rejected.length).toBeGreaterThan(0);
    expect(fallbacks.length).toBeGreaterThan(0);

    for (const e of rejected) {
      const cue = cueForEvent(e);
      expect(cue.reaction).toBeNull();
      expect(cue.indicator?.kind).toBe("validation");
      expect(activityForEvent(e)!.text).toMatch(/not a store decision/);
    }
    for (const e of fallbacks) {
      const cue = cueForEvent(e);
      expect(cue.reaction).toBeNull();
      expect(cue.indicator?.kind).toBe("fallback");
      expect(activityForEvent(e)!.tone).toBe("notice");
    }
    // Replies that came from the rules fallback are labelled as such, not presented as AI.
    const labelled = session.events.filter((e) => e.payload.source === "rules_fallback").map((e) => activityForEvent(e)!.source);
    expect(labelled.length).toBeGreaterThan(0);
    expect(labelled.every((s) => s === "fallback")).toBe(true);
  });

  it("treats a held price as a reply, not a discount", async () => {
    const session = await liveSession((c) => {
      if (c.agent === "Korvan Direct" && c.user && c.user.turn !== "opening") return { action: "hold", priceCents: c.user.yourCurrentItemPriceCents!, message: "That is already our best price." };
      return good(c);
    });
    const held = session.events.filter((e) => e.type === "COUNTEROFFER_RECEIVED" && e.payload.held === true);
    expect(held.length).toBeGreaterThan(0);
    for (const e of held) {
      expect(cueForEvent(e).reaction?.state).toBe("offer_received");
      expect(activityForEvent(e)!.text).toMatch(/kept/);
    }
    const drops = session.events.filter((e) => e.type === "COUNTEROFFER_RECEIVED" && e.payload.held !== true);
    expect(drops.every((e) => cueForEvent(e).reaction?.state === "discount")).toBe(true);
  });

  it("reports a failed run honestly instead of celebrating", async () => {
    const session = await liveSession((c) => (c.agent === "buyer" ? good(c) : good(c)));
    // Force the no-offer outcome through the event contract, as the server records it.
    const none: NegotiationEvent = {
      eventId: "evt_none", sessionId: session.sessionId, sequence: 99, atMs: 1, phase: "complete", type: "NEGOTIATION_COMPLETE",
      sellerId: null, payload: { outcome: "no_offer_within_budget" }, feedText: "",
    };
    expect(cueForEvent(none).reaction?.state).toBe("reject");
    expect(activityForEvent(none)!.text).toMatch(/No offer fit your budget/);
  });
});
