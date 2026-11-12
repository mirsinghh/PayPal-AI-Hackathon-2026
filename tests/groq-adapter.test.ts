import { beforeEach, describe, expect, it } from "vitest";
import { GROQ_URL, ProviderGate, WIRE, gateFor, groqConfig, groqModelCaller, parseDurationMs, readRateHeaders, resetGroqGatesForTests, type Clock } from "@/server/ai/groq";
import { Agent, DeadlineError, ModelHttpError, RunBudget, ask, type ModelRequest } from "@/server/agents/model";
import { sellerReplySchema } from "@/server/agents/schemas";
import { validateSellerReply, type SellerContext } from "@/server/agents/validate";
import { SELLER_PROFILES, catalogItem } from "@/server/agents/catalog";

const KEY = "gsk_test_key_never_logged_123456";
const ENV = { GROQ_API_KEY: KEY };

const ok = (content: string, usage: Record<string, unknown> = { prompt_tokens: 120, completion_tokens: 30 }, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }], usage }), { status: 200, headers });
const err = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}
function mockFetch(...responses: Response[]) {
  const sent: Sent[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    sent.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    const r = responses.shift();
    if (!r) throw new Error("unexpected extra request");
    return r;
  }) as unknown as typeof fetch;
  return { impl, sent };
}
const req = (over: Partial<ModelRequest> = {}): ModelRequest => ({ system: "You are a seller. Reply with JSON.", history: [], user: '{"turn":"opening"}', maxOutputTokens: 450, role: "seller", wire: WIRE.sellerReply, ...over });

beforeEach(() => resetGroqGatesForTests());

describe("Groq configuration", () => {
  it("defaults to the 120B buyer and the 20B sellers, with low reasoning, strict schemas and no hard-coded quotas", () => {
    const c = groqConfig(ENV);
    expect(c.buyerModel).toBe("openai/gpt-oss-120b");
    expect(c.sellerModel).toBe("openai/gpt-oss-20b");
    expect(c.explanationModel).toBe("openai/gpt-oss-120b");
    expect([c.buyerEffort, c.sellerEffort, c.structured]).toEqual(["low", "low", "strict"]);
    expect([c.rpmLimit, c.tpmLimit]).toEqual([null, null]); // unknown until the provider's headers say otherwise
  });
  it("reads overrides, rejects malformed ids and out-of-range numbers", () => {
    const c = groqConfig({ ...ENV, GROQ_SELLER_MODEL: "openai/gpt-oss-20b ", GROQ_BUYER_MODEL: "bad model;rm", GROQ_BUYER_REASONING: "high", GROQ_MAX_CONCURRENCY: "99", GROQ_TPM_LIMIT: "8000", GROQ_STRUCTURED: "json_object" });
    expect(c.sellerModel).toBe("openai/gpt-oss-20b");
    expect(c.buyerModel).toBe("openai/gpt-oss-120b");
    expect(c.buyerEffort).toBe("high");
    expect(c.maxConcurrent).toBe(2);
    expect(c.tpmLimit).toBe(8000);
    expect(c.structured).toBe("json_object");
  });
  it("has no caller without a key (placeholder values count as no key)", () => {
    expect(groqModelCaller({ env: {} })).toBeNull();
    expect(groqModelCaller({ env: { GROQ_API_KEY: "your-groq-api-key" } })).toBeNull();
  });
});

describe("rate-limit header parsing", () => {
  it.each([
    ["2m59.56s", 179_560],
    ["7.66s", 7_660],
    ["120ms", 120],
    ["1h2m3s", 3_723_000],
    ["2", 2000],
    ["", null],
    ["soon", null],
  ])("%s -> %s", (raw, ms) => expect(parseDurationMs(raw)).toBe(ms));

  it("reads the documented headers (requests = daily, tokens = per minute)", () => {
    const h = new Headers({ "retry-after": "2", "x-ratelimit-remaining-tokens": "7500", "x-ratelimit-reset-tokens": "7.66s", "x-ratelimit-remaining-requests": "14370", "x-ratelimit-reset-requests": "2m59.56s", "x-ratelimit-limit-tokens": "8000" });
    expect(readRateHeaders(h)).toMatchObject({ retryAfterMs: 2000, remainingTokens: 7500, resetTokensMs: 7660, remainingRequests: 14370, resetRequestsMs: 179_560, limitTokens: 8000 });
  });
});

describe("Groq request and response", () => {
  it("sends role-specific models, strict JSON Schema, low reasoning and never the key in the body", async () => {
    const { impl, sent } = mockFetch(ok('{"action":"quote","priceCents":27000,"message":"Hello there"}'), ok('{"rationale":"ok","moves":[]}', { prompt_tokens: 500, completion_tokens: 90, completion_tokens_details: { reasoning_tokens: 40 } }));
    const call = groqModelCaller({ env: ENV, fetchImpl: impl })!;
    const seller = await call(req());
    const buyer = await call(req({ role: "buyer", wire: WIRE.buyerRound, maxOutputTokens: 800, history: [{ role: "user", text: "u1" }, { role: "model", text: "m1" }] }));

    expect(sent[0].url).toBe(GROQ_URL);
    expect(sent[0].headers.authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.stringify(sent[0].body)).not.toContain(KEY);
    expect(sent[0].body.model).toBe("openai/gpt-oss-20b");
    expect(sent[1].body.model).toBe("openai/gpt-oss-120b");
    expect(sent[0].body.response_format).toEqual({ type: "json_schema", json_schema: { name: "seller_reply", strict: true, schema: WIRE.sellerReply.schema } });
    expect(sent[0].body).toMatchObject({ reasoning_effort: "low", include_reasoning: false, max_completion_tokens: 950 });
    expect(sent[0].body).not.toHaveProperty("reasoning_format"); // gpt-oss rejects it
    expect(sent[0].body).not.toHaveProperty("max_tokens");
    expect((sent[1].body.messages as { role: string }[]).map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);

    expect(seller).toMatchObject({ provider: "groq", model: "openai/gpt-oss-20b", inputTokens: 120, outputTokens: 30, reasoningTokens: null });
    expect(buyer).toMatchObject({ provider: "groq", model: "openai/gpt-oss-120b", reasoningTokens: 40 }); // only when the provider reports it
  });

  it("uses plain JSON mode when no schema is given or when configured", async () => {
    const { impl, sent } = mockFetch(ok("{}"), ok("{}"));
    await groqModelCaller({ env: ENV, fetchImpl: impl })!(req({ wire: undefined }));
    await groqModelCaller({ env: { ...ENV, GROQ_STRUCTURED: "json_object" }, fetchImpl: impl })!(req());
    expect(sent.map((s) => s.body.response_format)).toEqual([{ type: "json_object" }, { type: "json_object" }]);
  });

  it("trims the oldest exchanges of the agent's own memory to respect the input budget", async () => {
    const { impl, sent } = mockFetch(ok("{}"));
    const big = "x".repeat(6000);
    const history = [
      { role: "user" as const, text: big },
      { role: "model" as const, text: big },
      { role: "user" as const, text: "recent" },
      { role: "model" as const, text: "recent reply" },
    ];
    await groqModelCaller({ env: { ...ENV, GROQ_MAX_INPUT_TOKENS: "1000" }, fetchImpl: impl })!(req({ history }));
    const roles = (sent[0].body.messages as { content: string }[]).map((m) => m.content);
    expect(roles).toContain("recent reply");
    expect(roles.some((c) => c === big)).toBe(false);
  });

  it("downgrades once from strict schema to JSON mode if Groq rejects the schema, and remembers it", async () => {
    const { impl, sent } = mockFetch(err(400, { error: { message: "response_format json_schema is not supported for this request" } }), ok("{}"), ok("{}"));
    const call = groqModelCaller({ env: ENV, fetchImpl: impl })!;
    await call(req());
    await call(req());
    expect(sent.map((s) => (s.body.response_format as { type: string }).type)).toEqual(["json_schema", "json_object", "json_object"]);
  });

  it("HTTP 400 'failed generation' gets ONE escalated retry (plain JSON, bigger budget) and records the recovery", async () => {
    const { impl, sent } = mockFetch(err(400, { error: { message: "Failed to generate JSON. Please adjust your prompt.", failed_generation: '{"action":"quote",' } }), ok('{"action":"quote","priceCents":26900,"message":"Fine."}'));
    const r = await groqModelCaller({ env: ENV, fetchImpl: impl })!(req());
    expect(sent).toHaveLength(2);
    expect((sent[0].body.response_format as { type: string }).type).toBe("json_schema");
    expect((sent[1].body.response_format as { type: string }).type).toBe("json_object");
    expect(Number(sent[1].body.max_completion_tokens)).toBeGreaterThan(Number(sent[0].body.max_completion_tokens));
    expect(r.note).toBe("recovered after one escalated retry");
  });

  it("a generation failure that persists is reported with Groq's own message and the failed output, after two requests at most", async () => {
    const { impl, sent } = mockFetch(err(400, { error: { message: "Failed to generate JSON", failed_generation: '{"oops":1}' } }), err(400, { error: { message: "Failed to generate JSON", failed_generation: '{"oops":2}' } }));
    const e = (await groqModelCaller({ env: ENV, fetchImpl: impl })!(req()).catch((x) => x)) as ModelHttpError;
    expect(sent).toHaveLength(2);
    expect([e.status, e.message]).toEqual([400, "groq_http_400"]);
    expect(e.detail).toMatch(/^generation failed: Failed to generate JSON/);
    expect(e.detail).toContain('failed_generation(10 chars): {"oops":2}');
    expect(String(e.detail)).not.toContain(KEY);
  });

  it("any other 400 is an invalid request: not transient, never retried, with the provider's message", async () => {
    const { impl, sent } = mockFetch(err(400, { error: { message: "Unknown parameter: 'foo'", type: "invalid_request_error" } }));
    const e = (await groqModelCaller({ env: ENV, fetchImpl: impl })!(req()).catch((x) => x)) as ModelHttpError;
    expect(sent).toHaveLength(1);
    expect(e.detail).toBe("invalid request: Unknown parameter: 'foo'");
  });

  it("an answer cut off at the completion cap (finish_reason length) is retried once with a larger budget", async () => {
    const cut = new Response(JSON.stringify({ choices: [{ message: { content: '{"rationale":"abc' }, finish_reason: "length" }], usage: { prompt_tokens: 900, completion_tokens: 1300 } }), { status: 200 });
    const { impl, sent } = mockFetch(cut, ok('{"rationale":"complete","moves":[]}'));
    const r = await groqModelCaller({ env: ENV, fetchImpl: impl })!(req({ role: "buyer", maxOutputTokens: 800, wire: WIRE.buyerRound }));
    expect(sent).toHaveLength(2);
    expect(sent[0].body.max_completion_tokens).toBe(1800); // buyer: 800 + 2 x 500 reasoning headroom
    expect(Number(sent[1].body.max_completion_tokens)).toBeGreaterThan(1800);
    expect(r.text).toBe('{"rationale":"complete","moves":[]}');
  });

  it("if the retry is cut off too, the partial text is returned flagged as truncated (the server then rejects it), never repaired", async () => {
    const cut = () => new Response(JSON.stringify({ choices: [{ message: { content: '{"rationale":"abc' }, finish_reason: "length" }], usage: { prompt_tokens: 900, completion_tokens: 1300 } }), { status: 200 });
    const { impl, sent } = mockFetch(cut(), cut());
    const r = await groqModelCaller({ env: ENV, fetchImpl: impl })!(req({ role: "buyer", maxOutputTokens: 800 }));
    expect(sent).toHaveLength(2);
    expect(r.text).toBe('{"rationale":"abc');
    expect(r.note).toMatch(/groq_truncated/);
  });

  it("a strict-schema configuration error downgrades once; an unsupported reasoning option is dropped once", async () => {
    const { impl, sent } = mockFetch(err(400, { error: { message: "include_reasoning is not supported for this request" } }), ok("{}"));
    await groqModelCaller({ env: ENV, fetchImpl: impl })!(req());
    expect(sent[0].body).toHaveProperty("include_reasoning");
    expect(sent[1].body).not.toHaveProperty("include_reasoning");
  });

  it("turns network failures into errors that never contain the key", async () => {
    const impl = (async () => {
      throw Object.assign(new Error(`connect failed for Bearer ${KEY}`), { name: "TypeError" });
    }) as unknown as typeof fetch;
    const e = await groqModelCaller({ env: ENV, fetchImpl: impl })!(req()).catch((x: Error) => x);
    expect((e as Error).message).toBe("groq_network");
    expect(String(e)).not.toContain(KEY);
  });

  it("raises HTTP errors with the provider label", async () => {
    const { impl } = mockFetch(err(503, { error: { message: "down" } }));
    const e = (await groqModelCaller({ env: ENV, fetchImpl: impl })!(req()).catch((x) => x)) as ModelHttpError;
    expect(e).toBeInstanceOf(ModelHttpError);
    expect([e.status, e.message]).toEqual([503, "groq_http_503"]);
  });
});

describe("HTTP 429", () => {
  it("honours retry-after, blocks the model's gate for that long, and never retries instantly", async () => {
    const { impl } = mockFetch(err(429, { error: { message: "rate limit" } }, { "retry-after": "7" }));
    const before = Date.now();
    const e = (await groqModelCaller({ env: ENV, fetchImpl: impl })!(req()).catch((x) => x)) as ModelHttpError;
    expect([e.status, e.retryAfterMs, e.message]).toEqual([429, 7000, "groq_http_429"]);
    expect(gateFor("openai/gpt-oss-20b", groqConfig(ENV)).blockedUntil).toBeGreaterThanOrEqual(before + 7000);
  });

  it("falls back to the token window's reset, then to a bounded default", async () => {
    const a = mockFetch(err(429, {}, { "x-ratelimit-reset-tokens": "7.66s" }), err(429, {}));
    const call = groqModelCaller({ env: ENV, fetchImpl: a.impl })!;
    expect(((await call(req()).catch((x) => x)) as ModelHttpError).retryAfterMs).toBe(7660);
    resetGroqGatesForTests();
    expect(((await call(req()).catch((x) => x)) as ModelHttpError).retryAfterMs).toBe(2000);
  });

  it("treats an exhausted daily request budget as a long wait (the engine then stops instead of looping)", async () => {
    const { impl } = mockFetch(err(429, {}, { "retry-after": "5", "x-ratelimit-remaining-requests": "0", "x-ratelimit-reset-requests": "2h" }));
    const e = (await groqModelCaller({ env: ENV, fetchImpl: impl })!(req()).catch((x) => x)) as ModelHttpError;
    expect(e.retryAfterMs).toBe(7_200_000);
  });

  it("is counted per run and per role, and a long 429 stops the run without hammering the provider", async () => {
    const item = catalogItem("nova", "headphones");
    const ctx = (): SellerContext => ({ item, profile: SELLER_PROFILES.nova, previousItemCents: null, targetItemCents: null, budgetCents: 40_000 });
    let calls = 0;
    const caller = async () => {
      calls++;
      throw new ModelHttpError(429, 3_600_000, "groq");
    };
    const budget = new RunBudget(Date.now(), Date.now, 16, 60_000);
    const r = await ask(new Agent("seller:nova", "sys", "seller"), caller, budget, "{}", sellerReplySchema, (v) => validateSellerReply(v, ctx()), WIRE.sellerReply);
    expect(r).toMatchObject({ ok: false, reason: "quota_exhausted" });
    expect(calls).toBe(1);
    expect(budget.http429).toBe(1);
    expect(budget.roles.seller.http429).toBe(1);
    expect(budget.quotaExhausted).toBe(true);
  });

  it("a short 429 is waited out within the deadline, then the retry succeeds", async () => {
    const item = catalogItem("nova", "headphones");
    const ctx = (): SellerContext => ({ item, profile: SELLER_PROFILES.nova, previousItemCents: null, targetItemCents: null, budgetCents: 40_000 });
    let n = 0;
    const caller = async () => {
      if (n++ === 0) throw new ModelHttpError(429, 20, "groq");
      return { text: JSON.stringify({ action: "quote", priceCents: 26_000, message: "Here is my best opening price." }), model: "openai/gpt-oss-20b", provider: "groq", inputTokens: 10, outputTokens: 5 };
    };
    const budget = new RunBudget(Date.now(), Date.now, 16, 60_000);
    const r = await ask(new Agent("seller:nova", "sys", "seller"), caller, budget, "{}", sellerReplySchema, (v) => validateSellerReply(v, ctx()));
    expect(r).toMatchObject({ ok: true, provider: "groq", attempts: 2 });
    expect(budget.http429).toBe(1);
    expect(budget.roles.seller).toMatchObject({ succeeded: 1, http429: 1, models: ["openai/gpt-oss-20b"], providers: ["groq"] });
  });
});

describe("pacing gate", () => {
  const virtual = (): Clock & { t: number } => {
    const c = { t: 1_000_000, now: () => c.t, sleep: async (ms: number) => void (c.t += ms) };
    return c;
  };

  it("never runs more requests at once than the configured concurrency", async () => {
    const gate = new ProviderGate({ maxConcurrent: 2, rpm: null, tpm: null });
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        const release = (await gate.acquire(100, Date.now() + 5000))!;
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 15));
        active--;
        release();
      }),
    );
    expect(peak).toBe(2);
  });

  it("waits for the token window the provider reports instead of sending a request that would hit a 429", async () => {
    const c = virtual();
    const gate = new ProviderGate({ maxConcurrent: 2, rpm: null, tpm: null }, c);
    gate.observe({ retryAfterMs: null, remainingRequests: null, remainingTokens: 500, resetRequestsMs: null, resetTokensMs: 8000, limitRequests: null, limitTokens: null }); // limit unknown: falls back to the reset time
    const t0 = c.t;
    const release = await gate.acquire(1500, t0 + 60_000);
    expect(release).not.toBeNull();
    expect(c.t - t0).toBeGreaterThanOrEqual(8000);
  });

  it("waits only until the refilling bucket holds what the request needs, not until it is full", async () => {
    const c = virtual();
    const gate = new ProviderGate({ maxConcurrent: 2, rpm: null, tpm: null }, c);
    // 1157 tokens left of 8000/min, the header says "52 s to full": a 1400-token request needs ~1.8 s of refill, not 52 s.
    gate.observe({ retryAfterMs: null, remainingRequests: null, remainingTokens: 1157, resetRequestsMs: null, resetTokensMs: 52_000, limitRequests: null, limitTokens: 8000 });
    const t0 = c.t;
    expect(await gate.acquire(1400, t0 + 60_000)).not.toBeNull();
    expect(c.t - t0).toBeGreaterThan(1500);
    expect(c.t - t0).toBeLessThan(3000);
    expect(gate.waits).toBe(1);
  });

  it("gives up (null) when the wait would exceed the run deadline", async () => {
    const c = virtual();
    const gate = new ProviderGate({ maxConcurrent: 2, rpm: null, tpm: null }, c);
    gate.penalize(30_000);
    expect(await gate.acquire(100, c.t + 5_000)).toBeNull();
  });

  it("applies user-declared RPM and TPM limits when the user knows their plan", async () => {
    const c = virtual();
    const rpm = new ProviderGate({ maxConcurrent: 8, rpm: 2, tpm: null }, c);
    const t0 = c.t;
    for (let i = 0; i < 3; i++) (await rpm.acquire(10, t0 + 300_000))!();
    expect(c.t - t0).toBeGreaterThanOrEqual(60_000);

    const tpm = new ProviderGate({ maxConcurrent: 8, rpm: null, tpm: 1000 }, c);
    const t1 = c.t;
    (await tpm.acquire(700, t1 + 300_000))!();
    (await tpm.acquire(700, t1 + 300_000))!();
    expect(c.t - t1).toBeGreaterThanOrEqual(60_000);
  });

  it("the caller reports a DeadlineError (not a provider failure) when pacing cannot fit the deadline", async () => {
    const { impl } = mockFetch(ok("{}"));
    const call = groqModelCaller({ env: ENV, fetchImpl: impl })!;
    gateFor("openai/gpt-oss-20b", groqConfig(ENV)).penalize(60_000);
    await expect(call(req({ deadlineAt: Date.now() + 1000 }))).rejects.toBeInstanceOf(DeadlineError);
  });
});
