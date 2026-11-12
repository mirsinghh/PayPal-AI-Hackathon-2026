"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type ApiFailure } from "@/lib/api";
import { offerName, slipRef } from "@/lib/offer-view";
import { formatEur } from "@/shared/format";
import { SELLER_BRANDS } from "@/shared/sellers";
import type { MandateStatus, NegotiationSession, Offer, PublicMandate } from "@/shared/contracts/types";
import type { AutoBuyResult } from "@/server/autobuy/execute";
import type { PublicPayment } from "@/server/paypal/payments";
import { MANDATE_STATUS_LABEL, RUN_STEPS, mandateLines, outcomeNotice, stepStates, type RunSnapshot, type StepState } from "@/lib/v5/autobuy";
import { cueForPayment } from "@/lib/v3/mascot/event-map";
import { useAgentDirector, usePreloadAgentD } from "@/lib/v3/mascot/hooks";
import { AgentDActor } from "@/components/v3/mascot/AgentD";
import { Chip, Notice, Spinner, btn } from "@/components/v3/ui";
import { IconCheck, IconX } from "@/components/v3/icons";

/** Small badge shown wherever the negotiation runs in Auto-Buy mode. */
export function AutoBuyChip() {
  return (
    <Chip tone="primary" icon={<IconCheck size={13} />}>
      Agent D · Auto-Buy enabled
    </Chip>
  );
}

interface MandateInfo {
  mandate: PublicMandate;
  payment: PublicPayment | null;
}

const COUNTDOWN_S = 3;

const OUTCOME_OF_STATUS: Partial<Record<MandateStatus, string>> = {
  executed: "completed",
  cancelled: "cancelled",
  expired: "expired",
  blocked: "blocked",
  failed: "failed",
  pending_reconciliation: "uncertain",
  executing: "in_progress",
};

/**
 * What Agent D does once the negotiation is over, when the user pre-authorised it: check the mandate, prepare and
 * process the PayPal Sandbox payment, and show the verified receipt. The decision is made entirely by the server
 * (POST /api/auto-buy/execute carries no amount, offer or mandate id). This component only starts it, shows the stages
 * the server recorded, and offers "Cancel" during a short countdown. "Paid" appears only for a payment the server verified.
 */
export function AutoBuyRun({ session }: { session: Pick<NegotiationSession, "sessionId" | "mandateId" | "offers" | "recommendedOfferId" | "intent"> }) {
  usePreloadAgentD(["thinking", "searching", "payment_approved", "reject", "surprised"]);
  const agent = useAgentDirector("idle");
  const react = agent.react;
  const [info, setInfo] = useState<MandateInfo | null>(null);
  const [loadError, setLoadError] = useState<ApiFailure | null>(null);
  const [phase, setPhase] = useState<RunSnapshot["phase"]>("countdown");
  const [seconds, setSeconds] = useState(COUNTDOWN_S);
  const [result, setResult] = useState<AutoBuyResult | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const started = useRef(false);
  const mandateId = session.mandateId ?? null;

  const refresh = useCallback(async (): Promise<MandateInfo | null> => {
    if (!mandateId) return null;
    try {
      const i = await api<MandateInfo>(`/api/auto-buy/mandates/${encodeURIComponent(mandateId)}`, { cache: "no-store" });
      setInfo(i);
      return i;
    } catch (e) {
      setLoadError(e as ApiFailure);
      return null;
    }
  }, [mandateId]);

  const run = useCallback(async () => {
    setPhase("running");
    setActionError(null);
    react({ key: `autobuy-run:${Date.now()}`, state: "thinking", cycles: 4 });
    // Show the stages the server really records while the request is in flight.
    const poll = window.setInterval(() => void refresh(), 700);
    try {
      const r = await api<AutoBuyResult>("/api/auto-buy/execute", { method: "POST", body: JSON.stringify({ sessionId: session.sessionId }) });
      setResult(r);
      setInfo({ mandate: r.mandate, payment: r.payment });
      setPhase("settled");
      // Agent D celebrates a purchase only when the payment record says completed (verified capture).
      const cue = r.outcome === "completed" ? cueForPayment({ status: r.payment?.status, orderId: r.payment?.orderId }) : null;
      react(cue ?? { key: `autobuy-stop:${Date.now()}`, state: r.outcome === "uncertain" || r.outcome === "in_progress" ? "thinking" : "reject" });
    } catch (e) {
      const f = e as ApiFailure;
      setActionError(f.status === 401 ? "Your session ended. Sign in again to continue; nothing was charged." : f.message);
      setPhase("settled");
      react({ key: `autobuy-err:${Date.now()}`, state: "surprised" });
    } finally {
      window.clearInterval(poll);
    }
  }, [react, refresh, session.sessionId]);

  // On arrival: read the mandate. Only an `active` mandate starts the (cancellable) countdown; anything else is shown as recorded.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const i = await refresh();
      if (!i) {
        setPhase("settled");
        return;
      }
      const s = i.mandate.status;
      if (s === "active") return; // countdown effect takes over
      if (s === "executing" || s === "pending_reconciliation") {
        void run(); // resume: the server reconciles, never re-charges
        return;
      }
      setPhase("settled");
      const outcome = OUTCOME_OF_STATUS[s] ?? null;
      setResult({ outcome: outcome as AutoBuyResult["outcome"], code: i.mandate.failureCode, message: null, mandate: i.mandate, payment: i.payment, offer: null });
    })();
  }, [refresh, run]);

  const armed = info?.mandate.status === "active" && phase === "countdown";
  useEffect(() => {
    if (!armed) return;
    // One tick per second; when it reaches zero the purchase starts (the user could still cancel until then).
    const t = window.setTimeout(() => (seconds <= 0 ? void run() : setSeconds((n) => n - 1)), seconds <= 0 ? 0 : 1000);
    return () => window.clearTimeout(t);
  }, [armed, seconds, run]);

  async function cancel() {
    if (!mandateId || cancelling) return;
    setCancelling(true);
    setActionError(null);
    try {
      const r = await api<{ mandate: PublicMandate }>(`/api/auto-buy/mandates/${encodeURIComponent(mandateId)}/cancel`, { method: "POST" });
      setInfo({ mandate: r.mandate, payment: null });
      setResult({ outcome: "cancelled", code: "MANDATE_CANCELLED", message: null, mandate: r.mandate, payment: null, offer: null });
      setPhase("settled");
    } catch (e) {
      setActionError((e as ApiFailure).message);
    } finally {
      setCancelling(false);
    }
  }

  const payment = result?.payment ?? info?.payment ?? null;
  const snapshot: RunSnapshot = { phase, mandateStatus: info?.mandate.status ?? null, paymentStatus: payment?.status ?? null, outcome: result?.outcome ?? null };
  const steps = useMemo(() => stepStates(snapshot), [snapshot.phase, snapshot.mandateStatus, snapshot.paymentStatus, snapshot.outcome]); // eslint-disable-line react-hooks/exhaustive-deps
  const notice = outcomeNotice(result?.outcome ?? null, result?.message ?? null, result?.code ?? null);
  const offer: Offer | null = session.offers.find((o) => o.offerId === (info?.mandate.offerId ?? session.recommendedOfferId)) ?? null;
  const verified = result?.outcome === "completed" && payment?.status === "completed";

  if (!mandateId) return <Notice tone="warn">This negotiation has no purchase authorisation.</Notice>;
  if (loadError && !info) {
    return (
      <Notice tone={loadError.status === 401 ? "warn" : "danger"} title="Agent Auto-Buy">
        {loadError.status === 401 ? (
          <>
            Sign in with the account that started this negotiation to see or run its purchase. <Link href={`/login?next=/negotiation/${session.sessionId}`} className="font-bold underline">Sign in</Link>
          </>
        ) : (
          loadError.message
        )}
      </Notice>
    );
  }

  return (
    <section aria-labelledby="autobuy-title" className="v3-card overflow-hidden border-2 !border-v3-ink" data-testid="autobuy-run">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-v3-line-strong bg-v3-soft2 px-5 py-3.5">
        <h2 id="autobuy-title" className="font-v3-head text-lg font-extrabold">
          {verified ? "Agent D bought it" : "Agent D is buying"}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <AutoBuyChip />
          <Chip tone="accent">PayPal Sandbox · simulated store</Chip>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="flex items-center gap-4">
          <AgentDActor director={agent.handle} size={verified ? 150 : 110} label={verified ? "Agent D, celebrating the confirmed purchase" : "Agent D"} priority />
          <p role="status" aria-live="polite" className="min-w-0 text-[0.98rem] font-bold">
            {phase === "countdown" && armed
              ? `Negotiation finished. Agent D checks your mandate in ${Math.max(seconds, 0)}…`
              : phase === "countdown"
                ? "Loading your authorisation…"
                : phase === "running"
                  ? "Agent D is checking your mandate and paying inside it…"
                  : (notice?.title ?? "")}
          </p>
        </div>

        <ol aria-label="Purchase progress" className="space-y-2">
          {RUN_STEPS.map((s) => (
            <StepRow key={s.id} label={s.label} state={steps[s.id]} />
          ))}
        </ol>

        {phase === "countdown" && armed && (
          <button type="button" onClick={cancel} disabled={cancelling} className={btn("secondary", "md", "w-full")}>
            {cancelling ? "Cancelling…" : "Cancel authorisation"}
          </button>
        )}
        {actionError && <Notice tone="danger">{actionError}</Notice>}
        {notice && phase === "settled" && (
          <Notice tone={notice.tone} title={notice.title}>
            {notice.text}
          </Notice>
        )}
        {phase === "settled" && (result?.outcome === "uncertain" || result?.outcome === "in_progress") && (
          <button type="button" onClick={() => void run()} className={btn("secondary", "md", "w-full")}>
            Check payment status
          </button>
        )}

        {verified && offer && payment && <Receipt offer={offer} payment={payment} sessionId={session.sessionId} />}

        {info && <AuthorizationRecord mandate={info.mandate} />}

        {phase === "settled" && (
          <div className="flex flex-wrap gap-3">
            <Link href="/brief" className={btn("primary", "md")}>
              Start a new mission
            </Link>
            <Link href="/history" className={btn("secondary", "md")}>
              See it in My Activity
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

function StepRow({ label, state }: { label: string; state: StepState }) {
  const text: Record<StepState, string> = { done: "done", active: "in progress", pending: "waiting", failed: "stopped" };
  return (
    <li className={`flex items-center gap-3 text-[0.95rem] ${state === "pending" ? "text-v3-ink2" : "font-semibold"}`}>
      <span aria-hidden className="grid size-6 shrink-0 place-items-center">
        {state === "done" ? (
          <span className="grid size-6 place-items-center rounded-full bg-v3-success text-white">
            <IconCheck size={14} />
          </span>
        ) : state === "active" ? (
          <Spinner size={20} />
        ) : state === "failed" ? (
          <span className="grid size-6 place-items-center rounded-full bg-v3-danger text-white">
            <IconX size={14} />
          </span>
        ) : (
          <span className="size-3 rounded-full border-2 border-v3-line-strong" />
        )}
      </span>
      <span>{label}</span>
      <span className="sr-only">: {text[state]}</span>
    </li>
  );
}

/** The confirmed purchase. Every number is the server's: the stored offer, and the verified PayPal capture. */
function Receipt({ offer, payment, sessionId }: { offer: Offer; payment: PublicPayment; sessionId: string }) {
  const matches = payment.amountCents === offer.finalPriceCents && payment.currency === "EUR" && !!payment.captureId;
  return (
    <section aria-label="Purchase receipt" className="rounded-v3-md border border-v3-success-line bg-v3-success-soft p-4" data-testid="autobuy-receipt">
      <p className="flex items-center gap-2 font-extrabold text-v3-success">
        <IconCheck size={18} /> Purchase confirmed (Sandbox)
        <span className="v3-num ml-auto text-xs font-bold text-v3-ink2">{slipRef(sessionId)}</span>
      </p>
      <dl className="mt-3 space-y-2 text-[0.92rem]">
        <Line k="Product" v={offerName(offer)} />
        <Line k="Seller" v={`${SELLER_BRANDS[offer.sellerId].brand} · simulated store`} />
        <Line k="Final price" v={formatEur(offer.finalPriceCents)} strong />
        <Line k="Amount captured" v={formatEur(payment.amountCents)} strong />
        <Line k="PayPal order ID" v={payment.orderId ?? "—"} mono />
        <Line k="Capture ID" v={payment.captureId ?? "—"} mono />
        <Line k="Verification" v={matches ? "Verified by the server: PayPal reports COMPLETED, and the amount and currency match the offer." : "Not verified"} />
      </dl>
      <p className="mt-3 text-xs text-v3-ink2">Demo purchase: no real money moved and nothing will be shipped.</p>
    </section>
  );
}

function Line({ k, v, strong = false, mono = false }: { k: string; v: string; strong?: boolean; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="shrink-0 text-v3-ink2">{k}</dt>
      <dd className={`min-w-0 break-all sm:text-right ${strong ? "v3-num font-v3-head text-lg font-extrabold" : "font-semibold"} ${mono ? "font-mono text-xs" : ""}`}>{v}</dd>
    </div>
  );
}

/** The original authorisation and its evidence trail, written by the server at every step. */
export function AuthorizationRecord({ mandate }: { mandate: PublicMandate }) {
  const lines = mandateLines({ ...mandate }, formatEur);
  return (
    <details className="rounded-v3-md border border-v3-line bg-v3-surface p-3 text-sm">
      <summary className="cursor-pointer font-extrabold">
        Your authorisation · {MANDATE_STATUS_LABEL[mandate.status]}
      </summary>
      <dl className="mt-3 divide-y divide-dashed divide-v3-line-strong">
        {lines.map((l) => (
          <div key={l.k} className="flex justify-between gap-4 py-1.5">
            <dt className="text-v3-ink2">{l.k}</dt>
            <dd className="text-right font-bold">{l.v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-v3-ink2">
        You confirmed on {new Date(mandate.consentedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}: <q>{mandate.authorizationText}</q>
      </p>
      <ol className="mt-3 space-y-1 border-t border-dashed border-v3-line-strong pt-3 text-xs text-v3-ink2">
        {mandate.evidence.map((e, i) => (
          <li key={`${e.at}-${i}`}>
            <span className="v3-num">{new Date(e.at).toLocaleTimeString("en-GB")}</span> · <strong className="text-v3-ink">{e.type.replace(/_/g, " ")}</strong>
            {e.detail ? ` · ${e.detail}` : ""}
          </li>
        ))}
      </ol>
    </details>
  );
}
