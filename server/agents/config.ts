/**
 * Feature flag and hard limits for the multi-agent negotiation (phase 2).
 * With the flag off (default) the deterministic V0 runs exactly as before.
 */
export const LIMITS = {
  /** Negotiation rounds after the opening quotes. Phase 2 starts with two. */
  maxRounds: 2,
  /** Hard cap on model attempts (including retries) per negotiation: cost control. */
  maxModelCalls: 16,
  /** Per model attempt. */
  callTimeoutMs: 12_000,
  /** One automatic retry per agent turn. */
  maxAttemptsPerTurn: 2,
  /** Wall-clock budget for the whole run; after it the run finalises with what is already validated. */
  /** Default wall-clock budget; override with MULTI_AGENT_DEADLINE_MS (free-tier quotas need minutes). */
  deadlineMs: 40_000,
  /** Failed requests (429/5xx/timeout) tolerated per run before giving up on the model. */
  maxTransportFailures: 8,
  maxOutputTokens: 450,
  /** The buyer compares four offers per turn, so it gets more room (truncated JSON was the #1 failure in live tests). */
  maxBuyerOutputTokens: 800,
  /** Single-call test engine: the whole negotiation script in one answer. */
  maxScriptOutputTokens: 4000,
  /** In-process cap on multi-agent runs per rolling hour; above it the V0 simulation is used. */
  maxRunsPerHour: 40,
} as const;

/** Cap on model attempts per negotiation (cost control). MULTI_AGENT_MAX_CALLS overrides the default of 16 (allowed 8-40). */
export function maxModelCalls(): number {
  const n = Number(process.env.MULTI_AGENT_MAX_CALLS);
  return Number.isInteger(n) && n >= 8 && n <= 40 ? n : LIMITS.maxModelCalls;
}

export function deadlineMs(): number {
  const n = Number(process.env.MULTI_AGENT_DEADLINE_MS);
  return Number.isFinite(n) && n >= 5_000 && n <= 600_000 ? n : LIMITS.deadlineMs;
}

/** Model requests per minute the provider plan allows (Gemini free tier: 5). 0 disables client-side pacing. */
export function modelRpm(): number {
  const n = Number(process.env.AI_RPM_LIMIT);
  return Number.isInteger(n) && n >= 0 && n <= 1000 ? n : 5;
}

export function singleCallEngine(): boolean {
  return process.env.MULTI_AGENT_ENGINE === "single_call";
}

export function multiAgentEnabled(): boolean {
  return process.env.MULTI_AGENT_NEGOTIATION === "true";
}

/**
 * Circuit breaker for provider quota, per provider. A daily-quota 429 ("retry in 9h") cannot be waited out, so further
 * runs skip straight to the labelled V0 fallback instead of burning attempts and user time. A breaker on one provider
 * never switches the run to another one: that would spend a different quota without being asked.
 */
const quotaUntil = new Map<string, number>();
export function tripQuotaBreaker(retryAfterMs: number, provider = "gemini", now = Date.now()) {
  quotaUntil.set(provider, Math.max(quotaUntil.get(provider) ?? 0, now + retryAfterMs));
}
export function quotaBreakerOpen(provider = "gemini", now = Date.now()): boolean {
  return now < (quotaUntil.get(provider) ?? 0);
}

let runTimes: number[] = [];
/** Cost guard. Returns false (and does not count) when the hourly cap is reached. */
export function reserveRunSlot(now = Date.now(), max: number = LIMITS.maxRunsPerHour): boolean {
  runTimes = runTimes.filter((t) => now - t < 3_600_000);
  if (runTimes.length >= max) return false;
  runTimes.push(now);
  return true;
}
export function resetRunSlotsForTests() {
  runTimes = [];
  quotaUntil.clear();
}
