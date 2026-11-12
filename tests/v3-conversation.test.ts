import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "agentdeal-conv-"));

import { getSession, saveSession } from "@/server/db/store";
import { resetRunSlotsForTests } from "@/server/agents/config";
import type { ModelCaller, ModelRequest } from "@/server/agents/model";
import { runMultiAgentNegotiation } from "@/server/agents/run";
import { amountsInText as serverAmounts } from "@/server/agents/validate";
import { prepareSession, startNegotiation } from "@/server/negotiation/service";
import { ORIGIN_LABEL, amountsInText, buildConversation, poseForMessage, threadFor } from "@/lib/v3/conversation";
import { choreoReducer, initialChoreo } from "@/lib/v3/mascot/choreography";
import type { NegotiationEvent, ProductIntent } from "@/shared/contracts/types";

/** Events of a REAL multi-agent run with Gemini (see the fixture's note). */
const real = JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/gemini-run.json"), "utf8")) as { intent: ProductIntent; events: NegotiationEvent[] };
const ctx = { budgetCents: real.intent.budgetCents };

describe("conversation from a real Gemini run: authenticity", () => {
  const msgs = buildConversation(real.events, ctx);

  it("uses the agents' own words, verbatim, in chronological order", () => {
    const withText = real.events.filter((e) => ["OFFER_RECEIVED", "BUYER_MESSAGE", "COUNTEROFFER_RECEIVED"].includes(e.type));
    const spoken = msgs.filter((m) => ["opening", "ask", "reply"].includes(m.kind));
    expect(spoken.map((m) => m.text)).toEqual(withText.map((e) => e.payload.message));
    expect(spoken.every((m) => !m.templated)).toBe(true);
    expect(msgs.map((m) => m.sequence)).toEqual([...msgs.map((m) => m.sequence)].sort((a, b) => a - b));
    expect(new Set(msgs.map((m) => m.id)).size).toBe(msgs.length);
  });

  it("labels the origin from the event itself: AI turns, the rules fallback, the server", () => {
    const spoken = msgs.filter((m) => ["opening", "ask", "reply"].includes(m.kind));
    for (const m of spoken) {
      const src = real.events.find((e) => e.eventId === m.eventId)!.payload.source;
      expect(m.origin).toBe(src === "gemini" ? "ai" : "fallback");
    }
    expect(spoken.filter((m) => m.origin === "fallback").map((m) => m.text)).toEqual(Array(4).fill("Could you improve your price a little?"));
    expect(msgs.find((m) => m.kind === "fallback")!.origin).toBe("fallback");
    expect(msgs.find((m) => m.kind === "validation")!.origin).toBe("server");
    expect(msgs.find((m) => m.kind === "decision")!.origin).toBe("ai"); // the buyer's final choice records source "llm"
    expect(msgs.filter((m) => m.kind === "plan").map((m) => m.origin).sort()).toEqual(["ai", "fallback"]);
    expect(Object.values(ORIGIN_LABEL)).toEqual(["AI agent message", "Rule-based simulation", "Rules fallback", "Server validation", "System status"]);
  });

  it("ties every message to its event and its store's thread", () => {
    for (const m of msgs) {
      const e = real.events.find((x) => x.eventId === m.eventId)!;
      expect(m.sellerId).toBe(e.sellerId);
      expect(m.tech.type).toBe(e.type);
    }
    for (const id of ["nova", "orbit", "prism", "vertex"] as const) {
      const t = threadFor(msgs, id);
      expect(t.length).toBeGreaterThan(4);
      expect(t.every((m) => m.sellerId === id)).toBe(true);
      // opening, then asked, then replied, per round
      expect(t.filter((m) => m.kind === "opening")).toHaveLength(1);
      expect(t.filter((m) => m.kind === "ask")).toHaveLength(2);
      expect(t.filter((m) => m.kind === "reply")).toHaveLength(2);
    }
    expect(threadFor(msgs, null)).toHaveLength(msgs.length);
    // Buyer-level plan/choice and the buyer-level guardrails are not in any store's thread.
    expect(threadFor(msgs, "nova").some((m) => m.kind === "plan" || m.kind === "decision" || m.kind === "validation")).toBe(false);
  });

  it("takes every price card from validated offer events, never from the prose", () => {
    for (const m of msgs.filter((x) => x.kind === "reply")) {
      const e = real.events.find((x) => x.eventId === m.eventId)!;
      expect(m.price!.currentCents).toBe(e.payload.newPriceCents);
      expect(m.price!.previousCents).toBe(e.payload.previousPriceCents);
      expect(m.price!.held).toBe(e.payload.held === true);
    }
    for (const m of msgs.filter((x) => x.kind === "opening")) {
      const e = real.events.find((x) => x.eventId === m.eventId)!;
      expect(m.price!.currentCents).toBe(e.payload.initialPriceCents);
    }
    expect(msgs.filter((x) => x.speaker !== "seller").every((x) => x.price === null)).toBe(true);
  });

  it("only quotes euro amounts that the server had already recorded", () => {
    const quoted = msgs.flatMap((m) => m.amounts.map((a) => ({ m, a })));
    expect(quoted.length).toBeGreaterThan(10);
    expect(quoted.filter(({ a }) => !a.recorded)).toEqual([]);
  });

  it("is prefix-stable: polling in more events never rewrites earlier messages", () => {
    for (let k = 1; k <= real.events.length; k++) {
      const part = buildConversation(real.events.slice(0, k), ctx);
      expect(part).toEqual(msgs.slice(0, part.length));
    }
  });

  it("drives Agent D from the same events, deterministically, with fallbacks as notices only", () => {
    let s = initialChoreo();
    for (let k = 1; k <= real.events.length; k++) s = choreoReducer(s, { type: "sync", events: real.events.slice(0, k) });
    expect(s.processed).toBe(real.events.length);
    const again = real.events.reduce((a, _e, i) => choreoReducer(a, { type: "sync", events: real.events.slice(0, i + 1) }), initialChoreo());
    expect(again).toEqual(s);
    expect(poseForMessage({ speaker: "buyer", kind: "ask" })).toBe("counteroffer");
    expect(poseForMessage({ speaker: "buyer", kind: "plan" })).toBe("thinking");
    expect(poseForMessage({ speaker: "seller", kind: "reply" })).toBe("idle");
  });
});

describe("amount parsing matches the server's", () => {
  it.each(["€274.00 plus €5.90 shipping", "EUR 1,299.50 total", "about 250 € or 1.299,00 €", "no money here", "€1.000"])("%s", (t) => {
    expect(amountsInText(t)).toEqual(serverAmounts(t));
  });
});

describe("rule-based simulation (V0)", () => {
  it("shows engine templates as simulation, never as AI, and marks the synthetic opening line", async () => {
    const intent: ProductIntent = { productQuery: "Running shoes", budgetCents: 10_000, currency: "EUR", priority: "best_value", preferences: [], language: "en" };
    const s = await prepareSession(intent, { caller: null });
    const msgs = buildConversation(s.events, { budgetCents: intent.budgetCents });
    expect(msgs.some((m) => m.origin === "ai")).toBe(false);
    const spoken = msgs.filter((m) => ["opening", "ask", "reply"].includes(m.kind));
    expect(spoken.every((m) => m.origin === "rules")).toBe(true);
    expect(msgs.filter((m) => m.kind === "opening").every((m) => m.templated)).toBe(true);
    for (const m of msgs.filter((x) => x.kind === "ask" || x.kind === "reply")) expect(m.templated).toBe(false); // persisted engine text, kept verbatim
    expect(msgs.filter((m) => m.kind === "reply").every((m) => m.price!.currentCents < m.price!.previousCents!)).toBe(true);
    expect(msgs.flatMap((m) => m.amounts).every((a) => a.recorded)).toBe(true);
  });
});

/* ---------- persistence: what the engine stores is exactly what the model said ---------- */
interface Row { store: string; sellerId?: string; offerId: string; itemPriceCents: number; itemPrice: string; total: string; withinBudget: boolean }
interface Prompt { turn?: string; yourListPriceCents?: number; yourCurrentItemPriceCents?: number; offers?: Row[] }

function fakeModel(words: { opening: string; counter: string }): ModelCaller {
  return async (req: ModelRequest) => {
    const agent = req.system.includes("Buyer Agent of a shopper") ? "buyer" : "seller";
    let u: Prompt | null = null;
    try {
      u = JSON.parse(req.user);
    } catch {
      const last = [...req.history].reverse().find((t) => t.role === "user");
      u = last ? JSON.parse(last.text) : null;
    }
    let out: unknown;
    if (agent === "seller") {
      out = u?.turn === "opening" ? { action: "quote", priceCents: u.yourListPriceCents!, message: words.opening } : { action: "concede", priceCents: u!.yourCurrentItemPriceCents! - Math.max(1, Math.floor(u!.yourCurrentItemPriceCents! / 100)), message: words.counter };
    } else if (String(u?.turn).startsWith("negotiation_round")) {
      out = { rationale: "Asking every seller for a small discount.", moves: u!.offers!.map((o) => ({ store: o.store, action: "counter", targetPriceCents: Math.floor(o.itemPriceCents * 0.97), message: `Can you beat ${o.itemPrice}?` })) };
    } else {
      const best = u!.offers!.filter((o) => o.withinBudget).sort((a, b) => a.total.localeCompare(b.total, "en", { numeric: true }))[0];
      out = { chosenOfferId: (u as unknown as { serverRecommendedOfferId?: string }).serverRecommendedOfferId ?? best.offerId, summary: `Best value for you at ${best.total} all-in.`, reasons: ["A good balance of price and delivery."], tradeoffs: [] };
    }
    return { text: JSON.stringify(out), model: "fake-model", inputTokens: 1, outputTokens: 1 };
  };
}

describe("persistence and origin of messages (real orchestrator, scripted model)", () => {
  const intent: ProductIntent = { productQuery: "Wireless noise-cancelling headphones", budgetCents: 35_000, currency: "EUR", priority: "best_value", preferences: [], language: "en" };
  beforeEach(() => {
    resetRunSlotsForTests();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("stores each model message verbatim with its source, and the conversation shows those exact words", async () => {
    vi.stubEnv("MULTI_AGENT_NEGOTIATION", "true");
    const words = { opening: "Straight from the shelf: our price for this item, shipping extra.", counter: "We can do a little better, no more than this." };
    const caller = fakeModel(words);
    const { session } = await startNegotiation(intent, { caller });
    await saveSession(session);
    await runMultiAgentNegotiation(session.sessionId, intent, "headphones", caller, {});
    const stored = (await getSession(session.sessionId))!;

    const opens = stored.events.filter((e) => e.type === "OFFER_RECEIVED");
    const counters = stored.events.filter((e) => e.type === "COUNTEROFFER_RECEIVED");
    expect(opens).toHaveLength(4);
    expect(opens.every((e) => e.payload.message === words.opening && e.payload.source === "gemini" && e.payload.model === "fake-model")).toBe(true);
    expect(counters.length).toBeGreaterThan(0);
    expect(counters.every((e) => e.payload.message === words.counter && e.payload.source === "gemini")).toBe(true);
    expect(stored.events.filter((e) => e.type === "BUYER_MESSAGE").every((e) => /^Can you beat €\d/.test(String(e.payload.message)))).toBe(true);

    const convo = buildConversation(stored.events, { budgetCents: intent.budgetCents });
    expect(convo.filter((m) => m.kind === "opening").every((m) => m.text === words.opening && m.origin === "ai" && !m.templated)).toBe(true);
    expect(convo.flatMap((m) => m.amounts).every((a) => a.recorded)).toBe(true);
    // Every price card equals the persisted offer it belongs to.
    for (const m of convo.filter((x) => x.kind === "reply")) {
      const e = stored.events.find((x) => x.eventId === m.eventId)!;
      const offer = stored.offers.find((o) => o.offerId === e.payload.offerId)!;
      expect(m.price!.currentCents).toBe(Number(e.payload.newPriceCents));
      expect(offer.sellerId).toBe(m.sellerId);
    }
  });

  it("never lets a model quote an amount the server did not provide: the message is rejected, not stored", async () => {
    vi.stubEnv("MULTI_AGENT_NEGOTIATION", "true");
    const caller = fakeModel({ opening: "Special deal today: only €1.00 for you!", counter: "We can do a little better." });
    const { session } = await startNegotiation(intent, { caller });
    await saveSession(session);
    await runMultiAgentNegotiation(session.sessionId, intent, "headphones", caller, {});
    const stored = (await getSession(session.sessionId))!;
    expect(stored.events.some((e) => e.type === "OFFER_REJECTED_BY_SERVER")).toBe(true);
    expect(stored.events.filter((e) => e.type === "OFFER_RECEIVED").every((e) => !String(e.payload.message).includes("€1.00"))).toBe(true);
    const convo = buildConversation(stored.events, { budgetCents: intent.budgetCents });
    expect(convo.some((m) => m.kind === "validation" && m.origin === "server")).toBe(true);
    expect(convo.some((m) => m.kind === "fallback" && m.origin === "fallback")).toBe(true);
    expect(convo.flatMap((m) => m.amounts).every((a) => a.recorded)).toBe(true);
  });
});
