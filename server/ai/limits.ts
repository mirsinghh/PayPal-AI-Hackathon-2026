/**
 * What went wrong when an AI provider did not deliver, told apart on purpose: a daily quota is not a per-minute rate
 * limit, a bad key is not a timeout, an invalid answer is not an outage. Pure functions, no network.
 */

import type { AiIssue, AiIssueKind, LimitScope } from "@/shared/contracts/types";
export type { AiIssue, AiIssueKind, LimitScope };

/** Groq: "...on tokens per minute (TPM): Limit 8000...", "...requests per day (RPD)...". Gemini: quota ids such as "GenerateRequestsPerDay...". */
export function limitScopeFromMessage(message: string | null | undefined): LimitScope | null {
  const m = message ?? "";
  const abbr = /\((RPM|TPM|RPD|TPD)\)/i.exec(m);
  if (abbr) return abbr[1].toLowerCase() as LimitScope;
  if (/tokens per day|TokensPerDay|PerDay.*Token|Token.*PerDay/i.test(m)) return "tpd";
  if (/requests per day|RequestsPerDay|per ?day/i.test(m)) return "rpd";
  if (/tokens per minute|TokensPerMinute|Token.*PerMinute/i.test(m)) return "tpm";
  if (/requests per minute|RequestsPerMinute|per ?minute/i.test(m)) return "rpm";
  return null;
}

export const isDailyScope = (s: LimitScope | null | undefined): boolean => s === "rpd" || s === "tpd";

/** Classifies a provider failure from its HTTP status, scope and message. */
export function classifyHttp(status: number, scope: LimitScope | null, message = ""): AiIssueKind {
  if (status === 429) return isDailyScope(scope) ? "daily_quota" : scope === "tpm" ? "token_limit" : "rate_limit";
  if (status === 401 || status === 403) return "credentials";
  if (status === 404) return "credentials"; // unknown model / no access to it: a configuration problem
  if (status >= 500) return "server_error";
  if (status === 400) return /failed to generate|json_validate_failed|generate json|generation failed|does not match|invalid json|completion tokens/i.test(message) ? "structured_failed" : "unavailable";
  return "unavailable";
}

/** The more actionable of two issues, so a run reports the cause that matters most to the user. */
const SEVERITY: Record<AiIssueKind, number> = { daily_quota: 9, credentials: 8, token_limit: 7, rate_limit: 6, unavailable: 5, server_error: 4, timeout: 3, structured_failed: 2, invalid_response: 1, call_budget: 0 };
export const moreSevere = (a: AiIssue | null, b: AiIssue): AiIssue => (!a || SEVERITY[b.kind] > SEVERITY[a.kind] ? b : a);

/** Limits where the right message is "usage limit reached". */
export const isQuotaKind = (k: AiIssueKind): boolean => k === "rate_limit" || k === "token_limit" || k === "daily_quota";

/** "Try again in approximately 3 minutes." from a provider-reported wait, or null when there is nothing reliable to say. */
export function waitPhrase(retryAfterMs: number | null | undefined): string | null {
  if (retryAfterMs === null || retryAfterMs === undefined || !Number.isFinite(retryAfterMs) || retryAfterMs <= 0) return null;
  const s = Math.ceil(retryAfterMs / 1000);
  if (s < 60) return "less than a minute";
  const min = Math.round(s / 60);
  if (min < 60) return `approximately ${min} minute${min === 1 ? "" : "s"}`;
  const h = Math.round(min / 60);
  return `approximately ${h} hour${h === 1 ? "" : "s"}`;
}

export interface AiNotice {
  title: "AI temporarily unavailable";
  /** Main sentence for this kind of problem. */
  text: string;
  /** Second sentence about when to retry. Only a provider-reported time is ever shown. */
  retry: string;
  /** Whether "Try AI again" makes sense (false for a daily quota or a configuration problem). */
  canRetry: boolean;
}

/**
 * The user-facing wording. Quota-type issues say "usage limit"; other problems never claim a quota. A daily quota (or
 * anything without a reliable recovery time) says only "Please try again later.".
 */
export function aiNotice(issue: AiIssue | null, fallbackKind: AiIssueKind = "unavailable"): AiNotice {
  const kind = issue?.kind ?? fallbackKind;
  const title = "AI temporarily unavailable" as const;
  const quota = isQuotaKind(kind);
  const phrase = kind === "daily_quota" ? null : waitPhrase(issue?.retryAfterMs);
  const retry = quota && phrase ? `AI requests are temporarily limited. Try again in ${phrase}.` : "Please try again later.";
  const text = quota
    ? "Agent D has reached the AI provider's usage limit. You can try again later or continue with our rule-based negotiation engine."
    : kind === "credentials"
      ? "Agent D could not use the AI provider on this deployment. You can continue with our rule-based negotiation engine."
      : "Agent D could not get a usable answer from the AI provider. You can try again later or continue with our rule-based negotiation engine.";
  return { title, text, retry, canRetry: kind !== "daily_quota" && kind !== "credentials" };
}

/** One line for a run that is already switching to server rules. */
export const AUTO_FALLBACK_TEXT = "AI is temporarily unavailable. Agent D is continuing with server-based negotiation rules.";

/* ---------- circuit breaker -> what a new negotiation / the config endpoint should say ---------- */

/** The session `fallbackReason` for an open breaker. Quota-type problems keep the long-standing "model_quota_exhausted". */
export function breakerReason(issue: AiIssue | null): "model_quota_exhausted" | "provider_credentials" | "provider_unavailable" {
  if (!issue) return "model_quota_exhausted";
  if (isQuotaKind(issue.kind)) return "model_quota_exhausted";
  return issue.kind === "credentials" ? "provider_credentials" : "provider_unavailable";
}

/**
 * The issue to show for an open breaker. A wait is kept ONLY if the provider reported one when the breaker tripped; it is then
 * the time that is really left. Anything else (our internal guesses for daily quotas, credentials, outages) shows no time.
 */
export function breakerIssue(info: { remainingMs: number; issue: AiIssue | null }): AiIssue {
  const i = info.issue ?? { kind: "rate_limit" as const, retryAfterMs: null, scope: null };
  return { kind: i.kind, scope: i.scope, retryAfterMs: i.retryAfterMs !== null && i.kind !== "daily_quota" ? info.remainingMs : null };
}
