import { isAi } from "@/lib/v3/activity";
import type { AgentRunMeta, NegotiationEvent, NegotiationSession } from "@/shared/contracts/types";

/**
 * Who really wrote a message, as the persisted event says. Old events (before provider tracking) only carry
 * `source: "gemini"`, which still maps to Gemini. Rules text never gets a model label.
 */
export type ProviderId = "groq" | "gemini";
export type AgentRoleLabel = "buyer" | "seller" | "explanation";

const PROVIDER_NAME: Record<ProviderId, string> = { groq: "Groq", gemini: "Gemini" };
export const providerName = (p: string | null | undefined): string | null => (p === "groq" || p === "gemini" ? PROVIDER_NAME[p] : p ? p : null);

/** "openai/gpt-oss-120b" -> "GPT-OSS 120B"; "gemini-3.5-flash" -> "Gemini 3.5 Flash". Unknown ids are shown as given. */
export function modelLabel(model: string | null | undefined): string | null {
  if (!model) return null;
  const gpt = /gpt-oss-(\d+b)/i.exec(model);
  if (gpt) return `GPT-OSS ${gpt[1].toUpperCase()}`;
  const gem = /^gemini-(.+)$/i.exec(model);
  if (gem) return `Gemini ${gem[1].split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}`;
  return model;
}

const ROLE_NAME: Record<AgentRoleLabel, string> = { buyer: "Buyer Agent", seller: "Seller Agent", explanation: "Explanation" };

export interface Author {
  provider: ProviderId | null;
  model: string | null;
  role: AgentRoleLabel;
}

/** Provider of an AI-written event (null when no model wrote it). */
export function providerOfEvent(e: Pick<NegotiationEvent, "payload">): ProviderId | null {
  const src = e.payload.source;
  const p = e.payload.provider;
  if (p === "groq" || p === "gemini") return p;
  if (src === "groq") return "groq";
  if (isAi(src)) return "gemini"; // legacy events: "gemini" / "llm"
  return null;
}

/** "Groq · GPT-OSS 120B · Buyer Agent", "Gemini · Seller Agent" (the Gemini model is shown in the message details). */
export function authorLabel(a: Author): string {
  const parts = [providerName(a.provider), a.provider === "groq" ? modelLabel(a.model) : null, ROLE_NAME[a.role]];
  return parts.filter(Boolean).join(" · ");
}

export function authorOf(e: Pick<NegotiationEvent, "payload">, role: AgentRoleLabel): Author | null {
  const provider = providerOfEvent(e);
  if (!provider) return null;
  const model = typeof e.payload.model === "string" ? e.payload.model : null;
  return { provider, model, role };
}

/** "AI analysis · Groq · GPT-OSS 120B" when a model wrote the explanation, "Rules-based analysis" when rules did. */
export function analysisLabel(ev: { source: string; modelName: string | null; provider?: string | null }): string {
  if (ev.source !== "llm") return "Rules-based analysis";
  const provider = ev.provider ?? "gemini";
  return ["AI analysis", providerName(provider), provider === "gemini" ? null : modelLabel(ev.modelName)].filter(Boolean).join(" · ");
}

/* ---------- honest engine summary ---------- */

export interface Honesty {
  ai: number;
  fallback: number;
  total: number;
  level: "all_ai" | "mixed" | "mostly_rules" | "no_ai";
  /** Short chip text. */
  label: string;
}

const TURN_TYPES = new Set(["OFFER_RECEIVED", "COUNTEROFFER_RECEIVED", "BUYER_DECISION"]);

/**
 * How much of a live negotiation was really written by models: counts agent turns (opening quotes, seller replies, the
 * buyer's per-round plan and final choice) by the source each event records. A run where most turns were rules
 * fallbacks must not be presented as AI agents negotiating.
 */
export function engineHonesty(events: readonly NegotiationEvent[], provider?: string | null): Honesty {
  let ai = 0;
  let fallback = 0;
  for (const e of events) {
    if (!TURN_TYPES.has(e.type)) continue;
    if (isAi(e.payload.source)) ai++;
    else if (e.payload.source === "rules_fallback") fallback++;
  }
  const total = ai + fallback;
  const name = providerName(provider) ?? "AI";
  if (total === 0) return { ai, fallback, total, level: "no_ai", label: "Live run · no turns yet" };
  if (ai === 0) return { ai, fallback, total, level: "no_ai", label: `Rules fallback · 0 of ${total} turns by AI` };
  if (fallback === 0) return { ai, fallback, total, level: "all_ai", label: `Live AI agents · ${name}` };
  if (ai * 2 < total) return { ai, fallback, total, level: "mostly_rules", label: `Mostly rules fallback · ${ai} of ${total} turns by AI` };
  return { ai, fallback, total, level: "mixed", label: `Live AI agents · ${name} · ${ai} of ${total} turns by AI` };
}

/* ---------- technical summary rows ---------- */

export interface SummaryRow {
  label: string;
  value: string;
}

const dur = (ms: number) => (ms >= 60_000 ? `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s` : `${(ms / 1000).toFixed(1)} s`);
const END: Record<string, string> = { completed: "Completed", deadline: "Time budget reached", call_cap: "Call cap reached", quota_exhausted: "Provider quota exhausted", model_unavailable: "Model unavailable (repeated failures)", internal_error: "Internal error", no_offer_within_budget: "No offer within budget" };

/** Rows for the secondary "Technical summary". Only what was recorded: missing values are omitted, never invented. */
export function summaryRows(run: AgentRunMeta | undefined, session: Pick<NegotiationSession, "evaluation">): SummaryRow[] {
  if (!run) return [];
  const rows: SummaryRow[] = [];
  const add = (label: string, value: string | null | undefined) => value && rows.push({ label, value });
  add("Provider", providerName(run.provider ?? session.evaluation.provider ?? (run.model ? "gemini" : null)));
  add("Buyer model", modelLabel(run.buyerModel ?? run.model));
  add("Seller model", modelLabel(run.sellerModel ?? run.model));
  if (run.explanationModel) add("Explanation model", modelLabel(run.explanationModel));
  rows.push({ label: "Model calls", value: `${run.llmCallsSucceeded} succeeded of ${run.llmCallsAttempted} attempted` });
  rows.push({ label: "Tokens", value: `${run.inputTokens} in · ${run.outputTokens} out${typeof run.reasoningTokens === "number" ? ` (reasoning reported: ${run.reasoningTokens})` : ""}` });
  if (typeof run.http429 === "number") rows.push({ label: "HTTP 429 (rate limit)", value: String(run.http429) });
  rows.push({ label: "Rules fallbacks", value: String(run.fallbackCount) });
  const causes = Object.entries(run.fallbackCauses ?? {}).filter(([, n]) => n > 0);
  if (causes.length) rows.push({ label: "Fallback causes", value: causes.map(([k, n]) => `${k.replace(/_/g, " ")} ×${n}`).join(", ") });
  rows.push({ label: "Proposals rejected by the server", value: String(run.rejectedProposals) });
  if (typeof run.durationMs === "number") rows.push({ label: "Total time", value: dur(run.durationMs) });
  const ended = run.endedReason ?? run.stoppedReason ?? null;
  if (ended) rows.push({ label: "Ended", value: END[ended] ?? ended });
  return rows;
}
