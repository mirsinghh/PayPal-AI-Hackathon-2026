"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { api, ApiFailure, useSession, type SessionWithPayment } from "@/lib/api";
import { duration, ease, spring } from "@/lib/motion";
import { formatEur } from "@/shared/format";
import type { Offer } from "@/shared/contracts/types";
import { slipRef } from "@/lib/offer-view";
import { IconLock } from "@/components/icons";
import { OfferSummary } from "@/components/offers/ApprovalPanel";
import { DealSlip, LedgerRow } from "@/components/slip/Slip";
import { ErrorState, LoadingState, Spinner, StatusBanner, btnLarge, btnPrimary, btnSecondary } from "@/components/ui";

const SDK_URL = "https://www.sandbox.paypal.com/web-sdk/v6/core";

interface PaymentView {
  orderId: string | null;
  captureId: string | null;
  status: string;
  amountCents: number;
}

type Phase =
  | { k: "loading_sdk" }
  | { k: "ready" }
  | { k: "preparing" }
  | { k: "waiting" }
  | { k: "confirming" }
  | { k: "completed"; payment: PaymentView }
  | { k: "cancelled" }
  | { k: "unconfirmed"; orderId: string }
  | { k: "error"; message: string }
  | { k: "unavailable"; message: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
function loadSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).paypal) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);
    const s = existing ?? document.createElement("script");
    s.addEventListener("load", () => resolve());
    s.addEventListener("error", () => reject(new Error("sdk_load_failed")));
    if (!existing) {
      s.src = SDK_URL;
      s.async = true;
      document.head.appendChild(s);
    }
  });
}

export function Checkout({ sessionId, clientId }: { sessionId: string; clientId: string }) {
  const { state, reload } = useSession(sessionId);
  if (state.status === "loading") return <LoadingState label="Preparing secure checkout…" />;
  if (state.status === "error") return <ErrorState message={state.error.message} onRetry={state.error.status === 0 ? reload : undefined} />;
  return <CheckoutInner s={state.data} clientId={clientId} />;
}

function CheckoutInner({ s, clientId }: { s: SessionWithPayment; clientId: string }) {
  const h1 = useRef<HTMLHeadingElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>(
    s.payment?.status === "completed"
      ? { k: "completed", payment: s.payment }
      : clientId
        ? { k: "loading_sdk" }
        : { k: "unavailable", message: "PayPal Sandbox isn't configured on this server." },
  );
  const isDone = phase.k === "completed";
  useEffect(() => {
    h1.current?.focus({ preventScroll: true });
  }, [isDone]);

  const offer = s.offers.find((o) => o.offerId === s.approvedOfferId) ?? null;

  const checkStatus = useCallback(async (orderId: string) => {
    setPhase({ k: "confirming" });
    try {
      const p = await api<PaymentView>(`/api/paypal/orders/${encodeURIComponent(orderId)}`);
      if (p.status === "completed") setPhase({ k: "completed", payment: p });
      else if (p.status === "approval_pending" || p.status === "created") setPhase({ k: "ready" });
      else setPhase({ k: "unconfirmed", orderId });
    } catch {
      setPhase({ k: "unconfirmed", orderId });
    }
  }, []);

  const capture = useCallback(async (orderId: string) => {
    setPhase({ k: "confirming" });
    try {
      const p = await api<PaymentView>(`/api/paypal/orders/${encodeURIComponent(orderId)}/capture`, { method: "POST" });
      setPhase({ k: "completed", payment: p });
    } catch (e) {
      const f = e as ApiFailure;
      if (f.body?.code === "PAYPAL_NOT_APPROVED") setPhase({ k: "ready" });
      else if (f.body?.retryable || f.status === 0) setPhase({ k: "unconfirmed", orderId });
      else setPhase({ k: "error", message: f.message });
    }
  }, []);

  // Initialise the PayPal JS SDK v6 once the approved offer is known.
  useEffect(() => {
    if (phase.k !== "loading_sdk" || !offer) return;
    let cancelled = false;
    (async () => {
      try {
        await loadSdk();
        const paypal = (window as any).paypal;
        const sdk = await paypal.createInstance({ clientId, components: ["paypal-payments"], pageType: "checkout" });
        const methods = await sdk.findEligibleMethods({ currencyCode: "EUR" });
        if (!methods.isEligible("paypal")) throw new Error("not_eligible");

        const session = sdk.createPayPalOneTimePaymentSession({
          onApprove: async (data: { orderId: string }) => {
            await capture(data.orderId);
          },
          onCancel: () => setPhase({ k: "cancelled" }),
          onError: (err: { code?: string }) => {
            setPhase({
              k: "error",
              message:
                err?.code === "ERR_DEV_UNABLE_TO_OPEN_POPUP"
                  ? "Your browser blocked the PayPal window. Allow pop-ups for this site and try again."
                  : "Payment couldn't be completed in Sandbox.",
            });
          },
        });

        // createOrder resolves { orderId }. The amount is never sent: the server uses the approved offer.
        const createOrder = async () => {
          const o = await api<{ orderId: string }>("/api/paypal/orders", {
            method: "POST",
            body: JSON.stringify({ sessionId: s.sessionId }),
          });
          return { orderId: o.orderId };
        };

        if (cancelled || !holder.current) return;
        holder.current.innerHTML = "";
        const button = document.createElement("paypal-button");
        button.setAttribute("type", "pay");
        button.addEventListener("click", async () => {
          setPhase({ k: "preparing" });
          try {
            // Do not await before start(): it must run inside the click's user activation.
            const orderPromise = createOrder();
            setPhase({ k: "waiting" });
            await session.start({ presentationMode: "auto" }, orderPromise);
          } catch (e) {
            const f = e as ApiFailure;
            setPhase({ k: "error", message: f.body ? f.message : "Payment couldn't be started in Sandbox." });
          }
        });
        holder.current.appendChild(button);
        setPhase({ k: "ready" });
      } catch {
        if (!cancelled) setPhase({ k: "unavailable", message: "We couldn't load PayPal checkout. Refresh to try again." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase.k, offer, clientId, capture, s.sessionId]);

  if (!offer) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
        <StatusBanner tone="warning">Approve the offer before paying.</StatusBanner>
        <Link href={`/deals/${s.sessionId}`} className={btnPrimary}>
          Back to my offers
        </Link>
      </div>
    );
  }

  if (phase.k === "completed") return <Confirmation s={s} offer={offer} payment={phase.payment} h1={h1} />;

  const showButton = !["unconfirmed", "confirming", "unavailable"].includes(phase.k);
  const busyMessage =
    phase.k === "loading_sdk" || phase.k === "preparing"
      ? "Preparing secure checkout…"
      : phase.k === "waiting"
        ? "Waiting for PayPal approval…"
        : phase.k === "confirming"
          ? "Confirming payment…"
          : null;
  const approvedAt = s.approvedAt ? new Date(s.approvedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="mx-auto max-w-5xl">
      <title>Checkout · AgentDeal</title>
      <header>
        <p className="eyebrow text-primary">Step 2 of 2 · PayPal payment</p>
        <h1 ref={h1} tabIndex={-1} className="mt-3 font-display text-[clamp(2.25rem,1.5rem+3.4vw,4rem)] leading-[1.02] outline-none">
          One more step: <em>you</em> pay.
        </h1>
        <p className="mt-4 max-w-xl text-body text-ink-2">
          You approved this offer with AgentDeal. Now you authorize the payment in PayPal. AgentDeal can&apos;t charge you without that second step.
        </p>
      </header>

      <div className="mt-10 grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start">
        <section aria-label="Order summary">
          <DealSlip
            stage="approved"
            reference={slipRef(s.sessionId)}
            footer={
              <p className="text-caption text-ink-2">
                Approved by you{approvedAt ? ` at ${approvedAt}` : ""}. Test transaction: no real purchase or delivery.
              </p>
            }
          >
            <OfferSummary offer={offer} />
          </DealSlip>
        </section>

        <section aria-labelledby="pay-title" className="md:pt-3">
          <h2 id="pay-title" className="font-display text-[1.875rem] leading-none">
            Authorize with PayPal
          </h2>
          <p className="eyebrow mt-3">PayPal Sandbox</p>

          <div aria-live="polite" className="mt-5 min-h-6">
            {busyMessage && (
              <p role="status" className="flex items-center gap-2 text-small text-ink-2">
                <Spinner /> {busyMessage}
              </p>
            )}
            {phase.k === "ready" && <p className="text-small text-ink-2">Ready. Use the PayPal button to open Sandbox checkout.</p>}
          </div>

          <div className="mt-3 space-y-3">
            {phase.k === "cancelled" && <StatusBanner tone="warning">Payment was cancelled. You haven&apos;t been charged.</StatusBanner>}
            {phase.k === "error" && <StatusBanner tone="danger">{phase.message}</StatusBanner>}
            {phase.k === "unavailable" && <StatusBanner tone="danger">{phase.message}</StatusBanner>}
            {phase.k === "unconfirmed" && (
              <>
                <StatusBanner tone="warning">Unable to confirm payment yet. Check the status before trying again, so you aren&apos;t charged twice.</StatusBanner>
                <button className={btnSecondary} onClick={() => checkStatus(phase.orderId)}>
                  Check payment status
                </button>
              </>
            )}

            {/* The PayPal SDK renders its own official button here. The zone keeps its height so nothing jumps. */}
            <div className={showButton ? "min-h-12" : "hidden"}>
              {phase.k === "loading_sdk" && <div aria-hidden className="skeleton h-12 rounded-md" />}
              <div ref={holder} hidden={phase.k === "loading_sdk"} />
            </div>
          </div>

          <div className="mt-6 flex gap-2.5 border-t border-line pt-5 text-caption text-ink-2">
            <IconLock size={16} className="mt-0.5 shrink-0" />
            <p>
              Sandbox only moves fake money. Sign in with a PayPal <strong className="font-medium text-ink">Sandbox personal account</strong>, never your real account, and never enter a real card.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function Confirmation({
  s,
  offer,
  payment,
  h1,
}: {
  s: SessionWithPayment;
  offer: Offer;
  payment: PaymentView;
  h1: RefObject<HTMLHeadingElement | null>;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="mx-auto max-w-xl">
      <title>Payment completed · AgentDeal</title>
      <div className="text-center">
        <motion.div
          initial={reduce ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={spring.pop}
          className="mx-auto flex size-14 items-center justify-center rounded-full bg-success text-white"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <motion.path
              d="m5 12.5 4.5 4.5L19 7.5"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: duration.micro, ...ease(duration.state) }}
            />
          </svg>
        </motion.div>
        <h1 ref={h1} tabIndex={-1} className="mt-6 font-display text-[clamp(2.5rem,1.8rem+3vw,3.75rem)] leading-none outline-none">
          Payment <em>complete.</em>
        </h1>
        <p className="mt-3 text-small text-ink-2">Paid with PayPal Sandbox. No real money moved.</p>
      </div>

      <section aria-label="Receipt" className="mt-10">
        <DealSlip
          stage="paid"
          reference={slipRef(s.sessionId)}
          footer={<p className="text-caption text-ink-2">Demo purchase: nothing will be shipped or delivered, so there is no tracking to show.</p>}
        >
          <dl className="space-y-3 border-b border-dashed border-line-strong pb-5">
            <LedgerRow label="Payment status" value="Completed (Sandbox)" />
            <LedgerRow label="Amount paid" value={formatEur(payment.amountCents)} />
            {[
              { k: "Order number (PayPal)", v: payment.orderId },
              { k: "Capture ID", v: payment.captureId },
            ].map((r) => (
              <div key={r.k} className="flex flex-col gap-0.5 text-small">
                <dt className="text-ink-2">{r.k}</dt>
                <dd className="break-all font-mono text-caption">{r.v}</dd>
              </div>
            ))}
          </dl>
          <div className="pt-5">
            <OfferSummary offer={offer} />
          </div>
        </DealSlip>
      </section>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className={`${btnPrimary} ${btnLarge}`}>
          Start a new request
        </Link>
        <Link href={`/deals/${s.sessionId}`} className={`${btnSecondary} ${btnLarge}`}>
          View the offers again
        </Link>
      </div>
    </div>
  );
}
