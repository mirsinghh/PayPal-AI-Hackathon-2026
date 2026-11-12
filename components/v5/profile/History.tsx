"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiFailure } from "@/lib/api";
import { formatEur } from "@/shared/format";
import { SELLER_BRANDS } from "@/shared/sellers";
import { SELLER_IDS, type PublicMandate, type SellerId } from "@/shared/contracts/types";
import { AuthorizationRecord } from "@/components/v5/autobuy/AutoBuyRun";
import { CHECKOUT_LABEL, MANDATE_STATUS_LABEL } from "@/lib/v5/autobuy";
import { Chip, Notice, Spinner, btn, type ChipTone } from "@/components/v3/ui";
import { MODE_LABEL, fallbackReasonLabel } from "@/lib/v5/response-mode";
import type { History, HistoryPayment, HistorySession } from "@/server/db/history";
import { useAuth, type SessionUser } from "@/components/v5/AuthProvider";

type Loaded = History & { user: SessionUser };
type State = { s: "loading" } | { s: "error"; message: string; status: number } | { s: "ready"; data: Loaded };

/** The signed-in user's data, from /api/history (Supabase RLS). Redirect-free: the pages decide what to show when signed out. */
export function useHistory(enabled: boolean): { state: State; reload: () => void } {
  const [state, setState] = useState<State>({ s: "loading" });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    api<Loaded>("/api/history", { cache: "no-store" })
      .then((data) => alive && setState({ s: "ready", data }))
      .catch((e: ApiFailure) => alive && setState({ s: "error", message: e.message, status: e.status }));
    return () => {
      alive = false;
    };
  }, [enabled, nonce]);
  return { state, reload: useCallback(() => (setState({ s: "loading" }), setNonce((n) => n + 1)), []) };
}

/** Wraps a page that needs a signed-in user: handles loading, signed-out and "accounts disabled". */
export function MemberGate({ children }: { children: (user: SessionUser) => React.ReactNode }) {
  const { status, user, accounts } = useAuth();
  if (status === "loading") return <Center><Spinner /> Loading your account…</Center>;
  if (!accounts)
    return (
      <Center>
        <div className="max-w-md space-y-4 text-center">
          <p className="font-v3-head text-2xl font-extrabold">Accounts are not enabled on this deployment.</p>
          <p className="text-v3-ink2">You can still negotiate and pay with PayPal Sandbox. Activity from this browser is listed under “This browser”.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/brief" className={btn("primary", "md")}>New negotiation</Link>
            <Link href="/activity" className={btn("secondary", "md")}>This browser</Link>
          </div>
        </div>
      </Center>
    );
  if (!user)
    return (
      <Center>
        <div className="max-w-md space-y-4 text-center">
          <p className="font-v3-head text-2xl font-extrabold">Sign in to see your history.</p>
          <p className="text-v3-ink2">Your requests, analyses, negotiations and payments are saved to your account.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/login?next=/profile" className={btn("primary", "md")}>Sign in</Link>
            <Link href="/signup?next=/profile" className={btn("secondary", "md")}>Create an account</Link>
          </div>
        </div>
      </Center>
    );
  return <>{children(user)}</>;
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-[50vh] w-full max-w-[1240px] items-center justify-center gap-3 px-4 py-16 text-v3-ink2">{children}</div>;
}

/* ---------- formatting ---------- */

export const when = (iso: string) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "");
const PRIORITY: Record<string, string> = { lowest_price: "Lowest price", fast_delivery: "Fast delivery", best_value: "Best value" };
const sellerName = (id: string | null) => (id && (SELLER_IDS as readonly string[]).includes(id) ? SELLER_BRANDS[id as SellerId].brand : (id ?? "—"));

export function statusChip(s: HistorySession, pay: HistoryPayment | undefined): { tone: ChipTone; text: string } {
  if (pay?.status === "completed") return { tone: "success", text: "Paid (Sandbox)" };
  if (s.approvedOfferId) return { tone: "primary", text: "Approved" };
  if (s.status === "failed") return { tone: "danger", text: "No deal" };
  if (s.status === "negotiating" || s.status === "preparing") return { tone: "warn", text: "In progress" };
  return { tone: "neutral", text: "Offers ready" };
}

export function paymentFor(payments: HistoryPayment[], sessionId: string): HistoryPayment | undefined {
  return payments.find((p) => p.sessionId === sessionId && p.status === "completed") ?? payments.find((p) => p.sessionId === sessionId);
}

export function modeLabel(s: HistorySession): { tone: ChipTone; text: string } {
  if (s.responseMode === "ai") return s.engineMode === "multi_agent" ? { tone: "primary", text: MODE_LABEL.ai } : { tone: "warn", text: "AI requested · server fallback" };
  if (s.responseMode === "server") return { tone: "accent", text: MODE_LABEL.server };
  return { tone: "neutral", text: "Earlier version" };
}

/* ---------- stats ---------- */

export function Stats({ sessions, payments }: { sessions: HistorySession[]; payments: HistoryPayment[] }) {
  const paid = payments.filter((p) => p.status === "completed");
  const paidIds = new Set(paid.map((p) => p.sessionId));
  // Savings are counted for deals the user actually paid for (Sandbox), so the number is a result, not a promise.
  const saved = sessions.filter((s) => paidIds.has(s.id)).reduce((n, s) => n + (s.savingsCents ?? 0), 0);
  const stats = [
    { k: "Requests", v: String(sessions.length) },
    { k: "Negotiations finished", v: String(sessions.filter((s) => s.status === "ready" || s.status === "completed").length) },
    { k: "Sandbox payments", v: String(paid.length) },
    { k: "Saved on paid deals", v: formatEur(saved) },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((s) => (
        <div key={s.k} className="v3-card p-4">
          <dt className="text-xs font-extrabold uppercase tracking-wider text-v3-ink2">{s.k}</dt>
          <dd className="v3-num mt-1 font-v3-head text-3xl font-extrabold">{s.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------- history lists ---------- */

export type Facet = "requests" | "analyses" | "negotiations";
export const FACETS: { id: Facet; label: string }[] = [
  { id: "requests", label: "Requests" },
  { id: "analyses", label: "Analyses" },
  { id: "negotiations", label: "Negotiations" },
];

/** The user's Agent Auto-Buy mandates by negotiation. Failure just means "no Auto-Buy data": the rest of the history is unaffected. */
function useMandates(): Map<string, PublicMandate> {
  const [list, setList] = useState<PublicMandate[]>([]);
  useEffect(() => {
    let alive = true;
    api<{ mandates: PublicMandate[] }>("/api/auto-buy/mandates", { cache: "no-store" })
      .then((r) => alive && setList(r.mandates))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return useMemo(() => new Map(list.map((m) => [m.sessionId, m])), [list]);
}

export function HistoryList({ data, facet, limit }: { data: Loaded; facet: Facet; limit?: number }) {
  const rows = useMemo(() => (limit ? data.sessions.slice(0, limit) : data.sessions), [data.sessions, limit]);
  const mandates = useMandates();
  if (rows.length === 0)
    return (
      <div className="v3-card p-8 text-center">
        <p className="font-v3-head text-xl font-extrabold">Nothing here yet.</p>
        <p className="mt-2 text-v3-ink2">Your negotiations are saved here when you start them while signed in.</p>
        <Link href="/brief" className={btn("primary", "md", "mt-5")}>Start your first negotiation</Link>
      </div>
    );
  return (
    <ul className="space-y-3">
      {rows.map((s) => (
        <li key={s.id}>
          <Row s={s} pay={paymentFor(data.payments, s.id)} facet={facet} mandate={mandates.get(s.id)} />
        </li>
      ))}
    </ul>
  );
}

function Row({ s, pay, facet, mandate }: { s: HistorySession; pay: HistoryPayment | undefined; facet: Facet; mandate?: PublicMandate }) {
  // Agent Auto-Buy: the mandate's own state explains what happened. "Paid" still comes only from a completed payment record.
  const base = statusChip(s, pay);
  const st = mandate && pay?.status !== "completed" ? { tone: (mandate.status === "executed" ? "success" : mandate.status === "active" ? "primary" : mandate.status === "pending_reconciliation" ? "warn" : "neutral") as ChipTone, text: MANDATE_STATUS_LABEL[mandate.status] } : base;
  const mode = modeLabel(s);
  const finished = s.status === "ready" || s.status === "completed";
  return (
    <article className="v3-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-v3-head text-lg font-extrabold">{s.productQuery ?? "Request"}</h3>
          <p className="mt-0.5 text-sm text-v3-ink2">
            {when(s.createdAt)}
            {s.budgetCents !== null && <> · up to {formatEur(s.budgetCents)}</>}
            {s.priority && <> · {PRIORITY[s.priority] ?? s.priority}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip tone={st.tone}>{st.text}</Chip>
          <Chip tone={mandate ? "primary" : "neutral"}>{mandate ? CHECKOUT_LABEL.auto_buy : CHECKOUT_LABEL.manual}</Chip>
          {facet === "negotiations" && <Chip tone={mode.tone}>{mode.text}</Chip>}
        </div>
      </div>

      {facet === "analyses" && (
        <div className="mt-3 text-[0.95rem]">
          <div className="flex flex-wrap gap-1.5">
            <Chip tone={s.analysisSource === "llm" ? "primary" : "accent"}>{s.analysisSource === "llm" ? `AI analysis${s.analysisProvider ? ` · ${s.analysisProvider}` : ""}` : "Rules-based analysis"}</Chip>
          </div>
          <p className="mt-2 text-v3-ink2">{s.analysisSummary ?? "No analysis was recorded for this request."}</p>
        </div>
      )}

      {facet === "negotiations" && (
        <div className="mt-3 text-[0.95rem] text-v3-ink2">
          {finished && s.winnerSeller ? (
            <p>
              <strong className="text-v3-ink">{sellerName(s.winnerSeller)}</strong>
              {s.finalPriceCents !== null && <> · <span className="v3-num font-bold text-v3-ink">{formatEur(s.finalPriceCents)}</span></>}
              {s.initialPriceCents !== null && s.finalPriceCents !== null && s.initialPriceCents > s.finalPriceCents && <> (opened at <span className="v3-num line-through">{formatEur(s.initialPriceCents)}</span>, saved {formatEur(s.initialPriceCents - s.finalPriceCents)})</>}
              {s.offerCount ? <> · {s.offerCount} offers compared</> : null}
            </p>
          ) : (
            <p>{s.status === "failed" ? "The negotiation did not produce an offer within the budget." : "No final offer recorded."}</p>
          )}
          {s.responseMode === "ai" && s.engineMode !== "multi_agent" && <p className="mt-1 text-v3-warn">AI could not run ({fallbackReasonLabel(s.fallbackReason)}); server rules answered instead.</p>}
          {pay && <p className="mt-1">PayPal Sandbox order <span className="font-mono text-xs">{pay.paypalOrderId ?? "—"}</span> · {pay.status}{pay.amountCents !== null && <> · {formatEur(pay.amountCents)}</>}</p>}
          <p className="mt-1 text-xs">Sandbox payment · simulated stores</p>
          {mandate && (
            <div className="mt-3">
              <AuthorizationRecord mandate={mandate} />
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {finished && (
          <Link href={`/deals/${s.id}`} className={btn("secondary", "sm")}>
            {facet === "analyses" ? "Open analysis and offers" : "Open the offers"}
          </Link>
        )}
        <Link href={`/negotiation/${s.id}`} className={btn("ghost", "sm")}>
          Reopen the negotiation
        </Link>
      </div>
    </article>
  );
}

export function HistoryErrors({ state, reload }: { state: Exclude<State, { s: "ready" }>; reload: () => void }) {
  if (state.s === "loading") return <Center><Spinner /> Loading your history…</Center>;
  return (
    <Notice tone="danger">
      {state.message}{" "}
      <button type="button" onClick={reload} className="font-bold underline">
        Try again
      </button>
    </Notice>
  );
}
