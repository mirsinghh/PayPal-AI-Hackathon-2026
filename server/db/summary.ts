import type { NegotiationSession, PaymentAttempt } from "@/shared/contracts/types";

/**
 * Flat, queryable columns derived from a session or payment. The full object stays in `data` (jsonb); these columns exist
 * so the profile can list history without loading every event, and so Row Level Security can match on `user_id`.
 * One `sessions` row is the request + its analysis + its negotiation: the existing model, not three duplicated tables.
 */
export function sessionRow(s: NegotiationSession): Record<string, unknown> {
  const winner = (s.offers ?? []).find((o) => o.offerId === s.recommendedOfferId) ?? null;
  const ev = s.evaluation;
  return {
    id: s.sessionId,
    data: s,
    expires_at: s.expiresAt,
    user_id: s.ownerId ?? null,
    product_query: s.intent?.productQuery ?? null,
    budget_cents: s.intent?.budgetCents ?? null,
    priority: s.intent?.priority ?? null,
    status: s.status,
    response_mode: s.responseMode ?? null,
    engine_mode: s.mode ?? "v0_rules",
    fallback_reason: s.fallbackReason ?? null,
    analysis_source: ev?.source ?? null,
    analysis_provider: ev?.provider ?? null,
    analysis_model: ev?.modelName ?? null,
    analysis_summary: ev?.aiSummary ? ev.aiSummary.slice(0, 500) : null,
    offer_count: (s.offers ?? []).length,
    winner_seller: winner ? winner.sellerId : null,
    winner_product: winner ? winner.productLabel : null,
    initial_price_cents: winner ? winner.initialPriceCents : null,
    final_price_cents: winner ? winner.finalPriceCents : null,
    savings_cents: winner && winner.eligible ? Math.max(0, winner.initialPriceCents - winner.finalPriceCents) : null,
    approved_offer_id: s.approvedOfferId,
  };
}

/** Columns that exist since the original schema: used to retry a write if the V5 migration has not been run yet. */
export const LEGACY_SESSION_COLUMNS = ["id", "data", "expires_at"] as const;

export function paymentRow(p: PaymentAttempt): Record<string, unknown> {
  return {
    id: p.paymentAttemptId,
    session_id: p.sessionId,
    paypal_order_id: p.paypalOrderId,
    data: p,
    updated_at: p.updatedAt,
    user_id: p.ownerId ?? null,
    status: p.status,
    amount_cents: p.amountCents,
    currency: p.currency,
  };
}
export const LEGACY_PAYMENT_COLUMNS = ["id", "session_id", "paypal_order_id", "data", "updated_at"] as const;
