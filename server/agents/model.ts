import { ZodError, type ZodType } from "zod";
import { extractJson } from "@/server/ai/explain";
import { LIMITS, tripQuotaBreaker } from "./config";

export interface Turn {
  role: "user" | "model";
  text: string;
}

export interface ModelRequest {
  system: string;
  /** This agent's own prior turns (its private memory). Never shared with other agents. */
  history: Turn[];
  user: string;
  maxOutputTokens: number;
}

export interface ModelResponse {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/** One real model call. Injectable so tests never hit the network. */
export type ModelCaller = (req: ModelRequest) => Promise<ModelResponse>;

export class ModelHttpError extends Error {
  constructor(
    public status: number,
    /** Provider-suggested wait before retrying (429). */
    public retryAfterMs: number | null = null,
  ) {
    super(`gemini_http_${status}`);
  }
}

/**
 * Sliding-window pacing so a run never exceeds the plan's requests-per-minute (a 429 wastes time and,
 * on some plans, quota). Acquisitions are serialised; waiting is bounded by the run deadline.
 */
export class RateLimiter {
  private stamps: number[] = [];
  private chain: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly rpm: number,
    private readonly now: () => number = Date.now,
  ) {}
  /** Resolves true when a slot was taken, false when it would not become free before `deadlineAt`. */
  acquire(deadlineAt: number): Promise<boolean> {
    if (this.rpm <= 0) return Promise.resolve(true);
    const run = this.chain.then(async () => {
      for (;;) {
        const t = this.now();
        this.stamps = this.stamps.filter((s) => t - s < 60_000);
        if (this.stamps.length < this.rpm) {
          this.stamps.push(t);
          return true;
        }
        const wait = this.stamps[0] + 60_000 - t + 50;
        if (t + wait > deadlineAt) return false;
        await new Promise((r) => setTimeout(r, wait));
      }
    });
    this.chain = run.catch(() => undefined);
    return run;
  }
}

let shared: RateLimiter | null = null;
export function sharedRateLimiter(rpm: number): RateLimiter {
  return (shared ??= new RateLimiter(rpm));
}

/** Google Gemini over REST. Key goes in a header, never in the URL or logs. */
export function geminiModelCaller(): ModelCaller | null {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey || /^your-/i.test(apiKey)) return null;
  const model = process.env.AI_MODEL || "gemini-3.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  return async (req) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [...req.history, { role: "user" as const, text: req.user }].map((t) => ({
          role: t.role,
          parts: [{ text: t.text }],
        })),
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: req.maxOutputTokens,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: AbortSignal.timeout(LIMITS.callTimeoutMs),
    });
    if (!res.ok) {
      let retryAfterMs: number | null = null;
      if (res.status === 429) {
        const m = /retry in ([d.]+)s/i.exec(await res.text().catch(() => ""));
        if (m) retryAfterMs = Math.ceil(Number(m[1]) * 1000);
      }
      throw new ModelHttpError(res.status, retryAfterMs);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    if (!text) throw new Error("gemini_empty");
    return {
      text,
      model,
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    };
  };
}

/** Shared, per-run accounting: call cap, deadline and token counters. */
export class RunBudget {
  attempted = 0;
  /** Requests that got no usable answer from the provider (429/5xx/timeout): not billed, capped separately. */
  transportFailures = 0;
  limiter: RateLimiter | null = null;
  quotaExhausted = false;
  succeeded = 0;
  inputTokens = 0;
  outputTokens = 0;
  constructor(
    private readonly startedAt: number,
    private readonly now: () => number = Date.now,
    private readonly maxCalls: number = LIMITS.maxModelCalls,
    private readonly deadlineMs: number = LIMITS.deadlineMs,
  ) {}
  get deadlineAt(): number {
    return this.startedAt + this.deadlineMs;
  }
  /** Returns a stop reason, or null when another call is allowed. */
  stopReason(): "call_cap" | "deadline" | "model_unavailable" | "quota_exhausted" | null {
    if (this.quotaExhausted) return "quota_exhausted";
    if (this.attempted - this.transportFailures >= this.maxCalls) return "call_cap";
    if (this.transportFailures >= LIMITS.maxTransportFailures) return "model_unavailable";
    if (this.now() - this.startedAt >= this.deadlineMs) return "deadline";
    return null;
  }
}

/** An independent conversation: its own system prompt and memory. */
export class Agent {
  readonly history: Turn[] = [];
  constructor(
    readonly id: string,
    readonly system: string,
  ) {}
}

export type AskResult<T> =
  | { ok: true; value: T; model: string; latencyMs: number; attempts: number; rejections: string[] }
  | { ok: false; reason: string; attempts: number; rejections: string[] };

function retryable(e: unknown): boolean {
  return !(e instanceof ModelHttpError) || e.status === 429 || e.status >= 500;
}

/**
 * Sends one turn to an agent. The model's JSON must pass the Zod schema and the business validator;
 * on a validation failure the agent is told why (inside its own memory) and gets one more attempt.
 * Only the accepted exchange is kept in memory.
 */
export async function ask<T>(
  agent: Agent,
  caller: ModelCaller,
  budget: RunBudget,
  prompt: string,
  schema: ZodType<T>,
  validate: (value: T) => string | null,
): Promise<AskResult<T>> {
  const rejections: string[] = [];
  let user = prompt;
  const scratch: Turn[] = [];
  let attempts = 0;
  for (; attempts < LIMITS.maxAttemptsPerTurn; ) {
    const stop = budget.stopReason();
    if (stop) return { ok: false, reason: stop, attempts, rejections };
    if (budget.limiter && !(await budget.limiter.acquire(budget.deadlineAt))) return { ok: false, reason: "deadline", attempts, rejections };
    attempts++;
    budget.attempted++;
    const t0 = Date.now();
    try {
      const out = await caller({
        system: agent.system,
        history: [...agent.history, ...scratch],
        user,
        maxOutputTokens: agent.id === "script" ? LIMITS.maxScriptOutputTokens : agent.id === "buyer" ? LIMITS.maxBuyerOutputTokens : LIMITS.maxOutputTokens,
      });
      budget.inputTokens += out.inputTokens;
      budget.outputTokens += out.outputTokens;
      let problem: string | null = null;
      let value: T | undefined;
      try {
        value = schema.parse(extractJson(out.text));
        problem = validate(value);
      } catch (e) {
        const issue = e instanceof ZodError ? e.issues[0] : null;
        problem = issue ? `schema_invalid:${issue.path.join(".")}` : e instanceof SyntaxError || (e instanceof Error && e.message === "no_json") ? "not_json" : "schema_invalid";
        if (process.env.AGENTS_DEBUG) console.warn(`[agents] ${agent.id} invalid output: ${problem} :: ${out.text.slice(0, 400)}`);
      }
      if (problem === null && value !== undefined) {
        budget.succeeded++;
        agent.history.push({ role: "user", text: prompt }, { role: "model", text: out.text });
        return { ok: true, value, model: out.model, latencyMs: Date.now() - t0, attempts, rejections };
      }
      rejections.push(problem ?? "invalid");
      scratch.push({ role: "user", text: user }, { role: "model", text: out.text });
      user = `Your previous reply was rejected by the server (${problem}). Reply again with ONLY a valid JSON object that respects every rule.`;
    } catch (e) {
      budget.transportFailures++;
      rejections.push(`call_failed:${(e as Error).message.slice(0, 60)}`);
      if (!retryable(e)) return { ok: false, reason: "call_failed", attempts, rejections };
      // Honour the provider's retry hint, but never wait past the run deadline.
      const wait = e instanceof ModelHttpError && e.retryAfterMs ? e.retryAfterMs + 250 : 250;
      if (Date.now() + wait > budget.deadlineAt) {
        // A long 429 (e.g. daily free-tier quota) cannot be waited out: stop the whole run and trip the breaker.
        if (e instanceof ModelHttpError && e.status === 429 && e.retryAfterMs) {
          budget.quotaExhausted = true;
          tripQuotaBreaker(e.retryAfterMs);
          return { ok: false, reason: "quota_exhausted", attempts, rejections };
        }
        return { ok: false, reason: "deadline", attempts, rejections };
      }
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  return { ok: false, reason: rejections.at(-1)?.startsWith("call_failed") ? "call_failed" : "invalid_output", attempts, rejections };
}
