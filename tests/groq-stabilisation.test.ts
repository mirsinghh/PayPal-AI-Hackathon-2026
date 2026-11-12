import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getSession, saveSession } from "@/server/db/store";
import { resetRunSlotsForTests } from "@/server/agents/config";
import { Agent, RunBudget, ask, type ModelCaller, type ModelRequest } from "@/server/agents/model";
import { fallbackCause, runMultiAgentNegotiation } from "@/server/agents/run";
import { validateBuyerFinal } from "@/server/agents/validate";
import { SELLER_PROFILES, catalogItem } from "@/server/agents/catalog";
import { STORE_NAMES, buyerRoundByStoreSchema, buyerRoundSchema } from "@/server/agents/schemas";
import { startNegotiation } from "@/server/negotiation/service";
import { WIRE, resetGroqGatesForTests } from "@/server/ai/groq";
import { analysisLabel } from "@/lib/v4/provider";
import { SELLER_BRANDS } from "@/shared/sellers";
import type { ProductIntent } from "@/shared/contracts/types";

// Reproduces, with mocks only, the failures seen in the first real Groq negotiation (session ses_7a99ae93...).
const intent: ProductIntent = { productQuery: "Wireless noise-cancelling headphones", budgetCents: 35_000, currency: "EUR", priority: "best_value", preferences: ["warranty"], language: "en" };
const ENGINE = { provider: "groq", buyerModel: "openai/gpt-oss-120b", sellerModel: "openai/gpt-oss-20b", explanationModel: "openai/gpt-oss-120b" };

interface Row { store: string; offerId: string; itemPriceCents: number; itemPrice: string; total: string; withinBudget: boolean }
interface Prompt { turn?: string; yourListPriceCents?: number; yourCurrentItemPriceCents?: number; offers?: Row[] }
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
      const best = u!.offers!.filter((o) => o.withinBudget).sort((a, b) => a.total.localeCompare(b.total, "en", { numeric: true }))[0];
      text = JSON.stringify({ chosenOfferId: (u as unknown as { serverRecommendedOfferId?: string }).serverRecommendedOfferId ?? best.offerId, summary: `Best value for you at ${best.total} all-in.`, reasons: ["A good balance of price and delivery."], tradeoffs: [] });
    }
    return { text, model: role === "seller" ? "openai/gpt-oss-20b" : "openai/gpt-oss-120b", provider: "groq", inputTokens: 100, outputTokens: 40, reasoningTokens: null };
  };
  return { caller, seen };
}

async function run(caller: ModelCaller, maxModelCalls?: number) {
  vi.stubEnv("MULTI_AGENT_NEGOTIATION", "true");
  const { session } = await startNegotiation(intent, { caller });
  await saveSession(session);
  await runMultiAgentNegotiation(session.sessionId, intent, "headphones", caller, { engine: ENGINE, maxModelCalls });
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

describe("public store names", () => {
  it("maps brand names back to internal ids from the canonical seller table, and still accepts legacy ids", () => {
    expect(STORE_NAMES).toEqual(["Brisa Outlet", "Zefiro Express", "Atelier Norden", "Korvan Direct"]);
    const out = buyerRoundByStoreSchema.parse({
      rationale: "Pressing for a better price.",
      moves: [
        { store: "Zefiro Express", action: "counter", targetPriceCents: 30_000, message: "Faster delivery elsewhere." },
        { sellerId: "prism", action: "pass", targetPriceCents: null, message: "" },
      ],
    });
    expect(out.moves.map((m) => m.sellerId)).toEqual(["orbit", "prism"]);
    expect(() => buyerRoundByStoreSchema.parse({ rationale: "ok then", moves: [{ store: "Nova", action: "pass", targetPriceCents: null, message: "" }] })).toThrow();
    expect(() => buyerRoundByStoreSchema.parse({ rationale: "ok then", moves: [{ action: "pass", targetPriceCents: null, message: "" }] })).toThrow();
  });

  it("never puts internal ids in Agent D's prompts, and the brand-addressed moves reach the right sellers", async () => {
    const { caller, seen } = groqFake();
    const s = await run(caller);
    const buyerText = seen.filter((r) => r.role === "buyer").map((r) => r.system + r.user + r.history.map((t) => t.text).join("")).join("\n");
    expect(buyerText).not.toMatch(/\b(nova|orbit|prism|vertex)\b/i);
    for (const b of Object.values(SELLER_BRANDS)) expect(buyerText).toContain(b.brand);
    const asks = s.events.filter((e) => e.type === "BUYER_MESSAGE");
    expect(asks.length).toBeGreaterThan(0);
    expect(asks.every((e) => !!e.sellerId)).toBe(true);
  });
});

describe("structured-output schemas", () => {
  const allowed = new Set(["type", "enum", "properties", "required", "additionalProperties", "items", "description"]);
  const walk = (n: unknown, path: string): string[] => {
    if (!n || typeof n !== "object") return [];
    const o = n as Record<string, unknown>;
    const problems: string[] = [];
    for (const k of Object.keys(o)) if (!allowed.has(k)) problems.push(`${path}: keyword ${k}`);
    if (o.type === "object") {
      const props = Object.keys((o.properties ?? {}) as object);
      if (o.additionalProperties !== false) problems.push(`${path}: additionalProperties must be false`);
      if (JSON.stringify([...(o.required as string[])].sort()) !== JSON.stringify([...props].sort())) problems.push(`${path}: every property must be required`);
      for (const [k, v] of Object.entries((o.properties ?? {}) as object)) problems.push(...walk(v, `${path}.${k}`));
    }
    if (o.items) problems.push(...walk(o.items, `${path}[]`));
    return problems;
  };

  it.each(Object.entries(WIRE))("%s follows Groq's strict-mode rules (all required, no extra properties, plain keywords)", (_n, w) => {
    expect(walk(w.schema, w.name)).toEqual([]);
  });

  it("what the strict schema allows is what the server contract accepts (names, nullable target, enums)", () => {
    expect(Object.keys(WIRE.sellerReply.schema.properties)).toEqual(["action", "priceCents", "message"]);
    const props = WIRE.buyerRound.schema.properties.moves.items.properties;
    expect(Object.keys(props)).toEqual(["store", "action", "targetPriceCents", "message"]);
    expect(props.store.enum).toEqual(STORE_NAMES);
    expect(props.targetPriceCents.type).toEqual(["integer", "null"]);
    expect(buyerRoundSchema.safeParse({ rationale: "fine reason", moves: [{ sellerId: "nova", action: "pass", targetPriceCents: null, message: "" }] }).success).toBe(true);
  });

  it("the real rationale failure: too long is rejected with its detail, corrected once, and never silently trimmed", async () => {
    const replies = [JSON.stringify({ rationale: "A".repeat(340), moves: [] }), JSON.stringify({ rationale: "Short and clear.", moves: [] })];
    const prompts: string[] = [];
    const caller: ModelCaller = async (req) => {
      prompts.push(req.user);
      return { text: replies.shift()!, model: "openai/gpt-oss-120b", provider: "groq", inputTokens: 5, outputTokens: 5 };
    };
    const budget = new RunBudget(Date.now(), Date.now, 24, 60_000);
    const r = await ask(new Agent("buyer", "sys", "buyer"), caller, budget, "{}", buyerRoundByStoreSchema, () => null, { wire: WIRE.buyerRound, hint: () => "Keep rationale under 200 characters." });
    expect(r).toMatchObject({ ok: true, attempts: 2, rejections: ["schema_invalid:rationale"] });
    expect(r.details[0]).toMatch(/rationale: too_big, at most 300/);
    expect(prompts[1]).toMatch(/Detail: rationale: too_big, at most 300/);
    expect(prompts[1]).toContain("under 200 characters");
    expect((r as { value: { rationale: string } }).value.rationale).toBe("Short and clear.");
  });
});

describe("call budget", () => {
  it("reserves the last calls for the final decision", () => {
    const b = new RunBudget(Date.now(), Date.now, 24, 60_000);
    b.attempted = 22;
    expect(b.stopReason(2)).toBe("call_cap");
    expect(b.stopReason(0)).toBeNull();
    b.attempted = 24;
    expect(b.stopReason(0)).toBe("call_cap");
  });

  it("still completes Agent D's final decision with the AI when rejections burn the round budget", async () => {
    const { caller } = groqFake((req) => (req.role === "seller" && String(parse(req)?.turn).startsWith("round_") ? JSON.stringify({ action: "concede", priceCents: 100, message: "Too cheap to be true." }) : null));
    const s = await run(caller, 12);
    expect(s.evaluation).toMatchObject({ source: "llm", provider: "groq", modelName: "openai/gpt-oss-120b" });
    expect(s.agentRun!.llmCallsAttempted).toBeLessThanOrEqual(12);
    expect(s.agentRun!.fallbackCauses).toMatchObject({ policy_rejected: expect.any(Number) });
    for (const o of s.offers) expect(o.catalog!.itemPriceCents).toBeGreaterThanOrEqual(catalogItem(o.sellerId, "headphones").minPriceCents);
  });
});

describe("recovery and fallback causes", () => {
  const fail = (reason: string, rejections: string[]) => ({ ok: false as const, reason, attempts: 1, rejections, details: [] });
  it("names the real cause of every fallback", () => {
    expect(fallbackCause(fail("call_failed", ["call_failed:groq_http_429", "call_failed:groq_http_429"]))).toBe("http_429");
    expect(fallbackCause(fail("model_unavailable", ["call_failed:groq_http_429"]))).toBe("http_429");
    expect(fallbackCause(fail("call_failed", ["call_failed:groq_timeout"]))).toBe("timeout");
    expect(fallbackCause(fail("call_failed", ["call_failed:groq_http_503"]))).toBe("provider_error");
    expect(fallbackCause(fail("call_failed", ["call_failed:groq_network"]))).toBe("provider_error");
    expect(fallbackCause(fail("invalid_output", ["schema_invalid:rationale", "schema_invalid:rationale"]))).toBe("invalid_structure");
    expect(fallbackCause(fail("invalid_output", ["not_json"]))).toBe("invalid_structure");
    expect(fallbackCause(fail("invalid_output", ["price_below_floor", "price_below_floor"]))).toBe("policy_rejected");
    expect(fallbackCause(fail("call_cap", []))).toBe("call_budget");
    expect(fallbackCause(fail("deadline", []))).toBe("deadline");
    expect(fallbackCause(fail("quota_exhausted", ["call_failed:groq_http_429"]))).toBe("quota_exhausted");
  });

  it("corrects a below-reserve seller once, with the exact window in the correction, and no fallback", async () => {
    const item = catalogItem("nova", "headphones");
    let bad = 0;
    const users: string[] = [];
    const { caller } = groqFake((req) => {
      if (req.role === "seller" && /Bargain Hunter/.test(req.system) && parse(req)?.turn === "opening") {
        users.push(req.user);
        if (bad++ === 0) return JSON.stringify({ action: "quote", priceCents: item.minPriceCents - 1, message: "Unbeatable price today." });
      }
      return null;
    });
    const s = await run(caller);
    expect(users).toHaveLength(2);
    expect(users[1]).toContain(`between ${item.minPriceCents} and ${item.listPriceCents}`);
    expect(s.events.some((e) => e.type === "AGENT_FALLBACK" && e.sellerId === "nova")).toBe(false);
    expect(s.events.filter((e) => e.type === "OFFER_REJECTED_BY_SERVER" && e.sellerId === "nova")).toHaveLength(1);
  });

  it("records the cause on the fallback event and in the run summary", async () => {
    const { caller } = groqFake((req) => (req.role === "seller" && /Tough Negotiator/.test(req.system) ? new Error("groq_timeout") : null));
    const s = await run(caller);
    const fb = s.events.filter((e) => e.type === "AGENT_FALLBACK" && e.sellerId === "vertex");
    expect(fb.length).toBeGreaterThan(0);
    expect(fb.every((e) => e.payload.cause === "timeout" && e.payload.source === "rules_fallback")).toBe(true);
    expect(fb[0].feedText).toContain("timeout");
    expect(s.agentRun!.fallbackCauses!.timeout).toBeGreaterThan(0);
  });
});

describe("final explanation: claims must be true", () => {
  const SID: Record<string, string> = { a: "nova", b: "orbit", c: "prism", d: "vertex" };
  const mk = (id: string, finalPriceCents: number, deliveryDays: number, warrantyMonths: number, eligible = true) =>
    ({ offerId: id, sellerId: SID[id], finalPriceCents, initialPriceCents: finalPriceCents, discountCents: 0, deliveryDays, warrantyMonths, eligible, catalog: { itemPriceCents: finalPriceCents, shippingCents: 0 } }) as never;
  const offers = [mk("a", 25_490, 6, 12), mk("b", 29_900, 1, 12), mk("c", 33_200, 4, 36), mk("d", 36_390, 3, 24, false)];
  const fin = (summary: string, reasons: string[] = ["Good balance."], tradeoffs: string[] = []) => ({ chosenOfferId: "b", summary, reasons, tradeoffs });

  it("rejects the false claim seen in the first Groq run (lowest total for a pricier offer)", () => {
    expect(validateBuyerFinal(fin("Zefiro offers the lowest total (€299.00) with next-day delivery."), offers, 35_000)).toBe("unsupported_claim:lowest_price");
    expect(validateBuyerFinal(fin("Good value.", ["Lowest total price among offers"]), offers, 35_000)).toBe("unsupported_claim:lowest_price");
    expect(validateBuyerFinal(fin("Good value.", ["Longest warranty of all."]), offers, 35_000)).toBe("unsupported_claim:longest_warranty");
  });
  it("accepts true claims and honest trade-offs (an ineligible cheaper offer does not count)", () => {
    expect(validateBuyerFinal(fin("Zefiro has the fastest delivery (1 day) at €299.00.", ["Fastest delivery among eligible offers."], ["Shorter warranty than Atelier Norden."]), offers, 35_000)).toBeNull();
    const only = [mk("a", 25_490, 6, 12, false), mk("b", 29_900, 1, 12), mk("c", 33_200, 4, 36)];
    expect(validateBuyerFinal(fin("Cheapest option you can buy."), only, 35_000)).toBeNull();
    expect(validateBuyerFinal({ ...fin("Fastest."), chosenOfferId: "c" }, offers, 35_000)).toBe("unsupported_claim:fastest_delivery");
  });
  it("still refuses ineligible or unknown offers and ungrounded amounts first", () => {
    expect(validateBuyerFinal({ ...fin("x is fine."), chosenOfferId: "d" }, offers, 35_000)).toBe("chosen_offer_not_eligible");
    expect(validateBuyerFinal({ ...fin("x is fine."), chosenOfferId: "zz" }, offers, 35_000)).toBe("unknown_offer");
    expect(validateBuyerFinal(fin("A great €123.45 deal."), offers, 35_000)).toBe("ungrounded_amount");
  });
});

describe("provider notes", () => {
  it("a failed structured generation from Groq is kept as a rejection detail with the provider's note", async () => {
    const caller: ModelCaller = async () => ({ text: "{}", model: "openai/gpt-oss-120b", provider: "groq", inputTokens: 1, outputTokens: 1, note: "groq_400 generation failed: max completion tokens reached" });
    const r = await ask(new Agent("buyer", "sys", "buyer"), caller, new RunBudget(Date.now(), Date.now, 24, 60_000), "{}", buyerRoundByStoreSchema, () => null, { wire: WIRE.buyerRound });
    expect(r.ok).toBe(false);
    expect(r.details.some((d) => d.includes("groq_400 generation failed"))).toBe(true);
    expect(fallbackCause(r)).toBe("provider_generation_failed");
  });
});

describe("final decision and explanation label", () => {
  it("labels the explanation by its real origin", () => {
    expect(analysisLabel({ source: "llm", modelName: "openai/gpt-oss-120b", provider: "groq" })).toBe("AI analysis · Groq · GPT-OSS 120B");
    expect(analysisLabel({ source: "llm", modelName: "gemini-3.5-flash", provider: "gemini" })).toBe("AI analysis · Gemini");
    expect(analysisLabel({ source: "llm", modelName: "gemini-3.5-flash" })).toBe("AI analysis · Gemini");
    expect(analysisLabel({ source: "rules_fallback", modelName: null, provider: "groq" })).toBe("Rules-based analysis");
  });

  it("refuses an invalid choice from the model: the server keeps authority and the explanation falls back to rules", async () => {
    const { caller } = groqFake((req) => (req.role === "buyer" && parse(req)?.turn === "final_decision" ? JSON.stringify({ chosenOfferId: "off_does_not_exist", summary: "I pick the one I like best.", reasons: ["Because."], tradeoffs: [] }) : null));
    const s = await run(caller);
    expect(s.evaluation.source).toBe("rules_fallback");
    expect(s.evaluation.provider ?? null).toBeNull();
    expect(s.offers.find((o) => o.offerId === s.recommendedOfferId)!.eligible).toBe(true);
    expect(s.events.some((e) => e.type === "AGENT_FALLBACK" && e.payload.agent === "buyer" && e.payload.cause === "policy_rejected")).toBe(true);
    expect(SELLER_PROFILES.nova.maxConcessionPerRoundBps).toBe(600); // economic policy untouched
  });
});
