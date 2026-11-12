import type { NegotiationSession, ResponseMode } from "@/shared/contracts/types";

export const MODE_LABEL: Record<ResponseMode, string> = { server: "Server Responses", ai: "AI Responses" };

export const MODE_TAGLINE: Record<ResponseMode, string> = {
  server: "Deterministic backend rules. Instant and repeatable. No AI model writes the replies.",
  ai: "Each store is a real AI model with its own strategy. The server still validates every price.",
};

/** Plain-language reasons recorded in `session.fallbackReason` when AI Responses could not run. */
const REASON: Record<string, string> = {
  provider_rules: "AI is switched off on this deployment",
  no_api_key: "no AI provider key is configured",
  no_catalog_match: "this product is not in the stores' catalogue",
  budget_below_catalog: "your budget is below what the stores can sell for",
  model_quota_exhausted: "the AI provider's quota is exhausted right now",
  cost_cap: "the hourly limit for AI negotiations was reached",
};
export const fallbackReasonLabel = (r: string | null | undefined): string => (r ? (REASON[r] ?? r.replace(/_/g, " ")) : "AI was unavailable");

export interface ModeBanner {
  tone: "info" | "warn";
  text: string;
}

/**
 * What the user chose vs. what actually ran, in words. A deterministic run is never presented as AI:
 * when AI was requested but the server rules ran instead, the banner says so and why.
 */
export function modeBanner(s: Pick<NegotiationSession, "responseMode" | "mode" | "fallbackReason">): ModeBanner | null {
  if (s.responseMode === "ai" && s.mode !== "multi_agent") {
    return { tone: "warn", text: `You chose AI Responses, but AI could not run (${fallbackReasonLabel(s.fallbackReason)}). The stores answered with backup server rules, not AI.` };
  }
  if (s.responseMode === "server") {
    return { tone: "info", text: "Server Responses: the stores answered with deterministic backend rules. No AI model wrote these replies." };
  }
  return null;
}

/** Short chip: "Server Responses" / "AI Responses" / "AI requested · server fallback". */
export function modeChip(s: Pick<NegotiationSession, "responseMode" | "mode">): { tone: "accent" | "primary" | "warn"; text: string } | null {
  if (!s.responseMode) return null;
  if (s.responseMode === "ai" && s.mode !== "multi_agent") return { tone: "warn", text: "AI requested · server fallback" };
  return s.responseMode === "ai" ? { tone: "primary", text: MODE_LABEL.ai } : { tone: "accent", text: MODE_LABEL.server };
}
