import { randomUUID } from "node:crypto";
import type { NegotiationSession, ProductIntent } from "@/shared/contracts/types";
import { explain, type LlmCaller, geminiCaller } from "@/server/ai/explain";
import { composeEvents } from "./events";
import { rankOffers } from "./ranking";
import { buildScenario } from "./scenario";
import { catalogForCategory, matchCategory } from "@/server/agents/catalog";
import { deadlineMs, modelRpm, multiAgentEnabled, quotaBreakerOpen, reserveRunSlot, singleCallEngine } from "@/server/agents/config";
import { geminiModelCaller, sharedRateLimiter, type ModelCaller } from "@/server/agents/model";
import { runMultiAgentNegotiation } from "@/server/agents/run";
import { runSingleCallNegotiation } from "@/server/agents/single";

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Prepares a complete, validated session. Everything is generated before playback starts. */
export async function prepareSession(
  intent: ProductIntent,
  opts: { caller?: LlmCaller | null; seed?: number; now?: Date } = {},
): Promise<NegotiationSession> {
  const now = opts.now ?? new Date();
  const sessionId = `ses_${randomUUID()}`;
  const offers = buildScenario(sessionId, intent, { seed: opts.seed, now });
  const ranking = rankOffers(offers, intent.priority);
  const { evaluation, aiStatus } = await explain(
    intent,
    offers,
    ranking,
    opts.caller === undefined ? geminiCaller() : opts.caller,
  );
  const full = { ...evaluation, evaluationId: `eval_${randomUUID()}`, sessionId };
  return {
    sessionId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    status: "ready",
    intent,
    offers,
    events: composeEvents(sessionId, intent, offers, ranking),
    evaluation: full,
    recommendedOfferId: ranking.recommendedOfferId,
    approvedOfferId: null,
    approvedAt: null,
    aiStatus,
    schemaVersion: "1.0",
  };
}

export function isSessionExpired(s: NegotiationSession, now = new Date()): boolean {
  return new Date(s.expiresAt).getTime() < now.getTime();
}

export function isOfferExpired(s: NegotiationSession, offerId: string, now = new Date()): boolean {
  const o = s.offers.find((x) => x.offerId === offerId);
  return !o || new Date(o.offerExpiresAt).getTime() < now.getTime();
}

/* ---------- Phase 2: real multi-agent negotiation (behind MULTI_AGENT_NEGOTIATION=true) ---------- */

/** A run gets its wall-clock budget plus a margin to finalise before it is considered dead. */
export const staleNegotiationMs = () => deadlineMs() + 60_000;

export interface StartedNegotiation {
  session: NegotiationSession;
  /** Present only for a live multi-agent run: must be executed after the response (see route). */
  run: (() => Promise<void>) | null;
}

/**
 * Chooses the engine. Multi-agent only when the flag is on AND everything it needs is available;
 * otherwise the proven V0 simulation runs and the reason is recorded on the session.
 */
export async function startNegotiation(
  intent: ProductIntent,
  opts: { caller?: ModelCaller | null; now?: Date } = {},
): Promise<StartedNegotiation> {
  const v0 = async (reason: string | null): Promise<StartedNegotiation> => {
    const session = await prepareSession(intent, { now: opts.now });
    return { session: { ...session, mode: "v0_rules", fallbackReason: reason }, run: null };
  };
  if (!multiAgentEnabled()) return v0(null);

  const caller = opts.caller === undefined ? geminiModelCaller() : opts.caller;
  if (!caller) return v0("no_api_key");
  const category = matchCategory(intent.productQuery);
  if (!category) return v0("no_catalog_match");
  const reachable = catalogForCategory(category).some((c) => c.minPriceCents + c.shippingCents <= intent.budgetCents && c.stock > 0);
  if (!reachable) return v0("budget_below_catalog");
  if (quotaBreakerOpen()) return v0("model_quota_exhausted");
  if (!reserveRunSlot()) return v0("cost_cap");

  const now = opts.now ?? new Date();
  const sessionId = `ses_${randomUUID()}`;
  const session: NegotiationSession = {
    sessionId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    status: "negotiating",
    intent,
    offers: [],
    events: [],
    evaluation: {
      evaluationId: `eval_${randomUUID()}`,
      sessionId,
      rankedOfferIds: [],
      recommendedOfferId: "",
      scores: {},
      aiSummary: "",
      aiReasons: [],
      tradeoffs: [],
      source: "rules_fallback",
      modelName: null,
      validatedAt: now.toISOString(),
    },
    recommendedOfferId: "",
    approvedOfferId: null,
    approvedAt: null,
    aiStatus: "pending",
    schemaVersion: "1.0",
    mode: "multi_agent",
    fallbackReason: null,
  };
  // Only the real provider is paced; injected test callers are not.
  const limiter = opts.caller === undefined && modelRpm() > 0 ? sharedRateLimiter(modelRpm()) : null;
  if (singleCallEngine()) return { session, run: () => runSingleCallNegotiation(sessionId, intent, category, caller, limiter) };
  return { session, run: () => runMultiAgentNegotiation(sessionId, intent, category, caller, { limiter }) };
}

/** A run that never finished (process killed, deadline) must not leave the session "negotiating" forever. */
export function isNegotiationStale(s: NegotiationSession, now = Date.now()): boolean {
  return s.status === "negotiating" && now - new Date(s.createdAt).getTime() > staleNegotiationMs();
}
