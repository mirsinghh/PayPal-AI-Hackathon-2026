import type { AgentRunMeta, NegotiationSession, ResponseMode } from "@/shared/contracts/types";

export const MODE_LABEL: Record<ResponseMode, string> = { server: "Server Rules", ai: "AI Agents" };

export const MODE_TAGLINE: Record<ResponseMode, string> = {
  server: "Deterministic backend rules. Instant and repeatable. No Groq or Gemini call is made for the negotiation.",
  ai: "Each store is a real AI agent with its own strategy. The server still validates every price, and falls back to server rules if the AI cannot answer.",
};

/** Plain-language reasons recorded in `session.fallbackReason` when AI Agents could not run. */
const REASON: Record<string, string> = {
  provider_rules: "AI is switched off on this deployment",
  no_api_key: "no AI provider key is configured",
  no_catalog_match: "this product is not in the stores' catalogue",
  budget_below_catalog: "your budget is below what the stores can sell for",
  model_quota_exhausted: "the AI provider's quota is exhausted right now",
  cost_cap: "the hourly limit for AI negotiations was reached",
  provider_credentials: "the AI provider rejected this deployment's credentials",
  provider_unavailable: "the AI provider is not responding right now",
};
export const fallbackReasonLabel = (r: string | null | undefined): string => (r ? (REASON[r] ?? r.replace(/_/g, " ")) : "AI was unavailable");

export interface ModeBanner {
  tone: "info" | "warn";
  text: string;
}

type ModeSession = Pick<NegotiationSession, "responseMode" | "mode" | "fallbackReason"> & { agentRun?: Pick<AgentRunMeta, "turns" | "recoveredWithRules"> | undefined };

/** How many turns each engine really wrote in a finished AI run, from what the server counted. Null when unknown. */
export function turnSplit(s: Pick<ModeSession, "agentRun">): { ai: number; rules: number } | null {
  const t = s.agentRun?.turns;
  return t && Number.isFinite(t.ai) && Number.isFinite(t.fallback) ? { ai: t.ai, rules: t.fallback } : null;
}

/**
 * What the user chose vs. what actually ran, in words. A deterministic run is never presented as AI:
 * when AI was requested but the server rules ran instead, the banner says so and why. A mixed run says how many turns
 * each engine wrote, and a run that ended up entirely on rules is not called an AI negotiation.
 */
export function modeBanner(s: ModeSession): ModeBanner | null {
  if (s.responseMode === "ai" && s.mode !== "multi_agent") {
    return { tone: "warn", text: `You chose AI Agents, but AI could not run (${fallbackReasonLabel(s.fallbackReason)}). The stores answered with backup server rules, not AI.` };
  }
  if (s.responseMode === "server") {
    return { tone: "info", text: "Server Rules: the stores answered with deterministic backend rules. No AI model wrote these replies." };
  }
  const split = s.responseMode === "ai" && s.mode === "multi_agent" ? turnSplit(s) : null;
  if (split && split.rules > 0) {
    if (split.ai === 0) return { tone: "warn", text: "You chose AI Agents, but the AI could not answer any turn, so this negotiation ran entirely on server rules. It is not an AI negotiation." };
    return { tone: "warn", text: `Mixed negotiation: ${split.ai} turn${split.ai === 1 ? "" : "s"} written by AI agents and ${split.rules} by server rules, because the AI was temporarily unavailable. Each message is labelled with who wrote it.` };
  }
  return null;
}

/** Short chip: "Server Rules" / "AI Agents" / "AI requested · server fallback" / "Mixed · 5 AI · 3 rules". */
export function modeChip(s: Pick<ModeSession, "responseMode" | "mode" | "agentRun">): { tone: "accent" | "primary" | "warn"; text: string } | null {
  if (!s.responseMode) return null;
  if (s.responseMode === "ai" && s.mode !== "multi_agent") return { tone: "warn", text: "AI requested · server fallback" };
  if (s.responseMode === "ai") {
    const split = turnSplit(s);
    if (split && split.rules > 0) return split.ai === 0 ? { tone: "warn", text: "Server rules (AI unavailable)" } : { tone: "warn", text: `Mixed · ${split.ai} AI · ${split.rules} rules` };
    return { tone: "primary", text: MODE_LABEL.ai };
  }
  return { tone: "accent", text: MODE_LABEL.server };
}

/** "This run will use ..." under the selector: what will really happen, from the server-reported provider and models. */
export function willUseText(mode: ResponseMode, ai: { provider: string; buyer: string | null; seller: string | null } | null, aiAvailable: boolean): string {
  if (mode === "server" || !aiAvailable) return "This run will use: Server Rules. No Groq or Gemini call is made for the negotiation.";
  const name = ai?.provider === "groq" ? "Groq" : ai?.provider === "gemini" ? "Gemini" : "AI";
  const m = (id: string | null) => (id ? (/gpt-oss-(\d+b)/i.exec(id) ? `GPT-OSS ${/gpt-oss-(\d+b)/i.exec(id)![1].toUpperCase()}` : id) : null);
  const models = ai?.buyer && ai?.seller ? ` (${m(ai.buyer)} buyer, ${m(ai.seller)} sellers)` : "";
  return `This run will use: AI Agents · ${name}${models}. If the AI cannot answer, Agent D continues with server rules and says so.`;
}
