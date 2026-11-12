import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getSession, saveSession } from "@/server/db/store";
import { resetRunSlotsForTests } from "@/server/agents/config";
import { ModelHttpError, type ModelCaller, type ModelRequest } from "@/server/agents/model";
import { runMultiAgentNegotiation } from "@/server/agents/run";
import { SELLER_PROFILES, catalogItem } from "@/server/agents/catalog";
import { prepareSession, startNegotiation } from "@/server/negotiation/service";
import { activeProvider, explanationCaller, publicEngineStatus, resolveEngine } from "@/server/ai/provider";
import { resetGroqGatesForTests } from "@/server/ai/groq";
import { maxModelCalls, quotaBreakerOpen, tripQuotaBreaker } from "@/server/agents/config";
import { lowestAllowedItemCents, sellerPriceWindow, validateSellerReply } from "@/server/agents/validate";
import { buildV4Conversation } from "@/lib/v4/conversation";
import { authorLabel, engineHonesty, modelLabel, summaryRows } from "@/lib/v4/provider";
import { buildLab } from "@/lib/v4/lab";
import type { NegotiationEvent, ProductIntent, SellerId } from "@/shared/contracts/types";

const intent: ProductIntent = { productQuery: "Wireless noise-cancelling headphones", budgetCents: 35_000, currency: "EUR", priority: "best_value", preferences: ["warranty"], language: "en" };
const ENGINE = { provider: "groq", buyerModel: "openai/gpt-oss-120b", sellerModel: "openai/gpt-oss-20b", explanationModel: "openai/gpt-oss-120b" };

interface Row { store: string; sellerId?: string; offerId: string; itemPriceCents: number; itemPrice: string; total: string; withinBudget: boolean }
interface Prompt { turn?: string; yourListPriceCents?: number; yourCurrentItemPriceCents?: number; offers?: Row[] }
const parse = (req: ModelRequest): Prompt | null => {
  try {
    return JSON.parse(req.user);
  } catch {
    const last = [...req.history].reverse().find((t) => t.role === "user");
    return last ? JSON.parse(last.text) : null;
  }
};

/** A scripted stand-in for Groq: role-aware, labelled "groq", with a different voice per seller (read from its system prompt). */
function groqFake(over: { handle?: (req: ModelRequest, n: number) => string | Error | null } = {}) {
  const seen: ModelRequest[] = [];
  const caller: ModelCaller = async (req) => {
    seen.push(req);
    const n = seen.length;
    const custom = over.handle?.(req, n) ?? null;
    if (custom instanceof Error) throw custom;
    const role = req.role ?? "seller";
    const u = parse(req);
    let text: string;
    if (custom) text = custom;
    else if (role === "seller") {
      const voice = /Bargain Hunter/.test(req.system) ? "bargain" : /Speed Specialist/.test(req.system) ? "speed" : /Premium Advisor/.test(req.system) ? "premium" : "tough";
      const said = { bargain: "I can make this more attractive for you right now.", speed: "Delivery is where I stand out, so this is fair.", premium: "Long-term protection is part of the value here.", tough: "I've reviewed your proposal. This is firm." }[voice];
      text = JSON.stringify(u?.turn === "opening" ? { action: "quote", priceCents: u.yourListPriceCents, message: said } : { action: "concede", priceCents: u!.yourCurrentItemPriceCents! - Math.max(1, Math.floor(u!.yourCurrentItemPriceCents! / 100)), message: said });
    } else if (String(u?.turn).startsWith("negotiation_round")) {
      text = JSON.stringify({ rationale: "Pressing each seller with a concrete argument.", moves: u!.offers!.map((o) => ({ store: o.store, action: "counter", targetPriceCents: Math.floor(o.itemPriceCents * 0.97), message: `Your offer is competitive, but I need a better deal than ${o.itemPrice}.` })) });
    } else {
      const best = u!.offers!.filter((o) => o.withinBudget).sort((a, b) => a.total.localeCompare(b.total, "en", { numeric: true }))[0];
      text = JSON.stringify({ chosenOfferId: (u as unknown as { serverRecommendedOfferId?: string }).serverRecommendedOfferId ?? best.offerId, summary: `Best value for you at ${best.total} all-in.`, reasons: ["A good balance of price and delivery."], tradeoffs: [] });
    }
    const model = role === "seller" ? "openai/gpt-oss-20b" : "openai/gpt-oss-120b";
    return { text, model, provider: "groq", inputTokens: 100, outputTokens: 40, reasoningTokens: role === "seller" ? null : 12 };
  };
  return { caller, seen };
}

async function run(caller: ModelCaller, opts: { deadlineMs?: number } = {}) {
  vi.stubEnv("MULTI_AGENT_NEGOTIATION", "true");
  const { session } = await startNegotiation(intent, { caller });
  await saveSession(session);
  await runMultiAgentNegotiation(session.sessionId, intent, "headphones", caller, { engine: ENGINE, deadlineMs: opts.deadlineMs });
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("negotiation on the Groq engine (mocked: no network, no quota)", () => {
  it("records provider, model and source per message, keeps text verbatim, and ends with a technical summary", async () => {
    const { caller, seen } = groqFake();
    const s = await run(caller);
    expect(s.status).toBe("ready");

    const open = s.events.filter((e) => e.type === "OFFER_RECEIVED");
    expect(open.every((e) => e.payload.source === "groq" && e.payload.provider === "groq" && e.payload.model === "openai/gpt-oss-20b")).toBe(true);
    const asks = s.events.filter((e) => e.type === "BUYER_MESSAGE");
    expect(asks.every((e) => e.payload.source === "groq" && e.payload.model === "openai/gpt-oss-120b")).toBe(true);
    expect(asks.every((e) => /Your offer is competitive/.test(String(e.payload.message)))).toBe(true);
    expect(s.evaluation).toMatchObject({ source: "llm", modelName: "openai/gpt-oss-120b", provider: "groq" });

    const meta = s.agentRun!;
    expect(meta).toMatchObject({ provider: "groq", buyerModel: "openai/gpt-oss-120b", sellerModel: "openai/gpt-oss-20b", http429: 0, fallbackCount: 0, endedReason: "completed" });
    expect(meta.llmCallsAttempted).toBe(seen.length);
    expect(meta.llmCallsSucceeded).toBe(seen.length);
    expect(meta.inputTokens).toBe(seen.length * 100);
    expect(meta.reasoningTokens).toBe(seen.filter((r) => r.role !== "seller").length * 12); // only what the provider reported
    expect(meta.roles!.buyer.models).toEqual(["openai/gpt-oss-120b"]);
    expect(meta.roles!.seller.models).toEqual(["openai/gpt-oss-20b"]);
    expect(meta.turns!.fallback).toBe(0);
    expect(meta.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("gives each seller its own private context and strategy, and keeps reserve prices away from everyone else", async () => {
    const { caller, seen } = groqFake();
    const s = await run(caller);
    const sellerReqs = seen.filter((r) => r.role === "seller");
    const brands = ["Brisa Outlet", "Zefiro Express", "Atelier Norden", "Korvan Direct"];
    for (const r of sellerReqs) {
      const mine = brands.filter((b) => r.system.includes(`"${b}"`));
      expect(mine).toHaveLength(1); // a seller only ever knows its own identity
      const others = brands.filter((b) => b !== mine[0]);
      expect(others.some((b) => r.system.includes(b) || r.user.includes(b) || r.history.some((t) => t.text.includes(b)))).toBe(false);
      expect(r.wire).toBeDefined();
    }
    expect(new Set(sellerReqs.map((r) => r.system)).size).toBe(4);
    // Voices differ in what the sellers actually said (persisted text).
    const said = (id: SellerId) => s.events.find((e) => e.type === "OFFER_RECEIVED" && e.sellerId === id)!.payload.message;
    expect(new Set((["nova", "orbit", "prism", "vertex"] as const).map(said)).size).toBe(4);

    // Agent D never sees a reserve price (item reserve and total reserve, in cents or euros).
    const buyerText = seen.filter((r) => r.role === "buyer").map((r) => r.system + r.user + r.history.map((t) => t.text).join("")).join("\n");
    for (const id of ["nova", "orbit", "prism", "vertex"] as const) {
      const min = catalogItem(id, "headphones").minPriceCents;
      expect(buyerText).not.toContain(String(min));
      expect(buyerText).not.toContain(`€${(min / 100).toFixed(2)}`);
    }
    expect(buyerText).not.toMatch(/RESERVE/i);
    // And the server's rules are untouched: every final item price is at or above its seller's reserve.
    for (const o of s.offers) expect(o.catalog!.itemPriceCents).toBeGreaterThanOrEqual(catalogItem(o.sellerId, "headphones").minPriceCents);
    expect(SELLER_PROFILES.vertex.maxConcessionPerRoundBps).toBe(150);
  });

  it("rejects a price below the seller's reserve even when the JSON is perfectly valid", async () => {
    const reserve = catalogItem("nova", "headphones").minPriceCents;
    const { caller } = groqFake({
      handle: (req) => (req.role === "seller" && /Bargain Hunter/.test(req.system) && parse(req)?.turn === "opening" ? JSON.stringify({ action: "quote", priceCents: reserve - 5000, message: "Special price, take it." }) : null),
    });
    const s = await run(caller);
    const rejected = s.events.filter((e) => e.type === "OFFER_REJECTED_BY_SERVER" && e.sellerId === "nova");
    expect(rejected.length).toBeGreaterThan(0);
    expect(s.events.some((e) => e.type === "AGENT_FALLBACK" && e.sellerId === "nova")).toBe(true); // rules covered it, labelled
    expect(s.offers.find((o) => o.sellerId === "nova")!.catalog!.itemPriceCents).toBeGreaterThanOrEqual(reserve);
    expect(s.agentRun!.rejectedProposals).toBeGreaterThan(0);
  });

  it("corrects malformed JSON and schema violations through the same validation loop", async () => {
    let bad = 0;
    const { caller } = groqFake({
      handle: (req) => {
        if (req.role === "seller" && /Speed Specialist/.test(req.system) && parse(req)?.turn === "opening" && bad === 0) {
          bad++;
          return "Sure! here you go: {not json";
        }
        if (req.role === "seller" && /Premium Advisor/.test(req.system) && parse(req)?.turn === "opening" && bad === 1) {
          bad++;
          return JSON.stringify({ action: "quote", priceCents: "cheap", message: "hello there" });
        }
        return null;
      },
    });
    const s = await run(caller);
    expect(bad).toBe(2);
    const rej = s.events.filter((e) => e.type === "OFFER_REJECTED_BY_SERVER").map((e) => (e.payload.reasons as string[]).join());
    expect(rej.some((r) => r.includes("not_json"))).toBe(true);
    expect(rej.some((r) => r.includes("schema_invalid"))).toBe(true);
    // Both sellers still opened with a real model reply after the correction (no fallback).
    expect(s.events.filter((e) => e.type === "OFFER_RECEIVED" && e.payload.source === "groq")).toHaveLength(4);
  });

  it("survives a 429 storm: bounded retries, labelled fallbacks, a valid server-ranked recommendation, nothing paid", async () => {
    const { caller } = groqFake({ handle: (req, n) => (n > 2 ? new ModelHttpError(429, 5, "groq") : null) });
    const s = await run(caller);
    expect(s.status).toBe("ready");
    expect(s.agentRun!.http429).toBeGreaterThan(0);
    expect(s.agentRun!.fallbackCount).toBeGreaterThan(3);
    expect(["model_unavailable", "completed", "deadline"]).toContain(s.agentRun!.endedReason);
    expect(s.events.filter((e) => e.type === "AGENT_FALLBACK").every((e) => e.payload.source === "rules_fallback")).toBe(true);
    expect(s.evaluation.source).toBe("rules_fallback");
    expect(s.evaluation.provider ?? null).toBeNull();
    expect(s.offers.find((o) => o.offerId === s.recommendedOfferId)!.eligible).toBe(true);
    expect(s.approvedOfferId).toBeNull();
    // The UI says so honestly: this is not "AI agents negotiating".
    const h = engineHonesty(s.events, "groq");
    expect(["mostly_rules", "no_ai"]).toContain(h.level);
    expect(h.label).toMatch(/fallback/i);
  });

  it("a long 429 (daily quota) stops the run early without retry loops and trips only Groq's breaker", async () => {
    const { caller, seen } = groqFake({ handle: () => new ModelHttpError(429, 3_600_000, "groq") });
    const s = await run(caller, { deadlineMs: 30_000 });
    expect(s.agentRun!.endedReason).toBe("quota_exhausted");
    expect(seen.length).toBeLessThanOrEqual(8); // one failed turn per agent at most, never a loop
    expect(quotaBreakerOpen("groq")).toBe(true);
    expect(quotaBreakerOpen("gemini")).toBe(false); // never switches provider (or its quota) on its own
  });
});

describe("provider selection (configuration only)", () => {
  it("defaults to Gemini so existing setups keep working, and understands groq / rules", () => {
    expect(activeProvider({})).toBe("gemini");
    expect(activeProvider({ AI_PROVIDER: "GROQ" })).toBe("groq");
    expect(activeProvider({ AI_PROVIDER: "rules" })).toBe("rules");
    expect(activeProvider({ AI_PROVIDER: "something-else" })).toBe("gemini");
  });

  it("resolves the right models per role and reports missing credentials", () => {
    const g = resolveEngine({ AI_PROVIDER: "groq", GROQ_API_KEY: "gsk_x" });
    expect(g.caller).not.toBeNull();
    expect(g.agents).toEqual([
      { provider: "groq", model: "openai/gpt-oss-120b", role: "buyer" },
      { provider: "groq", model: "openai/gpt-oss-20b", role: "seller" },
      { provider: "groq", model: "openai/gpt-oss-120b", role: "explanation" },
    ]);
    expect(resolveEngine({ AI_PROVIDER: "groq" })).toMatchObject({ caller: null, unavailable: "no_api_key" });
    expect(resolveEngine({ AI_PROVIDER: "rules", GROQ_API_KEY: "gsk_x", AI_API_KEY: "g" })).toMatchObject({ provider: "rules", caller: null, unavailable: "provider_rules" });
    const gem = resolveEngine({ AI_API_KEY: "key", AI_MODEL: "gemini-3.5-flash" });
    expect(gem.provider).toBe("gemini");
    expect(gem.caller).not.toBeNull();
  });

  it("never needs a model API in rules mode, and records why the live engine was not used", async () => {
    vi.stubEnv("MULTI_AGENT_NEGOTIATION", "true");
    vi.stubEnv("AI_PROVIDER", "rules");
    const calls = vi.fn();
    vi.stubGlobal("fetch", calls);
    const { session, run } = await startNegotiation(intent);
    expect([session.mode, session.fallbackReason, run]).toEqual(["v0_rules", "provider_rules", null]);
    expect(session.evaluation.source).toBe("rules_fallback");
    expect(calls).not.toHaveBeenCalled();

    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "");
    const missing = await startNegotiation(intent);
    expect(missing.session.fallbackReason).toBe("no_api_key");
    expect(calls).not.toHaveBeenCalled();
  });

  it("exposes only non-secret engine information", () => {
    const status = publicEngineStatus({ AI_PROVIDER: "groq", GROQ_API_KEY: "gsk_super_secret_value" });
    expect(JSON.stringify(status)).not.toContain("gsk_super_secret_value");
    expect(status).toEqual({ provider: "groq", ready: true, buyerModel: "openai/gpt-oss-120b", sellerModel: "openai/gpt-oss-20b", explanationModel: "openai/gpt-oss-120b", analysisProvider: "groq" });
  });

  it("keeps one breaker per provider", () => {
    tripQuotaBreaker(60_000, "groq");
    expect([quotaBreakerOpen("groq"), quotaBreakerOpen("gemini")]).toEqual([true, false]);
  });
});

describe("explanation on the Groq explanation model", () => {
  it("writes the V0 explanation with the 120B model, labelled with its real provider, and validates it like any other", async () => {
    const sent: { model: string; content: string }[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { model: string; messages: { content: string }[] };
      const user = JSON.parse(body.messages.at(-1)!.content) as { recommendedOfferId: string; offers: { finalPriceDisplay: string }[] };
      sent.push({ model: body.model, content: body.messages.at(-1)!.content });
      const text = JSON.stringify({ summary: `Best match overall at ${user.offers.find(Boolean)!.finalPriceDisplay}.`, reasons: ["Good balance of price and delivery."], tradeoffs: [], references: [user.recommendedOfferId] });
      return new Response(JSON.stringify({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 300, completion_tokens: 60 } }), { status: 200 });
    });
    const caller = explanationCaller({ AI_PROVIDER: "groq", GROQ_API_KEY: "gsk_test" })!;
    const s = await prepareSession(intent, { caller });
    expect(sent).toHaveLength(1);
    expect(sent[0].model).toBe("openai/gpt-oss-120b");
    expect(s.evaluation).toMatchObject({ source: "llm", modelName: "openai/gpt-oss-120b", provider: "groq" });
    expect(s.aiStatus).toBe("succeeded");
    expect(explanationCaller({ AI_PROVIDER: "rules", GROQ_API_KEY: "gsk_test" })).toBeNull();
    expect(explanationCaller({ AI_PROVIDER: "groq" })).toBeNull();
  });
});

describe("V4 UI compatibility", () => {
  it("labels Groq messages with provider, model and agent, and never gives rules text a model label", async () => {
    const { caller } = groqFake({ handle: (req, n) => (req.role === "seller" && /Korvan|Tough Negotiator/.test(req.system) && n > 12 ? new ModelHttpError(500) : null) });
    const s = await run(caller);
    const msgs = buildV4Conversation(s.events, { budgetCents: intent.budgetCents, priority: intent.priority, preferences: intent.preferences, offers: s.offers });
    const sellerAi = msgs.find((m) => m.speaker === "seller" && m.origin === "ai")!;
    const buyerAi = msgs.find((m) => m.kind === "ask" && m.origin === "ai")!;
    expect(sellerAi.authorLabel).toBe("Groq · GPT-OSS 20B · Seller Agent");
    expect(buyerAi.authorLabel).toBe("Groq · GPT-OSS 120B · Buyer Agent");
    expect(msgs.filter((m) => m.origin !== "ai").every((m) => m.authorLabel === null && m.author === null)).toBe(true);
    // Text is exactly what the model said.
    const e = s.events.find((x) => x.eventId === sellerAi.eventId)!;
    expect(sellerAi.text).toBe(e.payload.message);
    // Decision Lab: the explanation is identified by its real provider and model, and the recommendation stays the server's.
    const lab = buildLab(s)!;
    expect(lab.explanation).toMatchObject({ origin: "ai", model: "openai/gpt-oss-120b", provider: "groq" });
    expect(lab.winner.offer.offerId).toBe(s.recommendedOfferId);
    expect(authorLabel({ provider: "gemini", model: "gemini-3.5-flash", role: "seller" })).toBe("Gemini · Seller Agent");
    expect(modelLabel("openai/gpt-oss-120b")).toBe("GPT-OSS 120B");
  });

  it("still reads historical sessions that have no provider metadata", () => {
    const real = JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/gemini-run.json"), "utf8")) as { intent: ProductIntent; events: NegotiationEvent[] };
    const msgs = buildV4Conversation(real.events, { budgetCents: real.intent.budgetCents, priority: real.intent.priority, preferences: real.intent.preferences, offers: [] });
    const ai = msgs.filter((m) => m.origin === "ai" && m.speaker !== "system");
    expect(ai.length).toBeGreaterThan(10);
    expect(ai.every((m) => m.authorLabel === "Gemini · Seller Agent" || m.authorLabel === "Gemini · Buyer Agent")).toBe(true);
    expect(msgs.filter((m) => m.origin === "fallback").every((m) => m.authorLabel === null)).toBe(true);
    const h = engineHonesty(real.events, "gemini");
    expect(h.ai).toBeGreaterThan(0);
    expect(h.label).toMatch(/^Live AI agents · Gemini/);
    expect(summaryRows(undefined, { evaluation: { provider: undefined } as never })).toEqual([]); // no agentRun: nothing invented
  });

  it("builds an honest summary: omits what the provider did not report", async () => {
    const { caller } = groqFake();
    const s = await run(caller);
    const rows = Object.fromEntries(summaryRows(s.agentRun, s).map((r) => [r.label, r.value]));
    expect(rows.Provider).toBe("Groq");
    expect(rows["Buyer model"]).toBe("GPT-OSS 120B");
    expect(rows["Seller model"]).toBe("GPT-OSS 20B");
    expect(rows["HTTP 429 (rate limit)"]).toBe("0");
    expect(rows.Ended).toBe("Completed");
    expect(rows.Tokens).toContain("reasoning reported");
    const noReasoning = summaryRows({ ...s.agentRun!, reasoningTokens: null }, s).find((r) => r.label === "Tokens")!;
    expect(noReasoning.value).not.toContain("reasoning");
  });

  it("classifies how much of a run was really AI", () => {
    const ev = (type: string, source: string) => ({ type, payload: { source } }) as unknown as NegotiationEvent;
    expect(engineHonesty([ev("OFFER_RECEIVED", "groq"), ev("COUNTEROFFER_RECEIVED", "groq")], "groq").level).toBe("all_ai");
    expect(engineHonesty([ev("OFFER_RECEIVED", "groq"), ev("COUNTEROFFER_RECEIVED", "rules_fallback")], "groq").level).toBe("mixed");
    expect(engineHonesty([ev("OFFER_RECEIVED", "groq"), ev("OFFER_RECEIVED", "rules_fallback"), ev("COUNTEROFFER_RECEIVED", "rules_fallback")], "groq").level).toBe("mostly_rules");
    expect(engineHonesty([ev("OFFER_RECEIVED", "rules_fallback")], "groq").level).toBe("no_ai");
  });
});

describe("fixes from the first real Groq negotiation", () => {
  it("shows each seller its own exact price window (reserve / concession cap), never anyone else's", async () => {
    const { caller, seen } = groqFake();
    await run(caller);
    const turns = seen.filter((r) => r.role === "seller");
    expect(turns.length).toBeGreaterThan(4);
    for (const r of turns) {
      const u = parse(r) as unknown as { turn: string; yourCurrentItemPriceCents?: number; yourPriceWindow: { minItemPriceCents: number; maxItemPriceCents: number; allowedActions: string[]; canConcede: boolean; range: string } };
      const id = (["nova", "orbit", "prism", "vertex"] as const).find((x) => r.system.includes(SELLER_PROFILES[x].brand))!;
      const item = catalogItem(id, "headphones");
      const w = sellerPriceWindow(item, SELLER_PROFILES[id], u.yourCurrentItemPriceCents ?? null);
      expect(u.yourPriceWindow).toMatchObject({ minItemPriceCents: w.minItemCents, maxItemPriceCents: w.maxItemCents, allowedActions: w.actions, canConcede: w.canConcede });
      expect(u.yourPriceWindow.minItemPriceCents).toBeGreaterThanOrEqual(item.minPriceCents);
      expect(r.system).toContain("yourPriceWindow");
    }
  });

  it("computes the window exactly like the validator, in integer cents", () => {
    const item = catalogItem("nova", "headphones"); // reserve 24 900, list 27 900, 6% per round
    expect(sellerPriceWindow(item, SELLER_PROFILES.nova, null)).toEqual({ minItemCents: 24_900, maxItemCents: 27_900, actions: ["quote"], canConcede: false });
    expect(sellerPriceWindow(item, SELLER_PROFILES.nova, 26_900)).toEqual({ minItemCents: 25_286, maxItemCents: 26_900, actions: ["concede", "hold"], canConcede: true });
    // At the floor the seller can only hold: this is what produced "price_below_floor" in the first real run.
    expect(sellerPriceWindow(item, SELLER_PROFILES.nova, 24_900)).toEqual({ minItemCents: 24_900, maxItemCents: 24_900, actions: ["hold"], canConcede: false });
    // Every price in the window passes the validator; one cent outside does not.
    const ctx = { item, profile: SELLER_PROFILES.nova, previousItemCents: 26_900, targetItemCents: null, budgetCents: 40_000 };
    expect(validateSellerReply({ action: "concede", priceCents: 25_286, message: "A better price for you." }, ctx)).toBeNull();
    expect(validateSellerReply({ action: "concede", priceCents: 25_285, message: "A better price for you." }, ctx)).toBe("concession_too_large");
    expect(lowestAllowedItemCents(item, SELLER_PROFILES.nova, 25_000)).toBe(24_900);
  });

  it("tells Agent D to use brand names and short rationales, and the call cap is configurable", async () => {
    const { caller, seen } = groqFake();
    await run(caller);
    const rounds = seen.filter((r) => r.role === "buyer" && String(parse(r)?.turn).startsWith("negotiation_round"));
    expect(rounds.length).toBeGreaterThan(0);
    expect(maxModelCalls()).toBe(16);
    vi.stubEnv("MULTI_AGENT_MAX_CALLS", "24");
    expect(maxModelCalls()).toBe(24);
    vi.stubEnv("MULTI_AGENT_MAX_CALLS", "999");
    expect(maxModelCalls()).toBe(16);
  });
});
