import { SELLER_BRANDS } from "@/shared/sellers";
import { SELLER_IDS } from "@/shared/contracts/types";
import { limitScopeFromMessage } from "@/server/ai/limits";
import { DeadlineError, ModelHttpError, type AgentRole, type ModelCaller, type ModelRequest, type ModelResponse } from "@/server/agents/model";

/**
 * Groq adapter (OpenAI-compatible chat completions).
 * Verified against console.groq.com/docs (Nov 2026): models `openai/gpt-oss-120b` and `openai/gpt-oss-20b` (production),
 * Structured Outputs with `strict` on both, `reasoning_effort` low|medium|high, `include_reasoning`, 429 + `retry-after`
 * and `x-ratelimit-*` headers (requests = per day, tokens = per minute). `reasoning_format` is NOT sent: gpt-oss rejects it.
 *
 * Quotas are NOT hard-coded. The pacing gate learns the effective limits of the account from the response headers and
 * honours `retry-after`; optional env overrides exist for cases where you know your plan (GROQ_RPM_LIMIT / GROQ_TPM_LIMIT).
 * The API key goes in a header only and never appears in logs or errors.
 */
export const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export type StructuredMode = "strict" | "json_object";
export type ReasoningEffort = "low" | "medium" | "high";

export interface GroqConfig {
  apiKey: string | null;
  buyerModel: string;
  sellerModel: string;
  explanationModel: string;
  buyerEffort: ReasoningEffort;
  sellerEffort: ReasoningEffort;
  structured: StructuredMode;
  maxConcurrent: number;
  /** Optional user-declared limits. null = unknown: rely on the provider's headers. */
  rpmLimit: number | null;
  tpmLimit: number | null;
  /** Extra completion tokens reserved for reasoning (reasoning tokens count against max_completion_tokens). */
  reasoningHeadroom: number;
  /** Prompt budget per request; the oldest exchanges of the agent's own memory are dropped beyond it. */
  maxInputTokens: number;
  timeoutMs: number;
}

const MODEL_RE = /^[A-Za-z0-9][\w./:-]{2,80}$/;
const model = (v: string | undefined, dflt: string) => (v && MODEL_RE.test(v.trim()) ? v.trim() : dflt);
const effort = (v: string | undefined): ReasoningEffort => (v === "medium" || v === "high" ? v : "low");
const intIn = (v: string | undefined, lo: number, hi: number): number | null => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isInteger(n) && n >= lo && n <= hi ? n : null;
};

export function groqConfig(env: Record<string, string | undefined> = process.env): GroqConfig {
  const key = env.GROQ_API_KEY?.trim();
  return {
    apiKey: key && !/^your-/i.test(key) ? key : null,
    buyerModel: model(env.GROQ_BUYER_MODEL, "openai/gpt-oss-120b"),
    sellerModel: model(env.GROQ_SELLER_MODEL, "openai/gpt-oss-20b"),
    explanationModel: model(env.GROQ_EXPLANATION_MODEL, "openai/gpt-oss-120b"),
    buyerEffort: effort(env.GROQ_BUYER_REASONING),
    sellerEffort: effort(env.GROQ_SELLER_REASONING),
    structured: env.GROQ_STRUCTURED === "json_object" ? "json_object" : "strict",
    maxConcurrent: intIn(env.GROQ_MAX_CONCURRENCY, 1, 8) ?? 2,
    rpmLimit: intIn(env.GROQ_RPM_LIMIT, 1, 100_000),
    tpmLimit: intIn(env.GROQ_TPM_LIMIT, 500, 100_000_000),
    reasoningHeadroom: intIn(env.GROQ_REASONING_HEADROOM, 0, 8000) ?? 500,
    maxInputTokens: intIn(env.GROQ_MAX_INPUT_TOKENS, 500, 100_000) ?? 3000,
    timeoutMs: intIn(env.GROQ_TIMEOUT_MS, 3000, 120_000) ?? 40_000,
  };
}

export const modelForRole = (cfg: GroqConfig, role: AgentRole): string => (role === "buyer" ? cfg.buyerModel : role === "explanation" ? cfg.explanationModel : cfg.sellerModel);

/* ---------- helpers ---------- */

/** "2m59.56s", "7.66s", "120ms", "1h2m3s", "2" (seconds) -> milliseconds. null when unparseable. */
export function parseDurationMs(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 1000);
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  let total = 0;
  let any = false;
  for (const m of s.matchAll(re)) {
    any = true;
    const v = Number(m[1]);
    total += m[2] === "ms" ? v : m[2] === "s" ? v * 1000 : m[2] === "m" ? v * 60_000 : v * 3_600_000;
  }
  return any ? Math.round(total) : null;
}

/** Rough token estimate (chars/3.2) used only to pace requests; real usage comes back from the provider. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 3.2);

export interface RateHeaders {
  retryAfterMs: number | null;
  remainingRequests: number | null;
  remainingTokens: number | null;
  resetRequestsMs: number | null;
  resetTokensMs: number | null;
  limitRequests: number | null;
  limitTokens: number | null;
}

export function readRateHeaders(h: { get(name: string): string | null }): RateHeaders {
  const n = (k: string) => {
    const v = h.get(k);
    const x = v === null ? NaN : Number(v);
    return Number.isFinite(x) ? x : null;
  };
  return {
    retryAfterMs: parseDurationMs(h.get("retry-after")),
    remainingRequests: n("x-ratelimit-remaining-requests"),
    remainingTokens: n("x-ratelimit-remaining-tokens"),
    resetRequestsMs: parseDurationMs(h.get("x-ratelimit-reset-requests")),
    resetTokensMs: parseDurationMs(h.get("x-ratelimit-reset-tokens")),
    limitRequests: n("x-ratelimit-limit-requests"),
    limitTokens: n("x-ratelimit-limit-tokens"),
  };
}

/* ---------- pacing gate (one per model: limits are per organization and per model) ---------- */

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}
const realClock: Clock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

export class ProviderGate {
  private chain: Promise<unknown> = Promise.resolve();
  private active = 0;
  private waiters: (() => void)[] = [];
  private reqStamps: number[] = [];
  private tokStamps: { t: number; n: number }[] = [];
  /** Learned from headers: tokens left in the current minute window / requests left in the current day window. */
  remainingTokens: number | null = null;
  tokensResetAt = 0;
  /** When `remainingTokens` was read, and the per-minute token limit (x-ratelimit-limit-tokens) the bucket refills toward. */
  tokensObservedAt = 0;
  tokenLimit: number | null = null;
  remainingRequests: number | null = null;
  requestsResetAt = 0;
  blockedUntil = 0;
  /** Pacing diagnostics: how often and how long requests waited for the provider's limits. */
  waits = 0;
  waitedMs = 0;

  constructor(
    readonly opts: { maxConcurrent: number; rpm: number | null; tpm: number | null },
    private readonly clock: Clock = realClock,
  ) {}

  /** Resolves to a release function, or null when the request cannot be served before `deadlineAt`. */
  acquire(estTokens: number, deadlineAt: number): Promise<(() => void) | null> {
    const run = this.chain.then(async () => {
      for (;;) {
        const t = this.clock.now();
        let wait = Math.max(0, this.blockedUntil - t);
        if (this.remainingTokens !== null && t < this.tokensResetAt) {
          // The token bucket refills continuously (limit per minute). Wait only until it holds what this request needs,
          // not until it is completely full (the reset header measures the time to full: ~50 s from near-empty).
          const perMs = this.tokenLimit ? this.tokenLimit / 60_000 : 0;
          const need = this.tokenLimit ? Math.min(estTokens, this.tokenLimit) : estTokens;
          const have = perMs ? Math.min(this.tokenLimit as number, this.remainingTokens + perMs * (t - this.tokensObservedAt)) : this.remainingTokens;
          if (need > have) wait = Math.max(wait, perMs ? Math.min(Math.ceil((need - have) / perMs) + 100, this.tokensResetAt - t + 50) : this.tokensResetAt - t + 50);
        }
        if (this.opts.rpm) {
          this.reqStamps = this.reqStamps.filter((s) => t - s < 60_000);
          if (this.reqStamps.length >= this.opts.rpm) wait = Math.max(wait, this.reqStamps[0] + 60_000 - t + 50);
        }
        if (this.opts.tpm) {
          this.tokStamps = this.tokStamps.filter((s) => t - s.t < 60_000);
          const used = this.tokStamps.reduce((a, s) => a + s.n, 0);
          if (used + estTokens > this.opts.tpm && this.tokStamps.length > 0) wait = Math.max(wait, this.tokStamps[0].t + 60_000 - t + 50);
        }
        if (wait <= 0) break;
        if (t + wait > deadlineAt) return null;
        this.waits++;
        this.waitedMs += wait;
        await this.clock.sleep(wait);
      }
      if (!(await this.takeSlot(deadlineAt))) return null;
      const t = this.clock.now();
      if (this.opts.rpm) this.reqStamps.push(t);
      if (this.opts.tpm) this.tokStamps.push({ t, n: estTokens });
      if (this.remainingTokens !== null) this.remainingTokens = Math.max(0, this.remainingTokens - estTokens); // optimistic until the next headers
      let released = false;
      return () => {
        if (released) return;
        released = true;
        this.active--;
        this.waiters.shift()?.();
      };
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  private takeSlot(deadlineAt: number): Promise<boolean> {
    if (this.active < this.opts.maxConcurrent) {
      this.active++;
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      let done = false;
      const wake = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.active++;
        resolve(true);
      };
      const timer = setTimeout(
        () => {
          if (done) return;
          done = true;
          this.waiters = this.waiters.filter((w) => w !== wake);
          resolve(false);
        },
        Math.max(0, deadlineAt - this.clock.now()),
      );
      this.waiters.push(wake);
    });
  }

  /** Update from a response's rate-limit headers (success or 429). */
  observe(h: RateHeaders) {
    const t = this.clock.now();
    if (h.remainingTokens !== null) {
      this.remainingTokens = h.remainingTokens;
      this.tokensResetAt = t + (h.resetTokensMs ?? 60_000);
      this.tokensObservedAt = t;
      if (h.limitTokens !== null) this.tokenLimit = h.limitTokens;
    }
    if (h.remainingRequests !== null) {
      this.remainingRequests = h.remainingRequests;
      this.requestsResetAt = t + (h.resetRequestsMs ?? 0);
    }
  }

  /** A 429: nothing goes out before the provider's own retry hint has elapsed. */
  penalize(ms: number) {
    this.blockedUntil = Math.max(this.blockedUntil, this.clock.now() + ms);
  }
}

const gates = new Map<string, ProviderGate>();
/** Gates are process-wide: the provider's limits are shared by every negotiation running on this instance. */
export function gateFor(modelId: string, cfg: GroqConfig): ProviderGate {
  let g = gates.get(modelId);
  if (!g) gates.set(modelId, (g = new ProviderGate({ maxConcurrent: cfg.maxConcurrent, rpm: cfg.rpmLimit, tpm: cfg.tpmLimit })));
  return g;
}
export function resetGroqGatesForTests() {
  gates.clear();
  structuredDowngraded = false;
  reasoningParamDisabled = false;
}

/* ---------- the caller ---------- */

// If Groq rejects a request option once, stop sending it for this process instead of failing every call.
let structuredDowngraded = false;
let reasoningParamDisabled = false;

interface ChatCompletion {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
}

function buildMessages(req: ModelRequest, maxInputTokens: number) {
  const history = [...req.history];
  const size = () => estimateTokens(req.system + req.user + history.map((t) => t.text).join(""));
  // Keep the agent's own recent exchanges; drop the oldest pairs when the prompt would exceed the budget.
  while (history.length >= 2 && size() > maxInputTokens) history.splice(0, 2);
  return [
    { role: "system" as const, content: req.system },
    ...history.map((t) => ({ role: t.role === "model" ? ("assistant" as const) : ("user" as const), content: t.text })),
    { role: "user" as const, content: req.user },
  ];
}

export interface GroqCallerDeps {
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
  clock?: Clock;
}

/** Role-aware Groq caller: buyer/explanation -> the 120B model, sellers -> the 20B model (configurable). */
export function groqModelCaller(deps: GroqCallerDeps = {}): ModelCaller | null {
  const cfg = groqConfig(deps.env);
  if (!cfg.apiKey) return null;
  const apiKey = cfg.apiKey;
  const doFetch = deps.fetchImpl ?? fetch;
  const clock = deps.clock ?? realClock;

  return async (req: ModelRequest): Promise<ModelResponse> => {
    const role = req.role ?? "seller";
    const modelId = modelForRole(cfg, role);
    const gate = gateFor(modelId, cfg);
    const messages = buildMessages(req, cfg.maxInputTokens);
    // Reasoning tokens spend the completion budget too; the 120B buyer reasons more than the 20B sellers, so it gets double headroom.
    const maxCompletion = req.maxOutputTokens + (role === "seller" ? cfg.reasoningHeadroom : cfg.reasoningHeadroom * 2);
    // Groq counts the tokens actually used (observed: remaining-tokens fell by prompt+completion, not by the cap), so pace on a
    // realistic completion, not on the reserved maximum. A 429 (if the estimate is low) is handled by retry-after.
    const est = estimateTokens(messages.map((m) => m.content).join("")) + Math.min(maxCompletion, Math.max(200, Math.ceil(maxCompletion * 0.3)));
    const deadlineAt = req.deadlineAt ?? clock.now() + cfg.timeoutMs;

    // Up to 3 requests for one turn, only for DIFFERENT recoverable situations (never the same request again):
    //  - Groq rejected the strict schema itself (configuration): switch to plain JSON mode (remembered for the process);
    //  - the model failed to produce valid structured output (HTTP 400 "failed generation") or was cut off at the completion
    //    cap (finish_reason "length"): ONE escalated retry with plain JSON mode and a larger completion budget (reasoning
    //    tokens also spend that budget);
    //  - an option Groq does not accept (include_reasoning): stop sending it.
    // Any other 400 is an invalid request: not transient, never retried, reported with Groq's own message.
    let escalated = false;
    let tokenBudget = maxCompletion;
    let forceJson = false;
    for (let tryNo = 0; tryNo < 3; tryNo++) {
      const release = await gate.acquire(est, deadlineAt);
      if (!release) throw new DeadlineError();
      const strict = !!req.wire && cfg.structured === "strict" && !structuredDowngraded && !forceJson;
      const body: Record<string, unknown> = {
        model: modelId,
        messages,
        temperature: 0.6,
        max_completion_tokens: tokenBudget,
        reasoning_effort: role === "seller" ? cfg.sellerEffort : cfg.buyerEffort,
        response_format: strict ? { type: "json_schema", json_schema: { name: req.wire!.name, strict: true, schema: req.wire!.schema } } : { type: "json_object" },
      };
      if (!reasoningParamDisabled) body.include_reasoning = false; // we never show or store the model's private reasoning
      let res: Response;
      try {
        res = await doFetch(GROQ_URL, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(Math.max(1000, Math.min(cfg.timeoutMs, deadlineAt - clock.now() + 1500))),
        });
      } catch (e) {
        release();
        throw new Error((e as Error).name === "TimeoutError" || (e as Error).name === "AbortError" ? "groq_timeout" : "groq_network");
      }
      release();
      const rate = readRateHeaders(res.headers);
      gate.observe(rate);

      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        let message = "";
        let failed: string | null = null;
        try {
          const j = JSON.parse(raw) as { error?: { message?: string; failed_generation?: string } };
          message = j.error?.message ?? "";
          failed = typeof j.error?.failed_generation === "string" ? j.error.failed_generation : null;
        } catch {
          /* not JSON */
        }
        if (res.status === 429) {
          // Honour retry-after; otherwise the token window's own reset; otherwise a bounded default. Never an instant retry.
          const hint = rate.retryAfterMs ?? rate.resetTokensMs ?? rate.resetRequestsMs ?? 2000;
          const daily = rate.remainingRequests === 0 && (rate.resetRequestsMs ?? 0) > 0;
          const wait = daily ? (rate.resetRequestsMs as number) : hint;
          gate.penalize(wait);
          // Which limit it was comes from Groq's own message ("... on tokens per minute (TPM) ..."); a day-long reset also means a daily limit.
          const scope = limitScopeFromMessage(message) ?? (daily ? "rpd" : null);
          throw new ModelHttpError(429, wait, "groq", message.slice(0, 160), scope);
        }
        if (res.status === 400) {
          const generation = failed !== null || /failed to generate|json_validate_failed|generate json|does not match|invalid json|completion tokens/i.test(message);
          const snippet = failed ? ` | failed_generation(${failed.length} chars): ${failed.slice(0, 160)}` : "";
          const detail = `${generation ? "generation failed" : "invalid request"}: ${message.slice(0, 200)}${snippet}`;
          if (generation) {
            if (!escalated && tryNo < 2) {
              escalated = true;
              forceJson = true;
              tokenBudget = Math.min(Math.ceil(maxCompletion * 1.6), 4000);
              continue;
            }
            throw new ModelHttpError(400, null, "groq", detail);
          }
          if (strict && /response_format|json_schema|schema|strict|structured/i.test(message) && tryNo < 2) {
            structuredDowngraded = true; // the strict schema itself is not accepted: plain JSON mode for the rest of the process
            continue;
          }
          if (!reasoningParamDisabled && /include_reasoning|reasoning/i.test(message) && tryNo < 2) {
            reasoningParamDisabled = true;
            continue;
          }
          throw new ModelHttpError(400, null, "groq", detail);
        }
        throw new ModelHttpError(res.status, null, "groq", message.slice(0, 160));
      }

      const data = (await res.json()) as ChatCompletion;
      const choice = data.choices?.[0];
      const text = (choice?.message?.content ?? "").trim();
      const u = data.usage;
      if (choice?.finish_reason === "length" && !escalated && tryNo < 2) {
        // Cut off at the completion cap (reasoning tokens spend it too): one retry with a larger budget, same format.
        escalated = true;
        tokenBudget = Math.min(Math.ceil(maxCompletion * 1.6), 4000);
        continue;
      }
      if (!text) throw new Error(choice?.finish_reason === "length" ? "groq_truncated" : "groq_empty");
      return {
        text,
        model: modelId,
        provider: "groq",
        inputTokens: u?.prompt_tokens ?? 0,
        outputTokens: u?.completion_tokens ?? 0,
        reasoningTokens: typeof u?.completion_tokens_details?.reasoning_tokens === "number" ? u.completion_tokens_details.reasoning_tokens : null,
        note: choice?.finish_reason === "length" ? "groq_truncated: output cut at the completion cap" : escalated ? "recovered after one escalated retry" : undefined,
      };
    }
    throw new ModelHttpError(400, null, "groq", "no usable response after recovery attempts");
  };
}

/** Strict JSON Schemas for the three structured outputs (all fields required, no extra properties). Zod + business rules still validate everything. */
export const WIRE = {
  sellerReply: {
    name: "seller_reply",
    schema: {
      type: "object",
      properties: { action: { type: "string", enum: ["quote", "concede", "hold"] }, priceCents: { type: "integer", description: "Item price in cents, inside yourPriceWindow." }, message: { type: "string", description: "At most 240 characters." } },
      required: ["action", "priceCents", "message"],
      additionalProperties: false,
    },
  },
  buyerRound: {
    name: "buyer_round",
    schema: {
      type: "object",
      properties: {
        rationale: { type: "string", description: "ONE short sentence, at most 200 characters." },
        moves: {
          type: "array",
          items: {
            type: "object",
            properties: {
              store: { type: "string", enum: SELLER_IDS.map((id) => SELLER_BRANDS[id].brand), description: "Brand name of the store." },
              action: { type: "string", enum: ["counter", "pass"] },
              targetPriceCents: { type: ["integer", "null"], description: "Item price in cents, strictly below the store's current item price; null when passing." },
              message: { type: "string", description: "At most 200 characters; empty when passing." },
            },
            required: ["store", "action", "targetPriceCents", "message"],
            additionalProperties: false,
          },
        },
      },
      required: ["rationale", "moves"],
      additionalProperties: false,
    },
  },
  buyerFinal: {
    name: "buyer_final",
    schema: {
      type: "object",
      properties: { chosenOfferId: { type: "string" }, summary: { type: "string" }, reasons: { type: "array", items: { type: "string" } }, tradeoffs: { type: "array", items: { type: "string" } } },
      required: ["chosenOfferId", "summary", "reasons", "tradeoffs"],
      additionalProperties: false,
    },
  },
  explanation: {
    name: "deal_explanation",
    schema: {
      type: "object",
      properties: { summary: { type: "string" }, reasons: { type: "array", items: { type: "string" } }, tradeoffs: { type: "array", items: { type: "string" } }, references: { type: "array", items: { type: "string" } } },
      required: ["summary", "reasons", "tradeoffs", "references"],
      additionalProperties: false,
    },
  },
} as const;
