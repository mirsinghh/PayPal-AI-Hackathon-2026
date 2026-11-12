"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ApiFailure } from "@/lib/api";
import type { Offer } from "@/shared/contracts/types";

/**
 * PayPal Sandbox checkout state machine for V3.
 *
 * A faithful port of the classic Checkout flow (app/(classic)/checkout/[id]/Checkout.tsx): same endpoints, same
 * order of operations, same states. Nothing about money moves into the browser:
 *  - createOrder posts only the session id; the server takes the amount from the approved offer;
 *  - the official <paypal-button> from the SDK is the only payment control;
 *  - a capture is "completed" only when the server's payment record says so (stricter than "the request returned");
 *  - anything uncertain stays `unconfirmed` with a "check status" action, never a second charge or a fake success.
 * Agent D never touches this hook: celebrating is the screen's job, and only on `completed`.
 */
const SDK_URL = "https://www.sandbox.paypal.com/web-sdk/v6/core";

export interface PaymentView {
  orderId: string | null;
  captureId: string | null;
  status: string;
  amountCents: number;
}

export type PayPhase =
  | { k: "loading_sdk" }
  | { k: "ready" }
  | { k: "preparing" }
  | { k: "waiting" }
  | { k: "confirming" }
  | { k: "completed"; payment: PaymentView }
  | { k: "cancelled" }
  | { k: "unconfirmed"; orderId: string; status: string | null }
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

export function usePayPalCheckout({
  sessionId,
  clientId,
  offer,
  alreadyPaid,
  onCompleted,
}: {
  sessionId: string;
  clientId: string;
  offer: Offer | null;
  alreadyPaid: PaymentView | null;
  /** Called with the verified payment record the moment it is `completed` (and only then). */
  onCompleted?: (payment: PaymentView) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [prepared, setPrepared] = useState<{ orderId: string; amountCents: number } | null>(null);
  const [phase, setPhase] = useState<PayPhase>(
    alreadyPaid?.status === "completed"
      ? { k: "completed", payment: alreadyPaid }
      : clientId
        ? { k: "loading_sdk" }
        : { k: "unavailable", message: "PayPal Sandbox isn't configured on this server." },
  );

  const done = useRef(onCompleted);
  useEffect(() => {
    done.current = onCompleted;
  });

  const complete = useCallback((p: PaymentView) => {
    setPhase({ k: "completed", payment: p });
    done.current?.(p);
  }, []);

  const checkStatus = useCallback(
    async (orderId: string) => {
      setPhase({ k: "confirming" });
      try {
        const p = await api<PaymentView>(`/api/paypal/orders/${encodeURIComponent(orderId)}`);
        if (p.status === "completed") complete(p);
        else if (p.status === "approval_pending" || p.status === "created") setPhase({ k: "ready" });
        else setPhase({ k: "unconfirmed", orderId, status: p.status });
      } catch {
        setPhase({ k: "unconfirmed", orderId, status: null });
      }
    },
    [complete],
  );

  const capture = useCallback(
    async (orderId: string) => {
      setPhase({ k: "confirming" });
      try {
        const p = await api<PaymentView>(`/api/paypal/orders/${encodeURIComponent(orderId)}/capture`, { method: "POST" });
        // Celebrate only a payment the server itself reports as completed.
        if (p.status === "completed") complete(p);
        else setPhase({ k: "unconfirmed", orderId, status: p.status });
      } catch (e) {
        const f = e as ApiFailure;
        if (f.body?.code === "PAYPAL_NOT_APPROVED") setPhase({ k: "ready" });
        else if (f.body?.retryable || f.status === 0) setPhase({ k: "unconfirmed", orderId, status: null });
        else setPhase({ k: "error", message: f.message });
      }
    },
    [complete],
  );

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
              message: err?.code === "ERR_DEV_UNABLE_TO_OPEN_POPUP" ? "Your browser blocked the PayPal window. Allow pop-ups for this site and try again." : "Payment couldn't be completed in Sandbox.",
            });
          },
        });

        // createOrder resolves { orderId }. The amount is never sent: the server uses the approved offer.
        const createOrder = async () => {
          const o = await api<{ orderId: string; amountCents?: number }>("/api/paypal/orders", { method: "POST", body: JSON.stringify({ sessionId }) });
          return { orderId: o.orderId, amountCents: o.amountCents };
        };

        // Agent D prepares the order up front (the server creates it idempotently: asking again returns the same
        // order). Creating an order moves no money; only the buyer's authorisation in PayPal does. If this fails the
        // click handler below simply creates the order as before.
        let preparedOrder: { orderId: string } | null = null;
        try {
          const o = await createOrder();
          if (typeof o.amountCents === "number") {
            preparedOrder = { orderId: o.orderId };
            if (!cancelled) setPrepared({ orderId: o.orderId, amountCents: o.amountCents });
          }
        } catch {
          preparedOrder = null;
        }

        if (cancelled || !holder.current) return;
        holder.current.innerHTML = "";
        const button = document.createElement("paypal-button");
        button.setAttribute("type", "pay");
        button.addEventListener("click", async () => {
          setPhase({ k: "preparing" });
          try {
            // Do not await before start(): it must run inside the click's user activation.
            const orderPromise: Promise<{ orderId: string }> = preparedOrder ? Promise.resolve(preparedOrder) : createOrder();
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
  }, [phase.k, offer, clientId, capture, sessionId]);

  return { phase, holder, checkStatus, prepared };
}

/** Plain words for the persisted payment statuses a user can be shown while a payment is uncertain. */
export function statusLabel(status: string | null): string {
  switch (status) {
    case "unknown_pending_reconciliation":
      return "PayPal has not confirmed the result yet";
    case "capturing":
      return "The capture is still in progress";
    case "approved":
      return "Approved in PayPal, not captured yet";
    case "failed":
      return "The payment failed";
    case "cancelled":
      return "The payment was cancelled";
    default:
      return "The result is not known yet";
  }
}
