import { randomUUID } from "node:crypto";
import type { PaymentAttempt, PaymentStatus } from "@/shared/contracts/types";
import {
  PayPalHttpError,
  PayPalNetworkError,
  capturePayPalOrder,
  centsToValue,
  createPayPalOrder,
  getPayPalOrder,
  type PayPalOrder,
} from "./client";
import { getPaymentByOrderId, getPaymentsBySession, getSession, savePayment, withLock } from "@/server/db/store";
import { isOfferExpired, isSessionExpired } from "@/server/negotiation/service";

export class PaymentError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}

export interface Gateway {
  create: typeof createPayPalOrder;
  capture: typeof capturePayPalOrder;
  get: typeof getPayPalOrder;
}
export const realGateway: Gateway = { create: createPayPalOrder, capture: capturePayPalOrder, get: getPayPalOrder };

const REUSABLE: PaymentStatus[] = ["created", "approval_pending", "approved", "cancelled"];

export interface PublicPayment {
  paymentAttemptId: string;
  orderId: string | null;
  captureId: string | null;
  status: PaymentStatus;
  amountCents: number;
  currency: "EUR";
  updatedAt: string;
}

export const toPublic = (p: PaymentAttempt): PublicPayment => ({
  paymentAttemptId: p.paymentAttemptId,
  orderId: p.paypalOrderId,
  captureId: p.paypalCaptureId,
  status: p.status,
  amountCents: p.amountCents,
  currency: p.currency,
  updatedAt: p.updatedAt,
});

async function update(p: PaymentAttempt, patch: Partial<PaymentAttempt>): Promise<PaymentAttempt> {
  const next = { ...p, ...patch, updatedAt: new Date().toISOString() };
  await savePayment(next);
  return next;
}

/** Creates (or idempotently returns) the Sandbox order for the approved offer. The amount comes only from the stored offer. */
export async function createPaymentOrder(
  sessionId: string,
  requestedOfferId: string | undefined,
  gw: Gateway = realGateway,
): Promise<{ payment: PublicPayment; reused: boolean }> {
  return withLock(`pay:${sessionId}`, async () => {
    const session = await getSession(sessionId);
    if (!session) throw new PaymentError(404, "NOT_FOUND", "We couldn't find that negotiation.");
    if (isSessionExpired(session)) throw new PaymentError(410, "SESSION_EXPIRED", "Your demo session has expired.");
    // Auto-Buy negotiations are paid only through their mandate (payWithVault), never through the manual button.
    if (session.checkoutMode === "auto_buy") throw new PaymentError(409, "CHECKOUT_MODE_MISMATCH", "This negotiation is set to Agent Auto-Buy.");
    if (!session.approvedOfferId) {
      throw new PaymentError(403, "NOT_APPROVED", "Approve the deal before paying.");
    }
    if (requestedOfferId && requestedOfferId !== session.approvedOfferId) {
      throw new PaymentError(409, "OFFER_MISMATCH", "The selected deal has changed; please review it.");
    }
    const offer = session.offers.find((o) => o.offerId === session.approvedOfferId);
    if (!offer || !offer.eligible || offer.offerId !== session.recommendedOfferId) {
      throw new PaymentError(422, "OFFER_INELIGIBLE", "This offer isn't eligible.");
    }

    const attempts = await getPaymentsBySession(sessionId);
    if (attempts.some((a) => a.status === "completed")) {
      throw new PaymentError(409, "PAYPAL_ALREADY_CAPTURED", "This Sandbox payment is already complete.");
    }
    const reusable = attempts.find((a) => a.paypalOrderId && REUSABLE.includes(a.status) && a.offerId === offer.offerId);
    if (reusable) return { payment: toPublic(reusable), reused: true };

    if (isOfferExpired(session, offer.offerId)) {
      throw new PaymentError(410, "OFFER_EXPIRED", "This demo offer has expired.");
    }

    const now = new Date().toISOString();
    let attempt: PaymentAttempt = {
      paymentAttemptId: `pay_${randomUUID()}`,
      sessionId,
      offerId: offer.offerId,
      amountCents: offer.finalPriceCents,
      currency: "EUR",
      status: "creating",
      paypalOrderId: null,
      paypalCaptureId: null,
      createRequestId: randomUUID(),
      captureRequestId: randomUUID(),
      createdAt: now,
      updatedAt: now,
      failureCode: null,
      ownerId: session.ownerId ?? null,
    };
    await savePayment(attempt);
    try {
      const order = await gw.create({
        amountCents: attempt.amountCents,
        description: `AgentD Sandbox test: ${offer.productLabel}`,
        customId: attempt.paymentAttemptId,
        requestId: attempt.createRequestId,
      });
      attempt = await update(attempt, { paypalOrderId: order.id, status: "approval_pending" });
      return { payment: toPublic(attempt), reused: false };
    } catch (e) {
      await update(attempt, { status: "failed", failureCode: errCode(e) });
      throw new PaymentError(502, "PAYPAL_UNAVAILABLE", "Payment couldn't be started in Sandbox.", true);
    }
  });
}

function errCode(e: unknown): string {
  if (e instanceof PayPalHttpError) return `HTTP_${e.status}_${e.issue ?? "UNKNOWN"}`.slice(0, 80);
  if (e instanceof PayPalNetworkError) return "NETWORK";
  return "INTERNAL";
}

/** Server-side proof that PayPal captured exactly what we asked for. */
function verifiedCapture(order: PayPalOrder, attempt: PaymentAttempt): { captureId: string } | "mismatch" | null {
  const unit = order.purchase_units?.[0];
  const cap = unit?.payments?.captures?.find((c) => c.status === "COMPLETED");
  if (order.status !== "COMPLETED" || !cap) return null;
  const expected = centsToValue(attempt.amountCents);
  if (cap.amount.currency_code !== attempt.currency || cap.amount.value !== expected) return "mismatch";
  if (unit?.custom_id && unit.custom_id !== attempt.paymentAttemptId) return "mismatch";
  return { captureId: cap.id };
}

async function settle(attempt: PaymentAttempt, order: PayPalOrder): Promise<PaymentAttempt | null> {
  const v = verifiedCapture(order, attempt);
  if (v === null) return null;
  if (v === "mismatch") {
    return update(attempt, { status: "unknown_pending_reconciliation", failureCode: "AMOUNT_MISMATCH" });
  }
  return update(attempt, { status: "completed", paypalCaptureId: v.captureId, failureCode: null });
}

/** Captures an approved order. Safe to call repeatedly: a completed payment is returned as-is. */
export async function captureOrder(orderId: string, gw: Gateway = realGateway): Promise<PublicPayment> {
  return withLock(`order:${orderId}`, async () => {
    let attempt = await getPaymentByOrderId(orderId);
    if (!attempt) throw new PaymentError(404, "NOT_FOUND", "Unknown payment.");
    if (attempt.status === "completed") return toPublic(attempt);
    if (attempt.checkoutMode === "auto_buy") throw new PaymentError(409, "CHECKOUT_MODE_MISMATCH", "This payment is handled by Agent Auto-Buy.");

    const siblings = await getPaymentsBySession(attempt.sessionId);
    if (siblings.some((s) => s.status === "completed" && s.paymentAttemptId !== attempt!.paymentAttemptId)) {
      throw new PaymentError(409, "PAYPAL_ALREADY_CAPTURED", "This Sandbox payment is already complete.");
    }
    const session = await getSession(attempt.sessionId);
    if (!session || session.approvedOfferId !== attempt.offerId) {
      throw new PaymentError(409, "OFFER_MISMATCH", "The selected deal has changed; please review it.");
    }

    attempt = await update(attempt, { status: "capturing" });
    try {
      const order = await gw.capture(orderId, attempt.captureRequestId);
      const settled = await settle(attempt, order);
      if (!settled) {
        await update(attempt, { status: "unknown_pending_reconciliation", failureCode: `STATUS_${order.status}` });
        throw new PaymentError(502, "PAYPAL_UNCONFIRMED", "We couldn't confirm the payment yet.", true);
      }
      if (settled.status !== "completed") {
        throw new PaymentError(502, "PAYPAL_UNCONFIRMED", "We couldn't confirm the payment yet.", true);
      }
      return toPublic(settled);
    } catch (e) {
      if (e instanceof PaymentError) throw e;
      if (e instanceof PayPalHttpError) {
        if (e.issue === "ORDER_ALREADY_CAPTURED") {
          // Already captured on PayPal's side: verify instead of repeating.
          try {
            const settled = await settle(attempt, await gw.get(orderId));
            if (settled?.status === "completed") return toPublic(settled);
          } catch {
            /* fall through to unconfirmed */
          }
          await update(attempt, { status: "unknown_pending_reconciliation", failureCode: "ALREADY_CAPTURED_UNVERIFIED" });
          throw new PaymentError(502, "PAYPAL_UNCONFIRMED", "We couldn't confirm the payment yet.", true);
        }
        if (e.issue === "ORDER_NOT_APPROVED" || e.issue === "PAYER_ACTION_REQUIRED") {
          await update(attempt, { status: "approval_pending", failureCode: null });
          throw new PaymentError(422, "PAYPAL_NOT_APPROVED", "Complete approval in PayPal to continue.");
        }
        await update(attempt, { status: "failed", failureCode: errCode(e) });
        throw new PaymentError(422, "PAYPAL_FAILED", "Payment couldn't be completed in Sandbox.");
      }
      // Timeout / 5xx: outcome unknown. Never declare success or failure.
      await update(attempt, { status: "unknown_pending_reconciliation", failureCode: errCode(e) });
      throw new PaymentError(502, "PAYPAL_UNCONFIRMED", "We couldn't confirm the payment yet.", true);
    }
  });
}

/** Returns persisted status, reconciling with PayPal when the outcome is uncertain. */
export async function getPaymentStatus(orderId: string, gw: Gateway = realGateway): Promise<PublicPayment> {
  return withLock(`order:${orderId}`, async () => {
    const attempt = await getPaymentByOrderId(orderId);
    if (!attempt) throw new PaymentError(404, "NOT_FOUND", "Unknown payment.");
    const uncertain: PaymentStatus[] = ["capturing", "unknown_pending_reconciliation"];
    if (!uncertain.includes(attempt.status)) return toPublic(attempt);
    try {
      const settled = await settle(attempt, await gw.get(orderId));
      return toPublic(settled ?? attempt);
    } catch {
      throw new PaymentError(502, "PAYPAL_UNCONFIRMED", "We couldn't confirm the payment yet.", true);
    }
  });
}

/* ---------- V5 Auto-Buy: the same validators and idempotency, charging a vaulted PayPal method the buyer authorised earlier ---------- */

export type VaultedOutcome =
  | { kind: "completed"; payment: PublicPayment }
  /** PayPal refused, or needs the buyer. Nothing was charged. `payerAction` = PayPal wants an interaction we must not fake. */
  | { kind: "failed"; code: string; payment: PublicPayment | null; payerAction: boolean }
  /** The outcome on PayPal's side is unknown: never declared paid or failed, only reconciled. */
  | { kind: "uncertain"; payment: PublicPayment | null };

/**
 * Creates (once) and verifies the Sandbox payment for a mandate. The amount comes only from the stored offer; the order
 * is created with the buyer's vaulted token; the capture is verified exactly like a manual one (status, currency,
 * amount, custom_id). A second call for the same mandate never creates a second order: it resumes the first.
 */
export async function payWithVault(
  args: { sessionId: string; offerId: string; mandateId: string; vaultId: string },
  gw: Gateway = realGateway,
): Promise<VaultedOutcome> {
  return withLock(`pay:${args.sessionId}`, async () => {
    const session = await getSession(args.sessionId);
    if (!session) throw new PaymentError(404, "NOT_FOUND", "We couldn't find that negotiation.");
    if (isSessionExpired(session)) throw new PaymentError(410, "SESSION_EXPIRED", "Your demo session has expired.");
    if (session.checkoutMode !== "auto_buy" || session.mandateId !== args.mandateId) {
      throw new PaymentError(409, "CHECKOUT_MODE_MISMATCH", "This negotiation is not set to Agent Auto-Buy.");
    }
    if (session.approvedBy !== "mandate" || session.approvedOfferId !== args.offerId) {
      throw new PaymentError(403, "NOT_APPROVED", "The mandate has not approved this offer.");
    }
    const offer = session.offers.find((o) => o.offerId === args.offerId);
    if (!offer || !offer.eligible || offer.offerId !== session.recommendedOfferId) {
      throw new PaymentError(422, "OFFER_INELIGIBLE", "This offer isn't eligible.");
    }

    const attempts = await getPaymentsBySession(args.sessionId);
    const mine = attempts.find((a) => a.mandateId === args.mandateId);
    if (attempts.some((a) => a.status === "completed" && a.paymentAttemptId !== mine?.paymentAttemptId)) {
      throw new PaymentError(409, "PAYPAL_ALREADY_CAPTURED", "This Sandbox payment is already complete.");
    }
    if (mine) return resumeVaulted(mine, args.vaultId, offer.productLabel, gw);

    if (isOfferExpired(session, offer.offerId)) throw new PaymentError(410, "OFFER_EXPIRED", "This demo offer has expired.");

    const now = new Date().toISOString();
    const attempt: PaymentAttempt = {
      paymentAttemptId: `pay_${randomUUID()}`,
      sessionId: args.sessionId,
      offerId: offer.offerId,
      amountCents: offer.finalPriceCents,
      currency: "EUR",
      status: "creating",
      paypalOrderId: null,
      paypalCaptureId: null,
      createRequestId: randomUUID(),
      captureRequestId: randomUUID(),
      createdAt: now,
      updatedAt: now,
      failureCode: null,
      ownerId: session.ownerId ?? null,
      checkoutMode: "auto_buy",
      mandateId: args.mandateId,
    };
    // Saved BEFORE calling PayPal: if anything below dies, a retry finds this record instead of creating a second order.
    await savePayment(attempt);
    return createAndSettle(attempt, args.vaultId, offer.productLabel, gw);
  });
}

async function createAndSettle(attempt: PaymentAttempt, vaultId: string, label: string, gw: Gateway): Promise<VaultedOutcome> {
  let order: PayPalOrder;
  try {
    order = await gw.create({
      amountCents: attempt.amountCents,
      description: `AgentD Sandbox Auto-Buy: ${label}`,
      customId: attempt.paymentAttemptId,
      // Same PayPal-Request-Id on every retry: PayPal returns the original order instead of creating another.
      requestId: attempt.createRequestId,
      vaultId,
    });
  } catch (e) {
    if (e instanceof PayPalHttpError) {
      const failed = await update(attempt, { status: "failed", failureCode: errCode(e) });
      return { kind: "failed", code: failed.failureCode ?? "PAYPAL_FAILED", payment: toPublic(failed), payerAction: e.issue === "PAYER_ACTION_REQUIRED" };
    }
    const unknown = await update(attempt, { status: "unknown_pending_reconciliation", failureCode: errCode(e) });
    return { kind: "uncertain", payment: toPublic(unknown) };
  }
  attempt = await update(attempt, { paypalOrderId: order.id, status: "approval_pending" });
  return settleVaultedOrder(attempt, order, gw);
}

async function settleVaultedOrder(attempt: PaymentAttempt, order: PayPalOrder, gw: Gateway): Promise<VaultedOutcome> {
  if (order.status === "PAYER_ACTION_REQUIRED") {
    // PayPal wants the buyer present (e.g. a fresh authentication). We never fake that interaction: stop.
    const failed = await update(attempt, { status: "failed", failureCode: "PAYER_ACTION_REQUIRED" });
    return { kind: "failed", code: "PAYER_ACTION_REQUIRED", payment: toPublic(failed), payerAction: true };
  }
  let current = order;
  if (order.status === "APPROVED") {
    attempt = await update(attempt, { status: "capturing" });
    try {
      current = await gw.capture(order.id, attempt.captureRequestId);
    } catch (e) {
      if (e instanceof PayPalHttpError && e.issue !== "ORDER_ALREADY_CAPTURED") {
        const failed = await update(attempt, { status: "failed", failureCode: errCode(e) });
        return { kind: "failed", code: failed.failureCode ?? "PAYPAL_FAILED", payment: toPublic(failed), payerAction: e.issue === "PAYER_ACTION_REQUIRED" };
      }
      const unknown = await update(attempt, { status: "unknown_pending_reconciliation", failureCode: errCode(e) });
      return { kind: "uncertain", payment: toPublic(unknown) };
    }
  }
  const settled = await settle(attempt, current);
  if (settled?.status === "completed") return { kind: "completed", payment: toPublic(settled) };
  const unknown = settled ?? (await update(attempt, { status: "unknown_pending_reconciliation", failureCode: `STATUS_${current.status}` }));
  return { kind: "uncertain", payment: toPublic(unknown) };
}

async function resumeVaulted(attempt: PaymentAttempt, vaultId: string, label: string, gw: Gateway): Promise<VaultedOutcome> {
  if (attempt.status === "completed") return { kind: "completed", payment: toPublic(attempt) };
  if (attempt.status === "failed") return { kind: "failed", code: attempt.failureCode ?? "PAYPAL_FAILED", payment: toPublic(attempt), payerAction: attempt.failureCode === "PAYER_ACTION_REQUIRED" };
  if (!attempt.paypalOrderId) return createAndSettle(attempt, vaultId, label, gw);
  try {
    return await settleVaultedOrder(attempt, await gw.get(attempt.paypalOrderId), gw);
  } catch {
    return { kind: "uncertain", payment: toPublic(attempt) };
  }
}
