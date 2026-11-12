import { randomUUID } from "node:crypto";
import type { AiIssue, NegotiationSession, ProductIntent, ResponseMode } from "@/shared/contracts/types";
import { breakerIssue, breakerReason } from "@/server/ai/limits";
import { explain, type LlmCaller } from "@/server/ai/explain";
import { explanationCaller, resolveEngine } from "@/server/ai/provider";
import { composeEvents } from "./events";
import { rankOffers } from "./ranking";
import { buildScenario } from "./scenario";
import { catalogForCategory, matchCategory } from "@/server/agents/catalog";
import { deadlineMs, modelRpm, multiAgentEnabled, quotaBreakerInfo, reserveRunSlot, singleCallEngine } from "@/server/agents/config";
import { sharedRateLimiter, type ModelCaller } from "@/server/agents/model";
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
    opts.caller === undefined ? explanationCaller() : opts.caller,
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

/**
 * A run gets its wall-clock budget plus a margin to finalise before it is considered dead. The margin is short on purpose:
 * a run killed by the platform must not leave the user watching "negotiating" for minutes (it is then completed with server
 * rules, see server/agents/recover.ts).
 */
const STALE_MARGIN_MS = 25_000;
export const staleNegotiationMs = () => deadlineMs() + STALE_MARGIN_MS;

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
  opts: {
    caller?: ModelCaller | null;
    now?: Date;
    /**
     * V5 selector, chosen before the negotiation and fixed for it. "server": backend rules only, the negotiation never
     * calls a model. "ai": real model agents (no MULTI_AGENT_NEGOTIATION flag needed: the user's choice is the opt-in).
     * Omitted (legacy callers): the MULTI_AGENT_NEGOTIATION flag decides, as before V5.
     */
    responseMode?: ResponseMode;
    /** Test seam for the request analysis (explanation) caller. It is never derived from responseMode. */
    explainCaller?: LlmCaller | null;
    ownerId?: string | null;
  } = {},
): Promise<StartedNegotiation> {
  const requested: ResponseMode = opts.responseMode ?? (multiAgentEnabled() ? "ai" : "server");
  const owner = opts.ownerId ? { ownerId: opts.ownerId } : {};
  const v0 = async (reason: string | null, issue: AiIssue | null = null): Promise<StartedNegotiation> => {
    // The analysis (explanation) provider is configured on its own and is the same for both response modes.
    const session = await prepareSession(intent, { now: opts.now, ...(opts.explainCaller !== undefined ? { caller: opts.explainCaller } : {}) });
    return { session: { ...session, mode: "v0_rules", fallbackReason: reason, ...(issue ? { fallbackIssue: issue } : {}), responseMode: requested, ...owner }, run: null };
  };
  if (requested === "server") return v0(null);

  // The provider is chosen by configuration only (AI_PROVIDER). Injected callers (tests) bypass it.
  const engine = opts.caller === undefined ? resolveEngine() : null;
  const caller = opts.caller === undefined ? (engine as NonNullable<typeof engine>).caller : opts.caller;
  if (!caller) return v0(engine?.unavailable ?? "no_api_key");
  const category = matchCategory(intent.productQuery);
  if (!category) return v0("no_catalog_match");
  const reachable = catalogForCategory(category).some((c) => c.minPriceCents + c.shippingCents <= intent.budgetCents && c.stock > 0);
  if (!reachable) return v0("budget_below_catalog");
  // A provider that is known to be limited, unavailable or rejecting our key is not tried again: straight to labelled server rules.
  const breaker = quotaBreakerInfo(engine?.provider ?? "gemini");
  if (breaker) {
    const issue = breakerIssue(breaker);
    return v0(breakerReason(issue), issue);
  }
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
    responseMode: "ai",
    ...owner,
  };
  // Only the real provider is paced; injected test callers are not.
  // Gemini is paced by a simple RPM window. Groq paces itself inside its adapter (per model, from the provider's headers).
  const limiter = engine?.provider === "gemini" && modelRpm() > 0 ? sharedRateLimiter(modelRpm()) : null;
  const meta = engine ? { provider: engine.provider, buyerModel: engine.agents.find((a) => a.role === "buyer")?.model ?? null, sellerModel: engine.agents.find((a) => a.role === "seller")?.model ?? null, explanationModel: engine.agents.find((a) => a.role === "explanation")?.model ?? null } : undefined;
  if (singleCallEngine()) return { session, run: () => runSingleCallNegotiation(sessionId, intent, category, caller, limiter) };
  return { session, run: () => runMultiAgentNegotiation(sessionId, intent, category, caller, { limiter, engine: meta }) };
}

/** A run that never finished (process killed, deadline) must not leave the session "negotiating" forever. */
export function isNegotiationStale(s: NegotiationSession, now = Date.now()): boolean {
  return s.status === "negotiating" && now - new Date(s.createdAt).getTime() > staleNegotiationMs();
}
