import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vitest.config.mts points DATA_DIR at a temp folder before any import: no test writes to the real ./.data.

import { getPaymentsBySession, getSession, saveSession } from "@/server/db/store";
import { quotaBreakerInfo, resetRunSlotsForTests, tripQuotaBreaker, VERCEL_MAX_DEADLINE_MS, deadlineMs } from "@/server/agents/config";
import { Agent, ModelHttpError, RunBudget, ask, issueOf, type ModelCaller } from "@/server/agents/model";
import { sellerReplySchema } from "@/server/agents/schemas";
import { validateSellerReply, type SellerContext } from "@/server/agents/validate";
import { SELLER_PROFILES, catalogItem } from "@/server/agents/catalog";
import { runMultiAgentNegotiation, fallbackCause } from "@/server/agents/run";
import { completeWithRules, recoverInterruptedNegotiation } from "@/server/agents/recover";
import { GROQ_URL, WIRE, groqModelCaller, resetGroqGatesForTests } from "@/server/ai/groq";
import { explain } from "@/server/ai/explain";
import { explanationCaller, publicEngineStatus } from "@/server/ai/provider";
import { AUTO_FALLBACK_TEXT, aiNotice, breakerIssue, breakerReason, classifyHttp, limitScopeFromMessage, waitPhrase } from "@/server/ai/limits";
import { validateDeploymentEnv } from "@/server/env";
import { isNegotiationStale, startNegotiation } from "@/server/negotiation/service";
import { rankOffers } from "@/server/negotiation/ranking";
import { createPaymentOrder, type Gateway } from "@/server/paypal/payments";
import { MODE_LABEL, modeBanner, modeChip, turnSplit, willUseText } from "@/lib/v5/response-mode";
import { analysisLabel, engineHonesty, summaryRows } from "@/lib/v4/provider";
import { BRAND } from "@/shared/brand";
import type { NegotiationSession, ProductIntent } from "@/shared/contracts/types";

const intent: ProductIntent = { productQuery: "Wireless noise-cancelling headphones", budgetCents: 35_000, currency: "EUR", priority: "best_value", preferences: [], language: "en" };

/* ---------- a scripted model that never touches the network ---------- */

interface Prompt {
  turn?: string;
  yourListPriceCents?: number;
  yourCurrentItemPriceCents?: number;
  serverRecommendedOfferId?: string;
  offers?: { store: string; offerId: string; itemPriceCents: number; itemPrice: string; total: string; withinBudget: boolean }[];
}
type Handler = (c: { agent: string; user: Prompt | null; n: number }) => unknown;

function fakeModel(handler: Handler) {
  let n = 0;
  const calls: string[] = [];
  const caller: ModelCaller = async (req) => {
    const agent = req.system.includes("Buyer Agent of a shopper") ? "buyer" : /sales agent of "([^"]+)"/.exec(req.system)![1];
    let user: Prompt | null = null;
    try {
      user = JSON.parse(req.user);
    } catch {
      const last = [...req.history].reverse().find((t) => t.role === "user");
      user = last ? JSON.parse(last.text) : null;
    }
    calls.push(agent);
    const out = handler({ agent, user, n: n++ });
    if (out instanceof Error) throw out;
    return { text: JSON.stringify(out), model: "openai/gpt-oss-20b", provider: "groq", inputTokens: 10, outputTokens: 5 };
  };
  return { caller, calls };
}

function good({ agent, user: u }: { agent: string; user: Prompt | null }): unknown {
  if (agent !== "buyer") {
    if (u?.turn === "opening") return { action: "quote", priceCents: u.yourListPriceCents!, message: "Our price for this item." };
    const cur = u!.yourCurrentItemPriceCents!;
    return { action: "concede", priceCents: cur - Math.max(1, Math.floor(cur / 100)), message: "We can do a little better." };
  }
  if (String(u?.turn).startsWith("negotiation_round")) {
    return { rationale: "Asking every seller for a small discount.", moves: u!.offers!.map((o) => ({ store: o.store, action: "counter", targetPriceCents: Math.floor(o.itemPriceCents * 0.97), message: `Can you beat ${o.itemPrice}?` })) };
  }
  const best = u!.offers!.filter((o) => o.withinBudget)[0];
  return { chosenOfferId: u!.serverRecommendedOfferId ?? best.offerId, summary: `Best value for you at ${best.total} all-in.`, reasons: ["A good balance of price and delivery."], tradeoffs: [] };
}

const groq429 = (message: string, retryAfterMs: number | null, scope: "rpm" | "tpm" | "rpd" | "tpd") => new ModelHttpError(429, retryAfterMs, "groq", message, scope);
const DAILY_MSG = "Rate limit reached for model `openai/gpt-oss-20b` on requests per day (RPD): Limit 1000, Used 1000. Please try again in 14m23s.";
const TPM_MSG = "Rate limit reached for model `openai/gpt-oss-120b` on tokens per minute (TPM): Limit 8000, Used 7900, Requested 900. Please try again in 7s.";

async function runWith(handler: Handler, opts: Parameters<typeof runMultiAgentNegotiation>[4] = {}) {
  const m = fakeModel(handler);
  vi.stubEnv("MULTI_AGENT_NEGOTIATION", "true");
  const { session } = await startNegotiation(intent, { caller: m.caller });
  await saveSession(session);
  await runMultiAgentNegotiation(session.sessionId, intent, "headphones", m.caller, { engine: { provider: "groq", buyerModel: "openai/gpt-oss-120b", sellerModel: "openai/gpt-oss-20b", explanationModel: "openai/gpt-oss-120b" }, ...opts });
  return { s: (await getSession(session.sessionId))!, calls: m.calls };
}

beforeEach(() => {
  resetRunSlotsForTests();
  resetGroqGatesForTests();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ---------- 1-3. detection of 429, exhausted quota, Retry-After ---------- */

describe("telling provider problems apart", () => {
  it("reads which limit a 429 refers to from the provider's own message", () => {
    expect(limitScopeFromMessage(TPM_MSG)).toBe("tpm");
    expect(limitScopeFromMessage(DAILY_MSG)).toBe("rpd");
    expect(limitScopeFromMessage("Rate limit reached ... on tokens per day (TPD)")).toBe("tpd");
    expect(limitScopeFromMessage("Rate limit reached ... on requests per minute (RPM)")).toBe("rpm");
    expect(limitScopeFromMessage("Quota exceeded for metric GenerateRequestsPerDayPerProjectPerModel-FreeTier")).toBe("rpd");
    expect(limitScopeFromMessage("something else")).toBeNull();
  });

  it("does not treat every error as a quota problem", () => {
    expect(classifyHttp(429, "rpm")).toBe("rate_limit");
    expect(classifyHttp(429, "tpm")).toBe("token_limit");
    expect(classifyHttp(429, "tpd")).toBe("daily_quota");
    expect(classifyHttp(429, null)).toBe("rate_limit");
    expect(classifyHttp(401, null)).toBe("credentials");
    expect(classifyHttp(403, null)).toBe("credentials");
    expect(classifyHttp(503, null)).toBe("server_error");
    expect(classifyHttp(400, null, "Failed to generate JSON")).toBe("structured_failed");
    expect(classifyHttp(400, null, "invalid request")).toBe("unavailable");
    expect(issueOf(new Error("groq_timeout")).kind).toBe("timeout");
    expect(issueOf(new Error("groq_network")).kind).toBe("unavailable");
  });

  it("the Groq adapter turns a real 429 body into a typed error with the provider's Retry-After", async () => {
    const impl = (async () => new Response(JSON.stringify({ error: { message: TPM_MSG } }), { status: 429, headers: { "retry-after": "7" } })) as unknown as typeof fetch;
    const caller = groqModelCaller({ env: { GROQ_API_KEY: "k" }, fetchImpl: impl })!;
    const e = (await caller({ system: "s", history: [], user: "{}", maxOutputTokens: 100, role: "seller", wire: WIRE.sellerReply }).catch((x) => x)) as ModelHttpError;
    expect(e).toBeInstanceOf(ModelHttpError);
    expect([e.status, e.scope, e.retryAfterMs]).toEqual([429, "tpm", 7000]);
    expect(issueOf(e)).toEqual({ kind: "token_limit", retryAfterMs: 7000, scope: "tpm" });
    expect(GROQ_URL).toContain("groq.com");
  });

  it("a daily quota stops the run at once (one call, no retry loop) and opens the circuit breaker", async () => {
    let calls = 0;
    const caller: ModelCaller = async () => {
      calls++;
      throw groq429(DAILY_MSG, 863_000, "rpd");
    };
    const budget = new RunBudget(Date.now());
    const ctx: SellerContext = { item: catalogItem("nova", "headphones"), profile: SELLER_PROFILES.nova, previousItemCents: null, targetItemCents: null, budgetCents: 35_000 };
    const r = await ask(new Agent("seller:nova", "sys"), caller, budget, "{}", sellerReplySchema, (v) => validateSellerReply(v, ctx));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("quota_exhausted");
      expect(r.issue).toMatchObject({ kind: "daily_quota", scope: "rpd" });
      expect(fallbackCause(r)).toBe("daily_quota");
    }
    expect(calls).toBe(1);
    expect(budget.quotaExhausted).toBe(true);
    expect(quotaBreakerInfo("groq")?.issue?.kind).toBe("daily_quota");
  });

  it("rejected credentials stop the run and are never called a quota", async () => {
    const caller: ModelCaller = async () => {
      throw new ModelHttpError(401, null, "groq", "Invalid API Key");
    };
    const budget = new RunBudget(Date.now());
    const ctx: SellerContext = { item: catalogItem("nova", "headphones"), profile: SELLER_PROFILES.nova, previousItemCents: null, targetItemCents: null, budgetCents: 35_000 };
    const r = await ask(new Agent("seller:nova", "sys"), caller, budget, "{}", sellerReplySchema, (v) => validateSellerReply(v, ctx));
    if (r.ok) throw new Error("expected failure");
    expect(r.issue?.kind).toBe("credentials");
    expect(fallbackCause(r)).toBe("credentials");
    expect(budget.stopReason()).toBe("model_unavailable");
    expect(aiNotice(r.issue ?? null).text).not.toMatch(/usage limit/);
  });

  it("honours Retry-After: waits the provider's time, then retries once and succeeds", async () => {
    let calls = 0;
    const caller: ModelCaller = async () => {
      if (calls++ === 0) throw groq429(TPM_MSG, 120, "tpm");
      return { text: JSON.stringify({ action: "quote", priceCents: catalogItem("nova", "headphones").listPriceCents, message: "Our price." }), model: "m", provider: "groq", inputTokens: 1, outputTokens: 1 };
    };
    const ctx: SellerContext = { item: catalogItem("nova", "headphones"), profile: SELLER_PROFILES.nova, previousItemCents: null, targetItemCents: null, budgetCents: 35_000 };
    const t0 = Date.now();
    const r = await ask(new Agent("seller:nova", "sys"), caller, new RunBudget(Date.now()), "{}", sellerReplySchema, (v) => validateSellerReply(v, ctx));
    expect(r.ok).toBe(true);
    expect(calls).toBe(2);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(300); // 120 ms hint + the 250 ms margin the engine adds
  });

  it("never waits beyond the run's deadline for a long Retry-After: it stops and records the quota", async () => {
    const caller: ModelCaller = async () => {
      throw groq429(TPM_MSG, 600_000, "tpm");
    };
    const ctx: SellerContext = { item: catalogItem("nova", "headphones"), profile: SELLER_PROFILES.nova, previousItemCents: null, targetItemCents: null, budgetCents: 35_000 };
    const t0 = Date.now();
    const r = await ask(new Agent("seller:nova", "sys"), caller, new RunBudget(Date.now(), Date.now, 16, 5000), "{}", sellerReplySchema, (v) => validateSellerReply(v, ctx));
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("quota_exhausted");
    expect(quotaBreakerInfo("groq")?.remainingMs).toBeGreaterThan(500_000);
  });
});

/* ---------- user-facing wording: real times only ---------- */

describe("AI temporarily unavailable: wording", () => {
  it("uses the required quota message and offers both buttons' wording elsewhere", () => {
    const n = aiNotice({ kind: "rate_limit", retryAfterMs: null, scope: "rpm" });
    expect(n.title).toBe("AI temporarily unavailable");
    expect(n.text).toBe("Agent D has reached the AI provider's usage limit. You can try again later or continue with our rule-based negotiation engine.");
    expect(AUTO_FALLBACK_TEXT).toBe("AI is temporarily unavailable. Agent D is continuing with server-based negotiation rules.");
  });
  it("gives an estimate only when the provider reported one, and never invents one", () => {
    expect(aiNotice({ kind: "rate_limit", retryAfterMs: 180_000, scope: "rpm" }).retry).toBe("AI requests are temporarily limited. Try again in approximately 3 minutes.");
    expect(aiNotice({ kind: "token_limit", retryAfterMs: 7_000, scope: "tpm" }).retry).toBe("AI requests are temporarily limited. Try again in less than a minute.");
    expect(aiNotice({ kind: "rate_limit", retryAfterMs: null, scope: null }).retry).toBe("Please try again later.");
    expect(aiNotice(null).retry).toBe("Please try again later.");
    expect(waitPhrase(0)).toBeNull();
    expect(waitPhrase(Number.NaN)).toBeNull();
  });
  it("a daily quota just says to try later, even if the provider sent a reset time, and offers no retry button", () => {
    const n = aiNotice({ kind: "daily_quota", retryAfterMs: 863_000, scope: "rpd" });
    expect(n.retry).toBe("Please try again later.");
    expect(n.canRetry).toBe(false);
  });
  it("problems that are not quotas never say 'usage limit'", () => {
    for (const kind of ["credentials", "server_error", "timeout", "unavailable", "invalid_response", "structured_failed"] as const) {
      expect(aiNotice({ kind, retryAfterMs: 60_000, scope: null }).text).not.toMatch(/usage limit/);
      expect(aiNotice({ kind, retryAfterMs: 60_000, scope: null }).retry).toBe("Please try again later.");
    }
  });
  it("an open breaker keeps a time only if the provider reported one, and reports what is really left", () => {
    tripQuotaBreaker(120_000, "groq", Date.now(), { kind: "rate_limit", retryAfterMs: 120_000, scope: "rpm" });
    const info = quotaBreakerInfo("groq")!;
    const issue = breakerIssue(info);
    expect(issue.retryAfterMs).toBeGreaterThan(100_000);
    expect(issue.retryAfterMs).toBeLessThanOrEqual(120_000);
    expect(breakerReason(issue)).toBe("model_quota_exhausted");
    // Our own guess (no provider time) is never shown.
    resetRunSlotsForTests();
    tripQuotaBreaker(900_000, "groq", Date.now(), { kind: "daily_quota", retryAfterMs: null, scope: "rpd" });
    expect(breakerIssue(quotaBreakerInfo("groq")!).retryAfterMs).toBeNull();
    resetRunSlotsForTests();
    tripQuotaBreaker(600_000, "groq", Date.now(), { kind: "credentials", retryAfterMs: null, scope: null });
    expect(breakerReason(breakerIssue(quotaBreakerInfo("groq")!))).toBe("provider_credentials");
  });
});

/* ---------- 4-6. automatic fallback, continuity, no duplicates ---------- */

describe("automatic fallback to server rules", () => {
  it("a run whose provider is out of quota from the first call still finishes, on rules, labelled as rules", async () => {
    const { s, calls } = await runWith(() => groq429(DAILY_MSG, 863_000, "rpd"));
    expect(s.status).toBe("ready");
    expect(s.offers).toHaveLength(4);
    expect(s.offers.some((o) => o.eligible)).toBe(true);
    // Budget and preferences untouched; every offer inside policy.
    expect(s.intent).toEqual(intent);
    for (const o of s.offers) {
      expect(o.finalPriceCents).toBeGreaterThanOrEqual(o.minPriceCents);
      expect(o.eligible).toBe(o.finalPriceCents <= intent.budgetCents);
    }
    // Nothing the server wrote is attributed to AI.
    const turns = s.events.filter((e) => ["OFFER_RECEIVED", "COUNTEROFFER_RECEIVED", "BUYER_DECISION"].includes(e.type));
    expect(turns.length).toBeGreaterThan(0);
    expect(turns.every((e) => e.payload.source === "rules_fallback")).toBe(true);
    expect(s.evaluation.source).toBe("rules_fallback");
    expect(s.evaluation.provider ?? null).toBeNull();
    expect(s.aiStatus).toBe("fallback");
    expect(s.agentRun?.aiIssue).toMatchObject({ kind: "daily_quota" });
    expect(s.agentRun?.turns?.ai).toBe(0);
    expect(s.agentRun?.fallbackCauses?.daily_quota).toBeGreaterThan(0);
    // No more provider calls than needed: the first failure stopped the rest.
    expect(calls.length).toBeLessThanOrEqual(4);
    // Nothing was approved or paid by changing engine.
    expect(s.approvedOfferId).toBeNull();
    expect(await getPaymentsBySession(s.sessionId)).toEqual([]);
  });

  it("a provider that fails half-way gives a mixed run: confirmed events stay, no duplicates, honest counts", async () => {
    const { s } = await runWith((c) => (c.n >= 6 ? new ModelHttpError(503, null, "groq", "overloaded") : good(c)));
    expect(s.status).toBe("ready");
    const ids = s.events.map((e) => e.eventId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(s.events.map((e) => e.sequence)).toEqual(s.events.map((_, i) => i));
    for (let i = 1; i < s.events.length; i++) expect(s.events[i].atMs).toBeGreaterThanOrEqual(s.events[i - 1].atMs);
    const turn = (e: { type: string }) => ["OFFER_RECEIVED", "COUNTEROFFER_RECEIVED", "BUYER_DECISION"].includes(e.type);
    const ai = s.events.filter((e) => turn(e) && e.payload.source === "groq").length;
    const rules = s.events.filter((e) => turn(e) && e.payload.source === "rules_fallback").length;
    expect(ai).toBeGreaterThan(0);
    expect(rules).toBeGreaterThan(0);
    const split = turnSplit(s)!;
    expect(split.rules).toBeGreaterThan(0);
    expect(split.ai).toBeGreaterThan(0);
    const h = engineHonesty(s.events, "groq");
    expect(h.ai).toBe(ai);
    expect(h.fallback).toBe(rules);
    expect(["mixed", "mostly_rules"]).toContain(h.level);
    expect(s.agentRun?.aiIssue?.kind).toBe("server_error");
  });

  it("calling the same finished negotiation's closing steps again never repeats an event", async () => {
    const { s } = await runWith(good);
    const again = completeWithRules({ ...s, status: "negotiating" });
    const ids = again.events.map((e) => e.eventId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(again.events.length).toBe(s.events.length + 1); // only the one "interrupted" marker is new
  });
});

/* ---------- interrupted runs (Vercel): complete with rules, keep history ---------- */

describe("completing an interrupted negotiation", () => {
  async function interrupted(): Promise<NegotiationSession> {
    const { s } = await runWith(good);
    // As if the platform killed the function right after the negotiation rounds: no closing steps were written.
    const cut = new Set(["REQUIREMENT_VERIFIED", "OFFER_EVALUATED", "WINNER_SELECTED", "NEGOTIATION_COMPLETE"]);
    const keep = s.events.filter((e) => !cut.has(e.type) && !(e.type === "BUYER_DECISION" && e.payload.final === true));
    return { ...s, events: keep.map((e, i) => ({ ...e, sequence: i })), status: "negotiating", aiStatus: "pending", agentRun: undefined, createdAt: new Date(Date.now() - 10 * 60_000).toISOString() };
  }

  it("is only triggered for a run that outlived its budget", async () => {
    const s = await interrupted();
    expect(isNegotiationStale(s)).toBe(true);
    expect(isNegotiationStale({ ...s, createdAt: new Date().toISOString() })).toBe(false);
  });

  it("keeps every confirmed event untouched, adds only the missing closing steps, and labels them as rules", async () => {
    const s = await interrupted();
    const done = completeWithRules(s);
    expect(done.events.slice(0, s.events.length)).toEqual(s.events);
    const added = done.events.slice(s.events.length);
    expect(added.length).toBeGreaterThan(0);
    expect(new Set(done.events.map((e) => e.eventId)).size).toBe(done.events.length);
    expect(added.some((e) => e.type === "NEGOTIATION_COMPLETE")).toBe(true);
    const final = added.find((e) => e.type === "BUYER_DECISION")!;
    expect(final.payload.source).toBe("rules_fallback");
    expect(done.status).toBe("ready");
    expect(done.evaluation.source).toBe("rules_fallback");
    expect(done.agentRun).toMatchObject({ recoveredWithRules: true, endedReason: "interrupted" });
    // The server's own deterministic ranking decides; the intent is untouched; nothing approved.
    expect(done.recommendedOfferId).toBe(rankOffers(done.offers, intent.priority).recommendedOfferId);
    expect(done.intent).toEqual(intent);
    expect(done.approvedOfferId).toBeNull();
    expect(done.offers).toEqual(s.offers);
  });

  it("closes as failed (honestly) when fewer than four offers were confirmed", async () => {
    const s = await interrupted();
    const done = completeWithRules({ ...s, offers: s.offers.slice(0, 2) });
    expect(done.status).toBe("failed");
    expect(done.events.at(-1)?.payload.outcome).toBe("interrupted_before_offers");
  });

  it("persists through the recovery entry point exactly once, and a second call changes nothing", async () => {
    const s = await interrupted();
    await saveSession(s);
    const first = (await recoverInterruptedNegotiation(s.sessionId))!;
    expect(first.status).toBe("ready");
    const second = (await recoverInterruptedNegotiation(s.sessionId))!;
    expect(second.events).toEqual(first.events);
    expect((await getSession(s.sessionId))!.status).toBe("ready");
  });

  it("works on sessions created before provider tracking (no agentRun, no responseMode)", async () => {
    const s = await interrupted();
    const old = { ...s } as Partial<NegotiationSession>;
    delete old.responseMode;
    delete old.agentRun;
    expect(completeWithRules(old as NegotiationSession).status).toBe("ready");
  });

  it("does not change approval or payment rules: a recovered session still needs the user to approve before any order", async () => {
    const s = await interrupted();
    const done = completeWithRules(s);
    await saveSession(done);
    const gw = { create: vi.fn(), capture: vi.fn(), get: vi.fn() } as unknown as Gateway;
    await expect(createPaymentOrder(done.sessionId, undefined, gw)).rejects.toMatchObject({ code: "NOT_APPROVED" });
    expect(gw.create).not.toHaveBeenCalled();
  });
});

/* ---------- 8. explanations ---------- */

describe("the 'why this offer' explanation is separate and honestly labelled", () => {
  it("falls back to the deterministic explanation when the provider fails, and labels it Rules-based analysis", async () => {
    const s = await runWith(good);
    const failing = async () => {
      throw groq429(DAILY_MSG, 863_000, "rpd");
    };
    const ranking = rankOffers(s.s.offers, intent.priority);
    const r = await explain(intent, s.s.offers, ranking, failing);
    expect(r.aiStatus).toBe("fallback");
    expect(r.evaluation.source).toBe("rules_fallback");
    expect(analysisLabel({ source: r.evaluation.source, modelName: null })).toBe("Rules-based analysis");
  });

  it("labels a real Groq explanation with provider and model, and a rules one never gets a model name", () => {
    expect(analysisLabel({ source: "llm", modelName: "openai/gpt-oss-120b", provider: "groq" })).toBe("AI analysis · Groq · GPT-OSS 120B");
    expect(analysisLabel({ source: "rules_fallback", modelName: "openai/gpt-oss-120b", provider: "groq" })).toBe("Rules-based analysis");
    expect(analysisLabel({ source: "llm", modelName: "gemini-3.5-flash" })).toBe("AI analysis · Gemini");
  });

  it("does not even call a provider whose breaker is open: the analysis is rules-based at once", () => {
    const env = { AI_PROVIDER: "groq", GROQ_API_KEY: "k" };
    expect(explanationCaller(env)).not.toBeNull();
    tripQuotaBreaker(600_000, "groq", Date.now(), { kind: "daily_quota", retryAfterMs: null, scope: "rpd" });
    expect(explanationCaller(env)).toBeNull();
  });

  it("a daily quota seen while writing the analysis also stops the negotiation engine from trying that provider", async () => {
    const impl = (async () => new Response(JSON.stringify({ error: { message: DAILY_MSG } }), { status: 429, headers: { "retry-after": "863" } })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", impl);
    const caller = explanationCaller({ AI_PROVIDER: "groq", GROQ_API_KEY: "k" })!;
    await expect(caller("s", "u")).rejects.toBeInstanceOf(ModelHttpError);
    expect(quotaBreakerInfo("groq")?.issue?.kind).toBe("daily_quota");
  });
});

/* ---------- 9. selector and starting a negotiation ---------- */

describe("AI Agents / Server Rules selector", () => {
  it("is labelled exactly Server Rules and AI Agents", () => {
    expect(MODE_LABEL).toEqual({ server: "Server Rules", ai: "AI Agents" });
  });
  it("says what will be used, from the server-reported provider and models", () => {
    expect(willUseText("server", null, true)).toMatch(/Server Rules.*No Groq or Gemini call/);
    expect(willUseText("ai", { provider: "groq", buyer: "openai/gpt-oss-120b", seller: "openai/gpt-oss-20b" }, true)).toBe("This run will use: AI Agents · Groq (GPT-OSS 120B buyer, GPT-OSS 20B sellers). If the AI cannot answer, Agent D continues with server rules and says so.");
    // AI selected but unavailable: the text describes what will really happen.
    expect(willUseText("ai", null, false)).toMatch(/Server Rules/);
  });
  it("Server Rules never calls a model", async () => {
    const m = fakeModel(good);
    const { session, run } = await startNegotiation(intent, { caller: m.caller, responseMode: "server", explainCaller: null });
    expect(run).toBeNull();
    expect(m.calls).toHaveLength(0);
    expect(session.mode).toBe("v0_rules");
    expect(session.responseMode).toBe("server");
  });
  it("AI Agents against a provider that is known to be limited goes straight to labelled server rules, with the reason and the provider's time", async () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.stubEnv("ANALYSIS_PROVIDER", "rules");
    tripQuotaBreaker(180_000, "groq", Date.now(), { kind: "rate_limit", retryAfterMs: 180_000, scope: "rpm" });
    const { session, run } = await startNegotiation(intent, { responseMode: "ai" });
    expect(run).toBeNull();
    expect(session.mode).toBe("v0_rules");
    expect(session.responseMode).toBe("ai");
    expect(session.fallbackReason).toBe("model_quota_exhausted");
    expect(session.fallbackIssue?.kind).toBe("rate_limit");
    expect(session.fallbackIssue?.retryAfterMs).toBeGreaterThan(100_000);
    expect(modeBanner(session)?.text).toMatch(/You chose AI Agents, but AI could not run.*not AI/);
    expect(publicEngineStatus({ AI_PROVIDER: "groq", GROQ_API_KEY: "k" }).ready).toBe(true);
  });
  it("AI Agents with rejected credentials is not described as a quota", async () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.stubEnv("ANALYSIS_PROVIDER", "rules");
    tripQuotaBreaker(600_000, "groq", Date.now(), { kind: "credentials", retryAfterMs: null, scope: null });
    const { session } = await startNegotiation(intent, { responseMode: "ai" });
    expect(session.fallbackReason).toBe("provider_credentials");
    expect(modeBanner(session)?.text).not.toMatch(/quota/);
  });
});

/* ---------- 7. labels of origin ---------- */

describe("who wrote it: labels", () => {
  const base = { responseMode: "ai" as const, mode: "multi_agent" as const, fallbackReason: null };
  it("a fully AI run has no warning and the AI Agents chip", () => {
    const s = { ...base, agentRun: { turns: { ai: 9, fallback: 0 } } };
    expect(modeBanner(s)).toBeNull();
    expect(modeChip(s)).toEqual({ tone: "primary", text: "AI Agents" });
  });
  it("a mixed run says how many turns each engine wrote", () => {
    const s = { ...base, agentRun: { turns: { ai: 5, fallback: 3 } } };
    expect(modeBanner(s)?.text).toMatch(/Mixed negotiation: 5 turns written by AI agents and 3 by server rules/);
    expect(modeChip(s)?.text).toBe("Mixed · 5 AI · 3 rules");
  });
  it("a run that ended up entirely on rules is not called an AI negotiation", () => {
    const s = { ...base, agentRun: { turns: { ai: 0, fallback: 7 } } };
    expect(modeBanner(s)?.text).toMatch(/entirely on server rules.*not an AI negotiation/);
    expect(modeChip(s)?.text).toBe("Server rules (AI unavailable)");
  });
  it("a Server Rules session is never labelled AI, and older sessions show nothing extra", () => {
    expect(modeChip({ responseMode: "server", mode: "v0_rules" })?.text).toBe("Server Rules");
    expect(modeBanner({ responseMode: undefined, mode: undefined, fallbackReason: null })).toBeNull();
    expect(modeChip({ responseMode: undefined, mode: undefined })).toBeNull();
    expect(turnSplit({})).toBeNull();
  });
  it("the technical summary names the provider problem and an interrupted run", () => {
    const rows = summaryRows({ model: null, startedAt: "", finishedAt: null, llmCallsAttempted: 3, llmCallsSucceeded: 1, fallbackCount: 2, rejectedProposals: 0, inputTokens: 1, outputTokens: 1, stoppedReason: "interrupted", buyerChoseTopRanked: null, endedReason: "interrupted", aiIssue: { kind: "daily_quota", retryAfterMs: null, scope: "rpd" } }, { evaluation: { provider: null } as NegotiationSession["evaluation"] });
    expect(rows.find((r) => r.label === "AI provider issue")?.value).toBe("Daily quota exhausted");
    expect(rows.find((r) => r.label === "Ended")?.value).toMatch(/Interrupted/);
  });
});

/* ---------- 11. deployment environment ---------- */

describe("deployment environment checks", () => {
  const good = { PAYPAL_ENV: "sandbox", PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "secret", SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", AI_PROVIDER: "groq", GROQ_API_KEY: "g", APP_BASE_URL: "https://agent-d.vercel.app", AUTOBUY_ENCRYPTION_KEY: "k" };
  it("the recommended hackathon configuration passes with no errors", () => {
    expect(validateDeploymentEnv({ ...good, MULTI_AGENT_DEADLINE_MS: "30000" }, { vercel: true })).toEqual({ ok: true, issues: [] });
  });
  it("missing Supabase is an error on Vercel but only a warning locally", () => {
    const e = { ...good, SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "your-service-key" };
    expect(validateDeploymentEnv(e, { vercel: true }).issues.filter((i) => i.level === "error").map((i) => i.name)).toEqual(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
    expect(validateDeploymentEnv(e, { vercel: false }).ok).toBe(true);
  });
  it("PayPal must be Sandbox with credentials", () => {
    expect(validateDeploymentEnv({ ...good, PAYPAL_ENV: "live" }, { vercel: true }).issues[0]).toMatchObject({ level: "error", name: "PAYPAL_ENV" });
    expect(validateDeploymentEnv({ ...good, PAYPAL_CLIENT_SECRET: undefined }, { vercel: true }).ok).toBe(false);
  });
  it("a missing AI key only warns: Server Rules keep the demo working", () => {
    const r = validateDeploymentEnv({ ...good, GROQ_API_KEY: undefined }, { vercel: true });
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.name)).toContain("GROQ_API_KEY");
    expect(validateDeploymentEnv({ ...good, AI_PROVIDER: "rules", GROQ_API_KEY: undefined }, { vercel: true }).issues).toEqual([]);
  });
  it("a secret in a NEXT_PUBLIC_ variable is an error", () => {
    expect(validateDeploymentEnv({ ...good, NEXT_PUBLIC_GROQ_API_KEY: "x" }, { vercel: true }).ok).toBe(false);
    expect(validateDeploymentEnv({ ...good, NEXT_PUBLIC_APP_NAME: "Agent D" }, { vercel: true }).ok).toBe(true);
  });
  it("caps the AI time budget on Vercel so the platform cannot kill a run", () => {
    vi.stubEnv("MULTI_AGENT_DEADLINE_MS", "300000");
    vi.stubEnv("VERCEL", "1");
    expect(deadlineMs()).toBe(VERCEL_MAX_DEADLINE_MS);
    vi.stubEnv("VERCEL", "");
    expect(deadlineMs()).toBe(300_000);
    vi.stubEnv("MULTI_AGENT_DEADLINE_MS", "30000");
    vi.stubEnv("VERCEL", "1");
    expect(deadlineMs()).toBe(30_000);
  });
  it("every variable the code reads is documented in VERCEL_DEPLOYMENT.md and .env.example is free of real keys", () => {
    const doc = readFileSync("AgentD_DOCS/V5/VERCEL_DEPLOYMENT.md", "utf8");
    const used = new Set<string>();
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = path.join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx|mjs)$/.test(f)) for (const m of readFileSync(p, "utf8").matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) used.add(m[1]);
      }
    };
    for (const d of ["app", "components", "lib", "server", "shared", "scripts"]) walk(d);
    for (const name of used) expect(doc, `${name} is not documented`).toContain(name);
    const example = readFileSync(".env.example", "utf8");
    const eol = new RegExp(String.fromCharCode(13) + "?" + String.fromCharCode(10));
    for (const line of example.split(eol)) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line);
      if (m && /KEY|SECRET/.test(m[1])) expect(m[2] === "" || /^your-/.test(m[2]), `${m[1]} looks like a real value`).toBe(true);
    }
    expect(example.split(eol).filter((l) => !l.startsWith("#") && /NEXT_PUBLIC_/.test(l))).toEqual([]);
  });
});

/* ---------- 12. branding ---------- */

describe("public identity: Agent D", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  it("uses the final name and tagline", () => {
    expect(BRAND.name).toBe("Agent D");
    expect(BRAND.tagline).toBe("Agent D, it always gets you the best deal.");
    // The tagline never travels without its scope.
    expect(BRAND.scope).toMatch(/simulated/);
    expect(BRAND.scope).toMatch(/not necessarily the whole market/);
    expect(BRAND.description).toMatch(/simulated/);
  });
  it("metadata, header, footer and landing use it", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toContain("BRAND.tagline");
    expect(layout).toContain("openGraph");
    expect(layout).toMatch(/template: `%s · \$\{BRAND\.name\}`/);
    expect(read("components/v3/Chrome.tsx")).toContain(">Agent D</span>");
    expect(read("components/v5/Footer.tsx")).toContain("BRAND.tagline");
    expect(read("components/v5/Footer.tsx")).toContain("BRAND.scope");
    const landing = read("components/v5/landing/Landing.tsx");
    expect(landing).toContain("Agent D, it always gets you the");
    expect(landing).toContain("BRAND.scope");
  });
  it("no public text still uses the old working name AgentDeal (comments may)", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = path.join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f)) {
          read(p)
            .split(/\r?\n/)
            .forEach((line, i) => {
              const code = line.trim();
              if (/^(\/\/|\/\*|\*)/.test(code)) return; // comments
              if (/Agent ?Deal/.test(line)) offenders.push(`${p}:${i + 1}: ${code.slice(0, 80)}`);
            });
        }
      }
    };
    for (const d of ["app", "components", "lib", "shared"]) walk(d);
    expect(offenders).toEqual([]);
  });
  it("uses AgentD in the technical identifiers", () => {
    expect(read("lib/v3/history.ts")).toContain('"agentd.v3.history"');
    expect(read("package.json")).toContain('"name": "agentd"');
  });
});
