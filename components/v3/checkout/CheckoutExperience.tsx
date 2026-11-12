"use client";

import { BaseLink } from "@/components/v3/BaseLink";
import { useEffect, useRef } from "react";
import { useSession, type SessionWithPayment } from "@/lib/api";
import { slipRef } from "@/lib/offer-view";
import { formatEur } from "@/shared/format";
import type { Offer } from "@/shared/contracts/types";
import { cueForPayment } from "@/lib/v3/mascot/event-map";
import { useAgentDirector, usePreloadAgentD } from "@/lib/v3/mascot/hooks";
import { statusLabel, usePayPalCheckout, type PayPhase, type PaymentView } from "@/lib/v3/use-paypal-checkout";
import { AgentD, AgentDActor } from "@/components/v3/mascot/AgentD";
import { ErrorScreen, LoadingScreen, Notice, Spinner, btn } from "@/components/v3/ui";
import { IconCheck, IconLock } from "@/components/v3/icons";
import { OrderSummary } from "./OrderSummary";
import { VerificationTrail } from "./VerificationTrail";
import { buildTrail } from "@/lib/v3/trail";

export function CheckoutExperience({ sessionId, clientId }: { sessionId: string; clientId: string }) {
  usePreloadAgentD(["idle", "payment_approved"]);
  const { state, reload } = useSession(sessionId);
  if (state.status === "loading") return <LoadingScreen label="Preparing secure checkout…" />;
  if (state.status === "error") return <ErrorScreen message={state.error.message} onRetry={state.error.status === 0 ? reload : undefined} />;
  return <CheckoutInner s={state.data} clientId={clientId} />;
}

function CheckoutInner({ s, clientId }: { s: SessionWithPayment; clientId: string }) {
  const h1 = useRef<HTMLHeadingElement>(null);
  const offer = s.offers.find((o) => o.offerId === s.approvedOfferId) ?? null;
  const alreadyPaid: PaymentView | null = s.payment?.status === "completed" ? { orderId: s.payment.orderId, captureId: s.payment.captureId, status: s.payment.status, amountCents: s.payment.amountCents } : null;

  // Agent D stays small and calm here. It celebrates exactly once, and only for a payment the server reports as completed:
  // on opening an already-paid session (intro) or the moment this page verifies the capture (onCompleted).
  const agent = useAgentDirector("idle", alreadyPaid ? (cueForPayment(alreadyPaid) ?? undefined) : undefined);
  const { phase, holder, checkStatus, prepared } = usePayPalCheckout({
    sessionId: s.sessionId,
    clientId,
    offer,
    alreadyPaid,
    onCompleted: (p) => agent.react(cueForPayment(p)),
  });

  const isDone = phase.k === "completed";
  useEffect(() => {
    h1.current?.focus({ preventScroll: true });
  }, [isDone]);

  if (!offer) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-5 px-4 py-20 text-center">
        <AgentD state="idle" size={120} label={null} />
        <Notice tone="warn" className="text-left">
          Approve the offer before paying.
        </Notice>
        <BaseLink to={`/deals/${s.sessionId}`} className={btn("primary", "md")}>
          Back to my offers
        </BaseLink>
      </div>
    );
  }

  if (phase.k === "completed") return <Receipt s={s} offer={offer} payment={phase.payment} h1={h1} agent={agent.handle} />;
  return <PayStep s={s} offer={offer} phase={phase} holder={holder} h1={h1} agent={agent.handle} onCheck={checkStatus} prepared={prepared} />;
}

function PayStep({
  s,
  offer,
  phase,
  holder,
  h1,
  agent,
  onCheck,
  prepared,
}: {
  s: SessionWithPayment;
  offer: Offer;
  phase: PayPhase;
  holder: React.RefObject<HTMLDivElement | null>;
  h1: React.RefObject<HTMLHeadingElement | null>;
  agent: Parameters<typeof AgentDActor>[0]["director"];
  onCheck: (orderId: string) => void;
  prepared: { orderId: string; amountCents: number } | null;
}) {
  const showButton = !["unconfirmed", "confirming", "unavailable"].includes(phase.k);
  const busy = phase.k === "loading_sdk" || phase.k === "preparing" ? "Preparing secure checkout…" : phase.k === "waiting" ? "Waiting for PayPal approval…" : phase.k === "confirming" ? "Confirming payment…" : null;
  const approvedAt = s.approvedAt ? new Date(s.approvedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <title>Checkout</title>
      <header>
        <p className="v3-eyebrow">Step 3 of 3 · PayPal payment</p>
        <h1 ref={h1} tabIndex={-1} className="v3-display mt-3 text-[clamp(2.2rem,1.4rem+3.6vw,4rem)] outline-none">
          One more step: <span className="v3-hl">you</span> pay.
        </h1>
        <p className="mt-4 max-w-xl text-[1.05rem] text-v3-ink2">You approved this offer with AgentDeal. Now you authorise the payment in PayPal. AgentDeal can&apos;t charge you without that second step.</p>
      </header>

      <div className="mt-10 grid gap-8 md:grid-cols-2 md:items-start">
        {/* Order summary, with a small, quiet Agent D far from the payment control. */}
        <section aria-labelledby="order-title" className="v3-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-dashed border-v3-line-strong bg-v3-soft2 px-5 py-3.5">
            <h2 id="order-title" className="font-v3-head text-lg font-extrabold">
              Your order
            </h2>
            <span className="v3-num text-xs font-bold text-v3-ink2">{slipRef(s.sessionId)}</span>
          </div>
          <div className="p-5">
            <OrderSummary offer={offer} />
            <div className="mt-5 flex items-center gap-3 border-t border-dashed border-v3-line-strong pt-4">
              <AgentDActor director={agent} size={72} label="Agent D" />
              <p className="text-sm text-v3-ink2">Approved by you{approvedAt ? ` at ${approvedAt}` : ""}. Test transaction: no real purchase or delivery.</p>
            </div>
          </div>
        </section>

        {/* Payment: nothing animated here. */}
        <div className="space-y-8 md:pt-2">
        <section aria-labelledby="pay-title">
          <h2 id="pay-title" className="v3-h2 text-[1.9rem]">
            Authorise with PayPal
          </h2>
          <p className="v3-eyebrow mt-3">PayPal Sandbox</p>

          <div aria-live="polite" className="mt-5 min-h-6">
            {busy && (
              <p role="status" className="flex items-center gap-2 text-[0.95rem] font-semibold text-v3-ink2">
                <Spinner /> {busy}
              </p>
            )}
            {phase.k === "ready" && <p className="text-[0.95rem] text-v3-ink2">Ready. Use the PayPal button to open Sandbox checkout.</p>}
          </div>

          <div className="mt-3 space-y-3">
            {phase.k === "cancelled" && <Notice tone="warn">Payment was cancelled. You haven&apos;t been charged.</Notice>}
            {phase.k === "error" && <Notice tone="danger">{phase.message}</Notice>}
            {phase.k === "unavailable" && <Notice tone="danger">{phase.message}</Notice>}
            {phase.k === "unconfirmed" && (
              <>
                <Notice tone="warn" title="Payment not confirmed yet">
                  {statusLabel(phase.status)}. Check the status before trying again, so you aren&apos;t charged twice.
                </Notice>
                <button className={btn("secondary", "md")} onClick={() => onCheck(phase.orderId)}>
                  Check payment status
                </button>
              </>
            )}

            {/* The PayPal SDK renders its own official button here. The zone keeps its height so nothing jumps. */}
            <div className={showButton ? "min-h-12" : "hidden"}>
              {phase.k === "loading_sdk" && <div aria-hidden className="v3-skeleton h-12 rounded-v3-md" />}
              <div ref={holder} hidden={phase.k === "loading_sdk"} />
            </div>
          </div>

          <div className="mt-6 flex gap-2.5 border-t border-v3-line pt-5 text-sm text-v3-ink2">
            <IconLock size={17} className="mt-0.5 shrink-0" />
            <p>
              Sandbox only moves fake money. Sign in with a PayPal <strong className="text-v3-ink">Sandbox personal account</strong>, never your real account, and never enter a real card.
            </p>
          </div>
        </section>
        <VerificationTrail steps={buildTrail({ negotiationFinished: s.status !== "negotiating", engine: s.mode === "multi_agent" ? "ai" : "rules", approvedAt: s.approvedAt, offer, phase: phase.k, payment: null, prepared })} />
        </div>
      </div>
    </div>
  );
}

function Receipt({
  s,
  offer,
  payment,
  h1,
  agent,
}: {
  s: SessionWithPayment;
  offer: Offer;
  payment: PaymentView;
  h1: React.RefObject<HTMLHeadingElement | null>;
  agent: Parameters<typeof AgentDActor>[0]["director"];
}) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10 sm:py-14">
      <title>Payment completed</title>
      <div className="text-center">
        <div className="flex flex-col items-center">
          <AgentDActor director={agent} size={190} label="Agent D, celebrating the confirmed payment" priority />
          <span aria-hidden className="v3-shadow-blob -mt-3" />
        </div>
        <h1 ref={h1} tabIndex={-1} className="v3-display mt-4 text-[clamp(2.5rem,1.6rem+3.6vw,4.2rem)] outline-none">
          Payment <span className="v3-hl">complete.</span>
        </h1>
        <p className="mt-3 text-[0.98rem] text-v3-ink2">Paid with PayPal Sandbox. No real money moved.</p>
      </div>

      <section aria-label="Receipt" className="v3-card mt-8 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-dashed border-v3-line-strong bg-v3-success-soft px-5 py-3.5">
          <p className="flex items-center gap-2 font-extrabold text-v3-success">
            <IconCheck size={18} /> Completed (Sandbox)
          </p>
          <span className="v3-num text-xs font-bold text-v3-ink2">{slipRef(s.sessionId)}</span>
        </div>
        <div className="space-y-5 p-5">
          <dl className="space-y-3 border-b border-dashed border-v3-line-strong pb-5 text-[0.95rem]">
            <div className="flex justify-between gap-4">
              <dt className="text-v3-ink2">Amount paid</dt>
              <dd className="v3-num font-v3-head text-xl font-extrabold">{formatEur(payment.amountCents)}</dd>
            </div>
            {[
              { k: "Order number (PayPal)", v: payment.orderId },
              { k: "Capture ID", v: payment.captureId },
            ].map((r) => (
              <div key={r.k} className="flex flex-col gap-0.5">
                <dt className="text-v3-ink2">{r.k}</dt>
                <dd className="break-all font-mono text-xs font-semibold">{r.v}</dd>
              </div>
            ))}
          </dl>
          <OrderSummary offer={offer} />
          <p className="text-xs text-v3-ink2">Demo purchase: nothing will be shipped or delivered, so there is no tracking to show.</p>
        </div>
      </section>

      <div className="mt-6">
        <VerificationTrail steps={buildTrail({ negotiationFinished: s.status !== "negotiating", engine: s.mode === "multi_agent" ? "ai" : "rules", approvedAt: s.approvedAt, offer, phase: "completed", payment })} />
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <BaseLink to="/brief" className={btn("primary", "lg")}>
          Start a new mission
        </BaseLink>
        <BaseLink to={`/deals/${s.sessionId}`} className={btn("secondary", "lg")}>
          View the offers again
        </BaseLink>
      </div>
    </div>
  );
}
