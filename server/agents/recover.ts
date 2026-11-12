import { SELLER_IDS, type AgentRunMeta, type EventPhase, type EventType, type NegotiationEvent, type NegotiationSession, type SellerId } from "@/shared/contracts/types";
import { formatEur } from "@/shared/format";
import { rulesFallback } from "@/server/ai/explain";
import { getSession, saveSession, withLock } from "@/server/db/store";
import { rankOffers } from "@/server/negotiation/ranking";
import { isNegotiationStale } from "@/server/negotiation/service";
import { SELLER_PROFILES } from "./catalog";

/**
 * A live run can be killed by the platform (function limit, instance recycled) after the HTTP response was sent. Its events
 * are already persisted, so instead of throwing the negotiation away the server finishes it deterministically from what
 * was confirmed:
 *  - the offers and events that exist stay exactly as they are (nothing is restarted, repeated or rewritten);
 *  - only the missing closing steps are added (checks, scores, winner), with the SAME event keys a finished run uses, so if
 *    the original run were somehow still alive it cannot append a duplicate;
 *  - the closing choice and explanation are rules-based and labelled as such, never attributed to the AI;
 *  - budget, preferences and policies are untouched; nothing is paid or approved.
 * With fewer than four confirmed offers there is not enough to rank honestly, so the session is closed as failed instead.
 */
export async function recoverInterruptedNegotiation(sessionId: string, now: number = Date.now()): Promise<NegotiationSession | null> {
  return withLock(`session:${sessionId}`, async () => {
    const s = await getSession(sessionId);
    if (!s) return null;
    if (!isNegotiationStale(s, now)) return s;
    const closed = completeWithRules(s, now);
    await saveSession(closed);
    return closed;
  });
}

const eid = (s: NegotiationSession, key: string) => `evt_${s.sessionId.replace(/^ses_/, "")}_${key}`;

/** Pure: returns the session finished with server rules (or failed when nothing honest can be ranked). Does not save. */
export function completeWithRules(input: NegotiationSession, now: number = Date.now()): NegotiationSession {
  const s: NegotiationSession = structuredClone(input);
  let at = s.events.reduce((m, e) => Math.max(m, e.atMs), 0);
  const push = (key: string, phase: EventPhase, type: EventType, sellerId: SellerId | null, payload: Record<string, unknown>, feedText: string) => {
    const eventId = eid(s, key);
    if (s.events.some((e) => e.eventId === eventId)) return; // already confirmed: never repeated
    at += 400;
    const ev: NegotiationEvent = { eventId, sessionId: s.sessionId, sequence: s.events.length, atMs: at, phase, type, sellerId, payload, feedText };
    s.events.push(ev);
  };
  const aiTurns = s.events.filter((e) => ["groq", "gemini", "llm"].includes(String(e.payload.source))).length;
  const meta = (): AgentRunMeta => ({
    ...(s.agentRun ?? {
      model: null,
      startedAt: s.createdAt,
      finishedAt: null,
      llmCallsAttempted: aiTurns,
      llmCallsSucceeded: aiTurns,
      fallbackCount: 0,
      rejectedProposals: 0,
      inputTokens: 0,
      outputTokens: 0,
      stoppedReason: null,
      buyerChoseTopRanked: null,
    }),
    finishedAt: new Date(now).toISOString(),
    stoppedReason: "interrupted",
    endedReason: "interrupted",
    recoveredWithRules: true,
  });

  const offers = [...s.offers].sort((a, b) => SELLER_IDS.indexOf(a.sellerId) - SELLER_IDS.indexOf(b.sellerId));
  const eligible = offers.filter((o) => o.eligible);
  if (offers.length < SELLER_IDS.length || eligible.length === 0) {
    push("complete", "complete", "NEGOTIATION_COMPLETE", null, { outcome: offers.length < SELLER_IDS.length ? "interrupted_before_offers" : "no_offer_within_budget" }, offers.length < SELLER_IDS.length ? "The negotiation was interrupted before every store had made an offer. Nothing can be paid." : "Negotiation ended: no seller reached your budget. Nothing can be paid.");
    s.status = "failed";
    s.aiStatus = "failed";
    s.agentRun = meta();
    return s;
  }

  for (const o of offers) {
    const brand = SELLER_PROFILES[o.sellerId].brand;
    const within = o.finalPriceCents <= s.intent.budgetCents;
    push(`ver_${o.sellerId}`, "evaluate", "REQUIREMENT_VERIFIED", o.sellerId, { offerId: o.offerId, requirement: "within_budget", passed: within }, `${brand}: server check ${within ? "passed" : "failed"} — total ${formatEur(o.finalPriceCents)} vs budget ${formatEur(s.intent.budgetCents)}.`);
  }
  const ranking = rankOffers(offers, s.intent.priority);
  const f = rulesFallback(s.intent, offers, ranking);
  push("fb_recover", "negotiate", "AGENT_FALLBACK", null, { agent: "buyer", reason: "interrupted", cause: "interrupted", source: "rules_fallback" }, "The AI run was interrupted; the negotiation was finished with server rules from the offers already confirmed.");
  for (const o of offers) {
    const brand = SELLER_PROFILES[o.sellerId].brand;
    if (o.eligible) push(`evl_${o.sellerId}`, "evaluate", "OFFER_EVALUATED", o.sellerId, { offerId: o.offerId, score: ranking.scores[o.offerId], reason: "eligible" }, `${brand} scored ${ranking.scores[o.offerId]}/100 for your priorities.`);
    else push(`evl_${o.sellerId}`, "evaluate", "SELLER_REJECTED", o.sellerId, { offerId: o.offerId, reasonCode: o.ineligibilityReasons[0] ?? "ineligible" }, `${brand} was set aside: ${o.ineligibilityReasons.join(", ")}.`);
  }
  const chosen = offers.find((o) => o.offerId === ranking.recommendedOfferId)!;
  push("final_buyer", "evaluate", "BUYER_DECISION", null, { final: true, offerId: chosen.offerId, source: "rules_fallback", model: null, provider: null, latencyMs: null }, `Your agent's choice: ${f.summary}`);
  push("winner", "complete", "WINNER_SELECTED", chosen.sellerId, { offerId: chosen.offerId, reason: "best_match" }, `Best match for your preferences: ${SELLER_PROFILES[chosen.sellerId].brand} at ${formatEur(chosen.finalPriceCents)}.`);
  push("complete", "complete", "NEGOTIATION_COMPLETE", null, { recommendedOfferId: chosen.offerId, outcome: "ok" }, "Negotiation complete. Review the deal before paying.");

  s.offers = offers;
  s.recommendedOfferId = chosen.offerId;
  s.evaluation = {
    evaluationId: s.evaluation?.evaluationId ?? `eval_${s.sessionId}`,
    sessionId: s.sessionId,
    rankedOfferIds: ranking.rankedOfferIds,
    recommendedOfferId: chosen.offerId,
    scores: ranking.scores,
    aiSummary: f.summary,
    aiReasons: f.reasons,
    tradeoffs: f.tradeoffs,
    source: "rules_fallback",
    modelName: null,
    provider: null,
    validatedAt: new Date(now).toISOString(),
  };
  s.aiStatus = "fallback";
  s.status = "ready";
  const m = meta();
  s.agentRun = { ...m, fallbackCount: m.fallbackCount + 1, fallbackCauses: { ...(m.fallbackCauses ?? {}), interrupted: (m.fallbackCauses?.interrupted ?? 0) + 1 } };
  return s;
}
