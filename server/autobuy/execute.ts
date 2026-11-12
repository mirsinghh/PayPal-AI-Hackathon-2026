import type { Offer, PublicMandate, PurchaseMandate } from "@/shared/contracts/types";
import { getMandate, getPaymentMethod, getPaymentsBySession, getSession, saveSession, withLock } from "@/server/db/store";
import { PaymentError, payWithVault, realGateway, toPublic, type Gateway, type PublicPayment } from "@/server/paypal/payments";
import { evaluateMandate, toPublicMandate, transition } from "./mandate";
import { vaultTokenFor } from "./methods";

/**
 * Agent Auto-Buy execution. The AI proposes the negotiation; THIS code, using only server-held facts, decides whether the
 * pre-authorised mandate allows buying the server-ranked offer, and then drives the same payment machinery as manual
 * checkout (amount from the stored offer, idempotent create, verified capture, reconciliation of uncertain results).
 *
 *   outcome "completed"   the capture was verified by the server
 *   outcome "blocked"     a mandate rule said no (over budget, ineligible, expired offer, condition...). Nothing charged.
 *   outcome "failed"      PayPal refused or needs the buyer. Nothing charged. We never fake that interaction.
 *   outcome "uncertain"   PayPal's result is unknown: reconciled by calling again, never re-charged
 *   outcome "waiting"     the negotiation has not finished; the mandate stays active
 *   outcome "in_progress" another request is executing this mandate right now
 */
export type AutoBuyOutcome = "completed" | "blocked" | "failed" | "uncertain" | "waiting" | "in_progress" | "cancelled" | "expired";

export interface AutoBuyResult {
  outcome: AutoBuyOutcome;
  code: string | null;
  message: string | null;
  mandate: PublicMandate;
  payment: PublicPayment | null;
  offer: Offer | null;
}

export class AutoBuyError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** A claim older than this with no payment attempt belongs to a crashed request and may be resumed. */
const STALE_CLAIM_MS = 60_000;

export async function executeAutoBuy(args: { sessionId: string; ownerId: string }, gw: Gateway = realGateway, nowFn: () => Date = () => new Date()): Promise<AutoBuyResult> {
  return withLock(`autobuy:${args.sessionId}`, async () => {
    const session = await getSession(args.sessionId);
    // Someone else's negotiation looks exactly like a missing one.
    if (!session || !session.ownerId || session.ownerId !== args.ownerId) throw new AutoBuyError(404, "NOT_FOUND", "We couldn't find that negotiation.");
    if (session.checkoutMode !== "auto_buy" || !session.mandateId) throw new AutoBuyError(409, "NOT_AUTO_BUY", "This negotiation is not set to Agent Auto-Buy.");
    let mandate = await getMandate(session.mandateId);
    if (!mandate || mandate.ownerId !== args.ownerId || mandate.sessionId !== session.sessionId) throw new AutoBuyError(404, "NOT_FOUND", "We couldn't find that authorisation.");

    const offerOf = (id: string | null) => session.offers.find((o) => o.offerId === id) ?? null;
    const done = (outcome: AutoBuyOutcome, m: PurchaseMandate, over: Partial<AutoBuyResult> = {}): AutoBuyResult => ({
      outcome,
      code: null,
      message: null,
      mandate: toPublicMandate(m),
      payment: null,
      offer: offerOf(m.offerId),
      ...over,
    });
    const paymentOf = async (m: PurchaseMandate): Promise<PublicPayment | null> => {
      const a = (await getPaymentsBySession(m.sessionId)).find((p) => p.mandateId === m.mandateId);
      return a ? toPublic(a) : null;
    };

    // ---- Settled or in-flight mandates: never start a second purchase ----
    switch (mandate.status) {
      case "executed":
        return done("completed", mandate, { payment: await paymentOf(mandate) });
      case "cancelled":
        return done("cancelled", mandate, { code: "MANDATE_CANCELLED", message: "You cancelled this authorisation, so Agent D did not buy anything." });
      case "expired":
        return done("expired", mandate, { code: "MANDATE_EXPIRED", message: "The authorisation expired before the purchase." });
      case "blocked":
        return done("blocked", mandate, { code: mandate.failureCode, message: "Agent D did not buy: the offer did not satisfy your authorisation.", payment: await paymentOf(mandate) });
      case "failed":
        return done("failed", mandate, { code: mandate.failureCode, message: "PayPal did not complete the payment. Nothing was charged.", payment: await paymentOf(mandate) });
      case "executing":
      case "pending_reconciliation": {
        const payment = await paymentOf(mandate);
        const stale = nowFn().getTime() - new Date(mandate.updatedAt).getTime() > STALE_CLAIM_MS;
        if (mandate.status === "executing" && !payment && !stale) return done("in_progress", mandate, { message: "Agent D is already processing this purchase." });
        return finish(mandate, session.sessionId, args.ownerId, session.approvedOfferId, gw, done);
      }
      case "active":
        break;
    }

    // ---- Active: decide whether the mandate allows the purchase ----
    const check = evaluateMandate(mandate, session, nowFn());
    if (!check.ok) {
      if (check.terminal === "wait") return done("waiting", mandate, { code: check.code, message: check.message });
      const to = check.terminal === "expired" ? "expired" : "blocked";
      const next = await transition(mandate, to, `mandate_${to}`, { failureCode: check.code }, check.message);
      return done(to === "expired" ? "expired" : "blocked", next ?? mandate, { code: check.code, message: check.message });
    }
    const method = await getPaymentMethod(mandate.paymentMethodId);
    if (!method || method.ownerId !== args.ownerId || method.status !== "active") {
      const next = await transition(mandate, "blocked", "mandate_blocked", { failureCode: "AUTHORIZATION_REVOKED" }, "PayPal authorisation is no longer active");
      return done("blocked", next ?? mandate, { code: "AUTHORIZATION_REVOKED", message: "Your PayPal authorisation is no longer active, so Agent D did not buy." });
    }

    // ---- Claim: exactly one execution can move active -> executing ----
    const claimed = await transition(mandate, "executing", "execution_claimed", { offerId: check.offer.offerId });
    if (!claimed) {
      // Lost the race: either another execution claimed it, or the user cancelled in the same instant. Say which.
      const now = (await getMandate(mandate.mandateId)) ?? mandate;
      if (now.status === "cancelled") return done("cancelled", now, { code: "MANDATE_CANCELLED", message: "You cancelled this authorisation, so Agent D did not buy anything." });
      return done("in_progress", now, { message: "Agent D is already processing this purchase." });
    }
    mandate = claimed;

    // The server (not the user, not the AI) approves the one offer the mandate allows.
    session.approvedOfferId = check.offer.offerId;
    session.approvedAt = nowFn().toISOString();
    session.approvedBy = "mandate";
    await saveSession(session);

    return finish(mandate, session.sessionId, args.ownerId, check.offer.offerId, gw, done);
  });
}

async function finish(
  mandate: PurchaseMandate,
  sessionId: string,
  ownerId: string,
  approvedOfferId: string | null,
  gw: Gateway,
  done: (o: AutoBuyOutcome, m: PurchaseMandate, over?: Partial<AutoBuyResult>) => AutoBuyResult,
): Promise<AutoBuyResult> {
  const vaultId = await vaultTokenFor(ownerId, mandate.paymentMethodId);
  if (!vaultId || !approvedOfferId || mandate.offerId !== approvedOfferId) {
    // Revoked between the claim and now: the claim is released as a hard stop (still one purchase at most: none).
    const next = await transition(mandate, "failed", "payment_not_started", { failureCode: "AUTHORIZATION_REVOKED" }, "token unavailable");
    return done("failed", next ?? mandate, { code: "AUTHORIZATION_REVOKED", message: "Your PayPal authorisation is no longer active. Nothing was charged." });
  }
  let outcome;
  try {
    outcome = await payWithVault({ sessionId, offerId: approvedOfferId, mandateId: mandate.mandateId, vaultId }, gw);
  } catch (e) {
    if (e instanceof PaymentError) {
      // Validators refused (offer changed, expired...). Nothing reached PayPal.
      const next = await transition(mandate, "blocked", "payment_refused", { failureCode: e.code }, e.message);
      return done("blocked", next ?? mandate, { code: e.code, message: e.message });
    }
    throw e;
  }

  if (outcome.kind === "completed") {
    const executed = await finalise(mandate, "executed", "purchase_executed", { paymentAttemptId: outcome.payment.paymentAttemptId, failureCode: null }, `capture ${outcome.payment.captureId}`);
    return done("completed", executed, { payment: outcome.payment });
  }
  if (outcome.kind === "failed") {
    const failed = await finalise(mandate, "failed", "payment_failed", { failureCode: outcome.code, paymentAttemptId: outcome.payment?.paymentAttemptId ?? null }, outcome.payerAction ? "PayPal needs the buyer" : outcome.code);
    return done("failed", failed, {
      code: outcome.code,
      payment: outcome.payment,
      message: outcome.payerAction ? "PayPal needs you to approve this payment yourself, and Agent D will not fake that step. Nothing was charged." : "PayPal did not complete the payment. Nothing was charged.",
    });
  }
  const pending = await finalise(mandate, "pending_reconciliation", "payment_uncertain", { paymentAttemptId: outcome.payment?.paymentAttemptId ?? null }, "PayPal outcome unknown");
  return done("uncertain", pending, { code: "PAYPAL_UNCONFIRMED", payment: outcome.payment, message: "PayPal has not confirmed the result yet. Check again in a moment: Agent D will not charge twice." });
}

/** Moves the mandate out of its current in-flight status. A concurrent writer losing the race re-reads and keeps the winner. */
async function finalise(m: PurchaseMandate, to: PurchaseMandate["status"], type: string, patch: Partial<PurchaseMandate>, detail?: string): Promise<PurchaseMandate> {
  // `m.status` may be `executing` or `pending_reconciliation`; both are in-flight states this request owns.
  const next = await transition(m, to, type, patch, detail);
  return next ?? (await getMandate(m.mandateId)) ?? m;
}
