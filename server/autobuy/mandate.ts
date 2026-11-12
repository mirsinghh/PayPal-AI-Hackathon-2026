import { randomUUID } from "node:crypto";
import {
  MANDATE_AUTHORIZATION_TEXT,
  MANDATE_TEXT_VERSION,
  MANDATE_TTL_MS,
  type MandateEvidence,
  type MandateStatus,
  type NegotiationSession,
  type Offer,
  type PaymentMethodAuth,
  type Preference,
  type PublicMandate,
  type PurchaseMandate,
} from "@/shared/contracts/types";
import { casMandate, getMandate, saveMandate } from "@/server/db/store";

/**
 * The purchase mandate: what the user pre-authorised Agent D to buy. It is created by the server from the verified
 * login and the negotiation's own intent (the client cannot send a different budget or conditions), it is immutable,
 * it allows exactly one purchase, and only the server decides whether the offer inside it may be bought.
 * The AI never sees it: Groq/Gemini only write the negotiation, they have no access to mandates or tokens.
 */

/** "Fast delivery" as a mandatory condition means at most this many days. */
export const FAST_DELIVERY_MAX_DAYS = 3;

export class MandateError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const at = (status: MandateStatus, type: string, detail?: string): MandateEvidence => ({ at: new Date().toISOString(), type, status, ...(detail ? { detail } : {}) });

export function toPublicMandate(m: PurchaseMandate): PublicMandate {
  const { ownerId: _owner, ...rest } = m;
  void _owner;
  return rest;
}

/** Builds (does not save) the mandate for a freshly created Auto-Buy negotiation. */
export function buildMandate(args: {
  session: NegotiationSession;
  ownerId: string;
  method: Pick<PaymentMethodAuth, "methodId" | "payerEmail">;
  authorizationText: string;
  now?: Date;
}): PurchaseMandate {
  // The consent must be the exact sentence the user was shown. Anything else (or nothing) is no consent.
  if (args.authorizationText !== MANDATE_AUTHORIZATION_TEXT) {
    throw new MandateError(400, "CONSENT_REQUIRED", "Confirm the authorisation to turn on Agent Auto-Buy.");
  }
  const now = args.now ?? new Date();
  const { intent, sessionId } = args.session;
  const sessionEnd = new Date(args.session.expiresAt).getTime();
  const iso = now.toISOString();
  return {
    mandateId: `man_${randomUUID()}`,
    ownerId: args.ownerId,
    sessionId,
    productQuery: intent.productQuery,
    budgetCents: intent.budgetCents,
    currency: "EUR",
    priority: intent.priority,
    requiredConditions: [...intent.preferences],
    maxPurchases: 1,
    paymentMethodId: args.method.methodId,
    paymentMethodLabel: args.method.payerEmail ? `PayPal Sandbox · ${args.method.payerEmail}` : "PayPal Sandbox",
    authorizationText: args.authorizationText,
    authorizationTextVersion: MANDATE_TEXT_VERSION,
    consentedAt: iso,
    createdAt: iso,
    expiresAt: new Date(Math.min(now.getTime() + MANDATE_TTL_MS, sessionEnd)).toISOString(),
    status: "active",
    updatedAt: iso,
    offerId: null,
    paymentAttemptId: null,
    failureCode: null,
    evidence: [at("active", "mandate_authorized", `budget ${intent.budgetCents} cents, conditions: ${intent.preferences.join(", ") || "none"}`)],
  };
}

export function conditionMet(c: Preference, o: Offer): boolean {
  switch (c) {
    case "warranty":
      return o.warrantyMonths > 0;
    case "free_shipping":
      return o.freeShipping === true && (o.catalog ? o.catalog.shippingCents === 0 : true);
    case "fast_delivery":
      return o.deliveryDays <= FAST_DELIVERY_MAX_DAYS;
  }
}

export type MandateCheck = { ok: true; offer: Offer } | { ok: false; code: string; message: string; terminal: "expired" | "blocked" | "wait" };

/**
 * Pure decision: may THIS mandate buy THIS session's recommended offer right now? Every rule here is a hard stop;
 * nothing is negotiable and no model is involved.
 */
export function evaluateMandate(mandate: PurchaseMandate, session: NegotiationSession, now = new Date()): MandateCheck {
  const block = (code: string, message: string): MandateCheck => ({ ok: false, code, message, terminal: "blocked" });
  if (mandate.status !== "active") return block("MANDATE_NOT_ACTIVE", "This authorisation is no longer active.");
  if (new Date(mandate.expiresAt).getTime() <= now.getTime()) return { ok: false, code: "MANDATE_EXPIRED", message: "The authorisation expired before the purchase.", terminal: "expired" };
  if (session.sessionId !== mandate.sessionId || session.mandateId !== mandate.mandateId || session.ownerId !== mandate.ownerId || session.checkoutMode !== "auto_buy") {
    return block("MANDATE_SESSION_MISMATCH", "This authorisation belongs to a different negotiation.");
  }
  if (session.status === "negotiating" || session.status === "preparing") return { ok: false, code: "NEGOTIATION_NOT_READY", message: "The negotiation has not finished yet.", terminal: "wait" };
  if (session.status === "failed") return block("NEGOTIATION_FAILED", "The negotiation produced no offer, so nothing was bought.");
  // The mandate can never be wider than the negotiation it was made for.
  if (mandate.budgetCents !== session.intent.budgetCents || mandate.productQuery !== session.intent.productQuery) {
    return block("MANDATE_INTENT_MISMATCH", "The authorisation does not match this request.");
  }
  const offer = session.offers.find((o) => o.offerId === session.recommendedOfferId);
  if (!offer) return block("NO_RECOMMENDED_OFFER", "There is no recommended offer to buy.");
  if (!offer.eligible) return block("OFFER_INELIGIBLE", "The recommended offer is not eligible, so Agent D did not buy it.");
  if (new Date(offer.offerExpiresAt).getTime() <= now.getTime()) return block("OFFER_EXPIRED", "The offer expired before Agent D could buy it.");
  if (!Number.isSafeInteger(offer.finalPriceCents) || offer.finalPriceCents <= 0) return block("INVALID_AMOUNT", "The offer amount is not valid.");
  if (offer.finalPriceCents > mandate.budgetCents) return block("OVER_BUDGET", "The offer is above the budget you authorised, so Agent D did not buy it.");
  const unmet = mandate.requiredConditions.filter((c) => !conditionMet(c, offer));
  if (unmet.length > 0) return block("CONDITION_NOT_MET", `The offer does not meet a condition you required (${unmet.join(", ").replace(/_/g, " ")}).`);
  return { ok: true, offer };
}

/** Writes a mandate transition, but only if nobody else moved it first. Returns the new mandate or null when it lost the race. */
export async function transition(m: PurchaseMandate, to: MandateStatus, type: string, patch: Partial<PurchaseMandate> = {}, detail?: string): Promise<PurchaseMandate | null> {
  const next: PurchaseMandate = { ...m, ...patch, status: to, updatedAt: new Date().toISOString(), evidence: [...m.evidence, at(to, type, detail)] };
  return (await casMandate(m.status, next)) ? next : null;
}

/** Cancels a mandate that has not been executed. Returns false when it was no longer cancellable. */
export async function cancelMandateRecord(m: PurchaseMandate, reason: string): Promise<boolean> {
  if (m.status !== "active") return false;
  return (await transition(m, "cancelled", "mandate_cancelled", {}, reason)) !== null;
}

export async function cancelMandate(ownerId: string, mandateId: string): Promise<PurchaseMandate> {
  const m = await getMandate(mandateId);
  if (!m || m.ownerId !== ownerId) throw new MandateError(404, "NOT_FOUND", "We couldn't find that authorisation.");
  if (m.status === "cancelled") return m;
  if (m.status !== "active") throw new MandateError(409, "MANDATE_NOT_CANCELLABLE", "This authorisation was already used or has ended, so it can't be cancelled.");
  const next = await transition(m, "cancelled", "mandate_cancelled", {}, "cancelled_by_user");
  if (!next) throw new MandateError(409, "MANDATE_NOT_CANCELLABLE", "This authorisation was just used, so it can't be cancelled.");
  return next;
}

export async function loadOwnedMandate(ownerId: string, mandateId: string): Promise<PurchaseMandate> {
  const m = await getMandate(mandateId);
  if (!m || m.ownerId !== ownerId) throw new MandateError(404, "NOT_FOUND", "We couldn't find that authorisation.");
  return m;
}

export { saveMandate };
