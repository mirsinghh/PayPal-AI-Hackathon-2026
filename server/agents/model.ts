import { ZodError, type ZodType } from "zod";
import { extractJson } from "@/server/ai/explain";
import { classifyHttp, isDailyScope, limitScopeFromMessage, moreSevere, type AiIssue, type LimitScope } from "@/server/ai/limits";
import { LIMITS, tripQuotaBreaker } from "./config";

export interface Turn {
  role: "user" | "model";
  text: string;
}

/** What an agent is for. Providers may use a different model per role (e.g. Groq: 120B buyer, 20B sellers). */
export type AgentRole = "buyer" | "seller" | "explanation";

/** A strict JSON Schema for providers with Structured Outputs. The server still validates everything with Zod and the business rules. */
export interface WireSchema {
  name: string;
  schema: Record<string, unknown>;
}

export interface ModelRequest {
  system: string;
  /** This agent's own prior turns (its private memory). Never shared with other agents. */
  history: Turn[];
  user: string;
  maxOutputTokens: number;
  /** Which kind of agent is asking (provider routing). Absent in older callers: treated as "seller". */
  role?: AgentRole;
  /** Absolute time after which the run no longer wants an answer (providers must not wait past it). */
  deadlineAt?: number;
  wire?: WireSchema;
}

export interface ModelResponse {
  text: string;
  model: string;
  /** "groq" | "gemini" | ... Absent for injected test callers. */
  provider?: string;
  inputTokens: number;
  outputTokens: number;
  /** Only when the provider reports it. Never estimated. */
  reasoningTokens?: number | null;
  /** Provider-side remark about this answer (e.g. a failed structured generation). Shown in rejection details. */
  note?: string;
}

/** One real model call. Injectable so tests never hit the network. */
export type ModelCaller = (req: ModelRequest) => Promise<ModelResponse>;

export class ModelHttpError extends Error {
  constructor(
    public status: number,
    /** Provider-suggested wait before retrying (429). */
    public retryAfterMs: number | null = null,
    label = "gemini",
    /** Provider's own message (and failed output snippet), kept in rejection details. Never contains keys. */
    public detail: string | null = null,
    /** For a 429: which limit it was (per minute / per day, requests / tokens), when the provider's message says. */
    public scope: LimitScope | null = null,
  ) {
    super(`${label}_http_${status}`);
  }
}

/** The provider cannot serve this request before the run's deadline (rate/token pacing). Not a provider failure. */
export class DeadlineError extends Error {
  constructor() {
    super("deadline");
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
export function geminiModelCaller(env: Record<string, string | undefined> = process.env): ModelCaller | null {
  const apiKey = env.AI_API_KEY;
  if (!apiKey || /^your-/i.test(apiKey)) return null;
  const model = env.AI_MODEL || "gemini-3.5-flash";
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
      let scope: LimitScope | null = null;
      if (res.status === 429) {
        const body = await res.text().catch(() => "");
        const m = /retry in ([\d.]+)s/i.exec(body);
        if (m) retryAfterMs = Math.ceil(Number(m[1]) * 1000);
        else {
          const h = Number(res.headers.get("retry-after"));
          if (Number.isFinite(h) && h > 0) retryAfterMs = Math.ceil(h * 1000);
        }
        scope = limitScopeFromMessage(body);
      }
      throw new ModelHttpError(res.status, retryAfterMs, "gemini", null, scope);
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
      provider: "gemini",
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    };
  };
}

/** Per-role accounting of what really happened (only numbers the provider returned or the engine counted). */
export interface RoleStats {
  attempts: number;
  succeeded: number;
  failed: number;
  http429: number;
  inputTokens: number;
  outputTokens: number;
  /** Sum of the reasoning tokens the provider reported; null when it never reported any. */
  reasoningTokens: number | null;
  models: string[];
  providers: string[];
}

const emptyStats = (): RoleStats => ({ attempts: 0, succeeded: 0, failed: 0, http429: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: null, models: [], providers: [] });

/** Shared, per-run accounting: call cap, deadline and token counters. */
export class RunBudget {
  attempted = 0;
  /** Requests that got no usable answer from the provider (429/5xx/timeout): not billed, capped separately. */
  transportFailures = 0;
  limiter: RateLimiter | null = null;
  quotaExhausted = false;
  /** Set when the provider rejected our credentials: nothing else will work this run. */
  providerFailed = false;
  /** The most actionable thing that went wrong with the provider (for the user-facing notice). Null = nothing did. */
  issue: AiIssue | null = null;
  noteIssue(i: AiIssue) {
    const prev = this.issue;
    this.issue = moreSevere(prev, i);
    // Same kind seen again: keep the longest provider-reported wait.
    if (prev && prev.kind === i.kind && this.issue.kind === i.kind) this.issue = { ...this.issue, retryAfterMs: Math.max(prev.retryAfterMs ?? 0, i.retryAfterMs ?? 0) || null };
  }
  succeeded = 0;
  inputTokens = 0;
  outputTokens = 0;
  reasoningTokens: number | null = null;
  http429 = 0;
  readonly roles: Record<AgentRole, RoleStats> = { buyer: emptyStats(), seller: emptyStats(), explanation: emptyStats() };
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
  stopReason(reserve = 0): "call_cap" | "deadline" | "model_unavailable" | "quota_exhausted" | null {
    if (this.quotaExhausted) return "quota_exhausted";
    if (this.providerFailed) return "model_unavailable";
    // `reserve` keeps the last calls for the final decision: earlier turns stop `reserve` calls before the cap.
    if (this.attempted - this.transportFailures >= this.maxCalls - reserve) return "call_cap";
    if (this.transportFailures >= LIMITS.maxTransportFailures) return "model_unavailable";
    if (this.now() - this.startedAt >= this.deadlineMs) return "deadline";
    return null;
  }
  recordAttempt(role: AgentRole) {
    this.roles[role].attempts++;
  }
  recordResponse(role: AgentRole, out: ModelResponse) {
    const r = this.roles[role];
    r.inputTokens += out.inputTokens;
    r.outputTokens += out.outputTokens;
    if (typeof out.reasoningTokens === "number") {
      r.reasoningTokens = (r.reasoningTokens ?? 0) + out.reasoningTokens;
      this.reasoningTokens = (this.reasoningTokens ?? 0) + out.reasoningTokens;
    }
    if (!r.models.includes(out.model)) r.models.push(out.model);
    if (out.provider && !r.providers.includes(out.provider)) r.providers.push(out.provider);
    this.inputTokens += out.inputTokens;
    this.outputTokens += out.outputTokens;
  }
  recordSuccess(role: AgentRole) {
    this.succeeded++;
    this.roles[role].succeeded++;
  }
  recordFailure(role: AgentRole, status: number | null) {
    this.roles[role].failed++;
    if (status === 429) {
      this.roles[role].http429++;
      this.http429++;
    }
  }
}

/** An independent conversation: its own system prompt and memory. */
export class Agent {
  readonly history: Turn[] = [];
  constructor(
    readonly id: string,
    readonly system: string,
    readonly role: AgentRole = id === "buyer" ? "buyer" : "seller",
  ) {}
}

export type AskResult<T> =
  | { ok: true; value: T; model: string; provider: string | null; latencyMs: number; attempts: number; rejections: string[]; details: string[] }
  | { ok: false; reason: string; attempts: number; rejections: string[]; details: string[]; /** What went wrong with the provider, when it was a provider problem. */ issue?: AiIssue };

export interface AskOptions {
  wire?: WireSchema;
  /** Extra, turn-specific guidance appended to the single corrective message (e.g. the allowed price window). */
  hint?: (problem: string) => string | null;
  /** Calls to keep free for later phases (the final decision). */
  reserve?: number;
}

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
  options?: AskOptions | WireSchema,
): Promise<AskResult<T>> {
  const opts: AskOptions = options && "schema" in options ? { wire: options } : (options ?? {});
  const wire = opts.wire;
  const rejections: string[] = [];
  const details: string[] = [];
  let user = prompt;
  const scratch: Turn[] = [];
  let attempts = 0;
  for (; attempts < LIMITS.maxAttemptsPerTurn; ) {
    const stop = budget.stopReason(opts.reserve ?? 0);
    if (stop) return { ok: false, reason: stop, attempts, rejections, details };
    if (budget.limiter && !(await budget.limiter.acquire(budget.deadlineAt))) return { ok: false, reason: "deadline", attempts, rejections, details };
    attempts++;
    budget.attempted++;
    budget.recordAttempt(agent.role);
    const t0 = Date.now();
    try {
      const out = await caller({
        system: agent.system,
        history: [...agent.history, ...scratch],
        user,
        maxOutputTokens: agent.id === "script" ? LIMITS.maxScriptOutputTokens : agent.id === "buyer" ? LIMITS.maxBuyerOutputTokens : LIMITS.maxOutputTokens,
        role: agent.role,
        deadlineAt: budget.deadlineAt,
        wire,
      });
      budget.recordResponse(agent.role, out);
      let problem: string | null = null;
      let detail = "";
      let value: T | undefined;
      try {
        value = schema.parse(extractJson(out.text));
        problem = validate(value);
      } catch (e) {
        const issue = e instanceof ZodError ? e.issues[0] : null;
        problem = issue ? `schema_invalid:${issue.path.join(".")}` : e instanceof SyntaxError || (e instanceof Error && e.message === "no_json") ? "not_json" : "schema_invalid";
        // The real reason, e.g. "rationale: too_big, expected at most 300 characters" (kept in the event details and sent back once).
        if (out.note) problem = problem ?? "schema_invalid";
        detail = issue ? `${issue.path.join(".")}: ${issue.code}${"maximum" in issue ? `, at most ${(issue as { maximum: unknown }).maximum}` : ""}${"minimum" in issue ? `, at least ${(issue as { minimum: unknown }).minimum}` : ""} (${issue.message})` : "";
        if (process.env.AGENTS_DEBUG) console.warn(`[agents] ${agent.id} invalid output: ${problem} :: ${out.text.slice(0, 400)}`);
      }
      if (problem === null && value !== undefined) {
        budget.recordSuccess(agent.role);
        agent.history.push({ role: "user", text: prompt }, { role: "model", text: out.text });
        return { ok: true, value, model: out.model, provider: out.provider ?? null, latencyMs: Date.now() - t0, attempts, rejections, details };
      }
      budget.recordFailure(agent.role, null);
      budget.noteIssue({ kind: /generation failed|groq_400/i.test(`${out.note ?? ""} ${detail}`) ? "structured_failed" : "invalid_response", retryAfterMs: null, scope: null });
      rejections.push(problem ?? "invalid");
      details.push(detail || (problem ?? "invalid"));
      scratch.push({ role: "user", text: user }, { role: "model", text: out.text });
      // Keep a short sample of what the model actually returned when it was structurally invalid (it is the model's own output; no keys).
      if (/^(schema_invalid|not_json)/.test(problem ?? "")) details[details.length - 1] = `${details[details.length - 1]} | output: ${out.text.slice(0, 200)}`;
      if (out.note) details[details.length - 1] = `${details[details.length - 1]} [${out.note}]`;
      // A structural failure that survived the provider's own escalated retry will not be fixed by asking again: stop here.
      if (out.note?.startsWith("recovered after one escalated retry") && /^(schema_invalid|not_json)/.test(problem ?? "")) return { ok: false, reason: "invalid_output", attempts, rejections, details };
      const extra = [detail ? `Detail: ${detail}.` : null, opts.hint?.(problem ?? "") ?? null].filter(Boolean).join(" ");
      user = `Your previous reply was rejected by the server (${problem}). ${extra} Reply again with ONLY a valid JSON object that respects every rule.`;
    } catch (e) {
      if (e instanceof DeadlineError) return { ok: false, reason: "deadline", attempts, rejections, details };
      budget.transportFailures++;
      budget.recordFailure(agent.role, e instanceof ModelHttpError ? e.status : null);
      rejections.push(`call_failed:${(e as Error).message.slice(0, 60)}`);
      details.push(e instanceof ModelHttpError && e.detail ? e.detail : (e as Error).message.slice(0, 60));
      const issue = issueOf(e);
      budget.noteIssue(issue);
      if (e instanceof ModelHttpError) {
        // A daily quota cannot be waited out and retrying only burns time: stop the run now and remember it (per provider).
        if (e.status === 429 && isDailyScope(e.scope)) {
          budget.quotaExhausted = true;
          tripQuotaBreaker(e.retryAfterMs ?? DAILY_DEFAULT_BREAKER_MS, providerKeyOf(e), Date.now(), issue);
          return { ok: false, reason: "quota_exhausted", attempts, rejections, details, issue };
        }
        // Rejected credentials / no access to the model: nothing else will work this run, and the next ones should not try.
        if (issue.kind === "credentials") {
          budget.providerFailed = true;
          tripQuotaBreaker(CREDENTIALS_BREAKER_MS, providerKeyOf(e), Date.now(), issue);
          return { ok: false, reason: "call_failed", attempts, rejections, details, issue };
        }
      }
      if (!retryable(e)) return { ok: false, reason: "call_failed", attempts, rejections, details, issue };
      // Honour the provider's retry hint, but never wait past the run deadline.
      const wait = e instanceof ModelHttpError && e.retryAfterMs ? e.retryAfterMs + 250 : 250;
      if (Date.now() + wait > budget.deadlineAt) {
        // A long 429 cannot be waited out: stop the whole run and trip the breaker (per provider).
        if (e instanceof ModelHttpError && e.status === 429 && e.retryAfterMs) {
          budget.quotaExhausted = true;
          tripQuotaBreaker(e.retryAfterMs, providerKeyOf(e), Date.now(), issue);
          return { ok: false, reason: "quota_exhausted", attempts, rejections, details, issue };
        }
        return { ok: false, reason: "deadline", attempts, rejections, details, issue };
      }
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  return { ok: false, reason: rejections.at(-1)?.startsWith("call_failed") ? "call_failed" : "invalid_output", attempts, rejections, details, ...(budget.issue ? { issue: budget.issue } : {}) };
}

/** Internal guesses used ONLY to stop calling a provider for a while. They are never shown to the user as a recovery time. */
const DAILY_DEFAULT_BREAKER_MS = 15 * 60_000;
const CREDENTIALS_BREAKER_MS = 10 * 60_000;

/** What kind of provider problem an exception is. `retryAfterMs` is only what the provider reported. */
export function issueOf(e: unknown): AiIssue {
  if (e instanceof ModelHttpError) return { kind: classifyHttp(e.status, e.scope, e.detail ?? ""), retryAfterMs: e.retryAfterMs, scope: e.scope };
  const m = e instanceof Error ? e.message : "";
  return { kind: /timeout|abort/i.test(m) ? "timeout" : "unavailable", retryAfterMs: null, scope: null };
}

/** Which provider a 429 came from (the error message is `<provider>_http_<status>`). */
function providerKeyOf(e: ModelHttpError): string {
  return e.message.split("_http_")[0] || "gemini";
}
