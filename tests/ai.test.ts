import { afterEach, describe, expect, it, vi } from "vitest";
import { explain, extractJson, geminiCaller, type LlmCaller } from "@/server/ai/explain";
import { buildScenario } from "@/server/negotiation/scenario";
import { rankOffers } from "@/server/negotiation/ranking";
import { formatEur } from "@/server/negotiation/intent";
import type { ProductIntent } from "@/shared/contracts/types";

const intent: ProductIntent = {
  productQuery: "Laptop for work",
  budgetCents: 120_000,
  currency: "EUR",
  priority: "fast_delivery",
  preferences: [],
  language: "en",
};
const offers = buildScenario("ses", intent, { seed: 5 });
const ranking = rankOffers(offers, intent.priority);
const winner = offers.find((o) => o.offerId === ranking.recommendedOfferId)!;

const good = (over: object = {}): LlmCaller => async () => ({
  model: "test-model",
  text: JSON.stringify({
    summary: `Delivers in ${winner.deliveryDays} days for ${formatEur(winner.finalPriceCents)}.`,
    reasons: ["Fast delivery matches your priority."],
    tradeoffs: [],
    references: [winner.offerId],
    ...over,
  }),
});

describe("AI explanation guardrails", () => {
  it("accepts a grounded LLM answer and records the model", async () => {
    const r = await explain(intent, offers, ranking, good());
    expect(r.aiStatus).toBe("succeeded");
    expect(r.evaluation.source).toBe("llm");
    expect(r.evaluation.modelName).toBe("test-model");
  });
  it("tolerates code fences", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("falls back when the model invents a price", async () => {
    const r = await explain(intent, offers, ranking, good({ summary: "Only €1.23 for this laptop today." }));
    expect(r.aiStatus).toBe("fallback");
    expect(r.evaluation.source).toBe("rules_fallback");
    expect(r.evaluation.modelName).toBeNull();
  });
  it("falls back when the model references an unknown offer (QA-04c)", async () => {
    const r = await explain(intent, offers, ranking, good({ references: ["off_nope"] }));
    expect(r.aiStatus).toBe("fallback");
  });
  it("falls back when the model does not back the server's winner", async () => {
    const other = offers.find((o) => o.offerId !== winner.offerId)!;
    const r = await explain(intent, offers, ranking, good({ references: [other.offerId] }));
    expect(r.aiStatus).toBe("fallback");
    expect(r.evaluation.recommendedOfferId).toBe(winner.offerId);
  });
  it("falls back on garbage, errors, or no key, and never changes the winner", async () => {
    for (const c of [
      async () => ({ model: "m", text: "not json" }),
      async () => {
        throw new Error("timeout");
      },
      null,
    ] as (LlmCaller | null)[]) {
      const r = await explain(intent, offers, ranking, c);
      expect(r.aiStatus).toBe("fallback");
      expect(r.evaluation.recommendedOfferId).toBe(winner.offerId);
    }
  });
  it("retries once before falling back", async () => {
    let n = 0;
    const flaky: LlmCaller = async (s, u) => {
      if (n++ === 0) throw new Error("boom");
      return good()(s, u);
    };
    const r = await explain(intent, offers, ranking, flaky);
    expect(r.aiStatus).toBe("succeeded");
    expect(n).toBe(2);
  });
});

describe("geminiCaller", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is disabled without a real key", () => {
    vi.stubEnv("AI_API_KEY", "");
    expect(geminiCaller()).toBeNull();
    vi.stubEnv("AI_API_KEY", "your-gemini-api-key");
    expect(geminiCaller()).toBeNull();
  });

  it("sends the key in a header, never in the URL, and returns the text", async () => {
    vi.stubEnv("AI_API_KEY", "secret-key");
    let seen: { url: string; init: RequestInit } | undefined;
    const fetchMock = vi.fn(
      async (url: string, init: RequestInit) => {
        seen = { url, init };
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }), { status: 200 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await geminiCaller()!("sys", "user");
    expect(out.text).toBe('{"ok":true}');
    expect(seen!.url).not.toContain("secret-key");
    expect((seen!.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret-key");
  });

  it("falls back to rules when Gemini answers 429", async () => {
    vi.stubEnv("AI_API_KEY", "secret-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("quota", { status: 429 })));
    const r = await explain(intent, offers, ranking, geminiCaller());
    expect(r.aiStatus).toBe("fallback");
    expect(r.evaluation.source).toBe("rules_fallback");
  });
});
