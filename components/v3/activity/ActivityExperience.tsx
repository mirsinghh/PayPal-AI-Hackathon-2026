"use client";

import { BaseLink } from "@/components/v3/BaseLink";
import { useMemo, useSyncExternalStore } from "react";
import { useSession, type SessionWithPayment } from "@/lib/api";
import { formatEur } from "@/shared/format";
import { SELLER_BRANDS } from "@/shared/sellers";
import { clearHistory, forgetNegotiation, parseHistory, readHistoryRaw, subscribeHistory, type HistoryEntry } from "@/lib/v3/history";
import { ORIGIN_LABEL, buildConversation } from "@/lib/v3/conversation";
import { AgentD } from "@/components/v3/mascot/AgentD";
import { Chip, Notice, Spinner, btn } from "@/components/v3/ui";
import { IconCheck } from "@/components/v3/icons";

/**
 * My activity: negotiations started from THIS browser, with their AI analysis, transcript and Sandbox receipt.
 * Local demo history only: no accounts exist, so this is a list of session ids kept in localStorage, and every detail is
 * loaded through the normal per-session endpoint. Nothing lists other people's sessions or payments.
 */
export function ActivityExperience() {
  const raw = useSyncExternalStore(subscribeHistory, readHistoryRaw, () => null);
  const entries = useMemo(() => parseHistory(raw), [raw]);

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-10 sm:px-6 sm:py-14">
      <title>My activity</title>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="v3-eyebrow">My activity</p>
          <h1 className="v3-display mt-3 text-[clamp(2.2rem,1.4rem+3.4vw,3.8rem)]">
            Your <span className="v3-hl">negotiations</span> and Sandbox orders.
          </h1>
        </div>
        {entries.length > 0 && (
          <button type="button" onClick={clearHistory} className={btn("secondary", "sm")}>
            Clear this list
          </button>
        )}
      </header>

      <Notice tone="info" title="A local demo history, not an account" className="mt-6">
        This list is kept only in this browser and only contains negotiations you started here. There are no accounts, so clearing your browser data removes it, and the
        server deletes each session 24 hours after it was created (then only the entry below remains). Payments are PayPal <strong>Sandbox</strong> test transactions: no store was paid and nothing was shipped.
      </Notice>

      {entries.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-5 text-center">
          <AgentD state="idle" size={140} label={null} />
          <p className="max-w-md text-v3-ink2">Nothing here yet. Start a mission and it will appear in this list.</p>
          <BaseLink to="/brief" className={btn("primary", "lg")}>
            Start negotiating
          </BaseLink>
        </div>
      ) : (
        <ul className="mt-8 space-y-4">
          {entries.map((e) => (
            <Row key={e.sessionId} entry={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ entry }: { entry: HistoryEntry }) {
  const { state } = useSession(entry.sessionId);
  const when = new Date(entry.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <li className="v3-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-v3-head text-xl font-extrabold leading-tight">{entry.query}</h2>
          <p className="v3-num mt-1 text-sm text-v3-ink2">
            up to {formatEur(entry.budgetCents)} · {when}
          </p>
        </div>
        <button type="button" onClick={() => forgetNegotiation(entry.sessionId)} className="v3-btn v3-btn--ghost v3-btn--sm" aria-label={`Remove “${entry.query}” from this list`}>
          Remove
        </button>
      </div>

      {state.status === "loading" && (
        <p className="mt-4 flex items-center gap-2 text-sm text-v3-ink2">
          <Spinner size={16} /> Loading…
        </p>
      )}
      {state.status === "error" && (
        <p className="mt-4 text-sm font-semibold text-v3-warn">
          {state.error.status === 410 || state.error.status === 404 ? "This session has expired or is not on this server any more. Only this entry remains." : state.error.message}
        </p>
      )}
      {state.status === "ready" && <Detail s={state.data} />}
    </li>
  );
}

function Detail({ s }: { s: SessionWithPayment }) {
  const live = s.mode === "multi_agent";
  const winner = s.offers.find((o) => o.offerId === s.recommendedOfferId) ?? null;
  const paid = s.payment?.status === "completed" ? s.payment : null;
  const approved = !!s.approvedOfferId;
  const transcript = useMemo(() => buildConversation(s.events, { budgetCents: s.intent.budgetCents, query: s.intent.productQuery }), [s.events, s.intent.budgetCents, s.intent.productQuery]);
  const spoken = transcript.filter((m) => m.text && m.speaker !== "system");

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={live ? "primary" : "accent"}>{live ? "Live AI agents" : "Rule-based simulation"}</Chip>
        {s.status === "negotiating" ? <Chip tone="warn">Still negotiating</Chip> : s.status === "failed" ? <Chip tone="danger">No offer within budget</Chip> : <Chip tone="success">Negotiation finished</Chip>}
        <Chip tone={approved ? "success" : "neutral"}>{approved ? "Offer approved by you" : "Not approved"}</Chip>
        <Chip tone={paid ? "success" : "neutral"} icon={paid ? <IconCheck size={13} /> : undefined}>
          {paid ? "Sandbox payment completed" : "Not paid"}
        </Chip>
      </div>

      {winner && (
        <p className="text-[0.95rem]">
          Recommended: <strong>{SELLER_BRANDS[winner.sellerId].brand}</strong> at <span className="v3-num font-bold">{formatEur(winner.finalPriceCents)}</span>
          {winner.discountCents > 0 && <span className="text-v3-ink2"> (opened at {formatEur(winner.initialPriceCents)})</span>}.
        </p>
      )}

      {s.status !== "negotiating" && winner && (
        <details className="rounded-v3-md border border-v3-line bg-v3-soft2/60 p-3">
          <summary className="cursor-pointer font-bold">AI analysis</summary>
          <div className="mt-2 space-y-2 text-sm">
            <p>
              <Chip tone={s.evaluation.source === "llm" ? "primary" : "accent"}>{s.evaluation.source === "llm" ? `AI analysis${s.evaluation.modelName ? ` · ${s.evaluation.modelName}` : ""}` : "Rule-based explanation"}</Chip>
            </p>
            <p className="text-pretty">“{s.evaluation.aiSummary}”</p>
            {s.evaluation.aiReasons.length > 0 && (
              <ul className="list-disc space-y-1 pl-5">
                {s.evaluation.aiReasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            {s.evaluation.tradeoffs.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-v3-ink2">
                {s.evaluation.tradeoffs.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        </details>
      )}

      <details className="rounded-v3-md border border-v3-line bg-v3-soft2/60 p-3">
        <summary className="cursor-pointer font-bold">Negotiation transcript ({spoken.length} messages)</summary>
        <ol className="mt-2 space-y-2 text-sm">
          {spoken.map((m) => (
            <li key={m.id} className="leading-snug">
              <span className="font-extrabold">{m.speaker === "buyer" ? "Agent D" : m.sellerId ? SELLER_BRANDS[m.sellerId].brand : m.speaker === "server" ? "Server" : "—"}</span>{" "}
              <span className="text-xs font-semibold text-v3-ink2">({ORIGIN_LABEL[m.origin]})</span>: <span className="text-pretty">{m.text}</span>
              {m.price && <span className="v3-num font-bold"> → {formatEur(m.price.currentCents)}</span>}
            </li>
          ))}
        </ol>
      </details>

      {paid && (
        <div className="rounded-v3-md border border-v3-success-line bg-v3-success-soft p-3 text-sm">
          <p className="font-extrabold text-v3-success">Sandbox payment receipt</p>
          <dl className="mt-1.5 space-y-1">
            <div className="flex justify-between gap-3">
              <dt className="text-v3-ink2">Amount</dt>
              <dd className="v3-num font-bold">{formatEur(paid.amountCents)}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-v3-ink2">PayPal order</dt>
              <dd className="break-all font-mono text-xs font-semibold">{paid.orderId ?? "—"}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-v3-ink2">Capture ID</dt>
              <dd className="break-all font-mono text-xs font-semibold">{paid.captureId ?? "—"}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-v3-ink2">A PayPal Sandbox test transaction. It is not a purchase from the simulated store.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <BaseLink to={`/negotiation/${s.sessionId}`} className={btn("secondary", "sm")}>
          Open negotiation
        </BaseLink>
        {s.status === "ready" || s.status === "completed" ? (
          <BaseLink to={`/deals/${s.sessionId}`} className={btn("secondary", "sm")}>
            Open offer
          </BaseLink>
        ) : null}
        {paid && (
          <BaseLink to={`/checkout/${s.sessionId}`} className={btn("secondary", "sm")}>
            Open receipt
          </BaseLink>
        )}
      </div>
    </div>
  );
}
