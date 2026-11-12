"use client";

import { fallbackReasonLabel } from "@/lib/v5/response-mode";
import { BaseLink } from "@/components/v3/BaseLink";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, useSession, type ApiFailure, type SessionWithPayment } from "@/lib/api";
import { bestFacets, deliveryLabel, offerImage, offerName, warrantyLabel } from "@/lib/offer-view";
import { formatEur } from "@/shared/format";
import { SELLER_BRANDS } from "@/shared/sellers";
import type { Offer } from "@/shared/contracts/types";
import { useAppBase } from "@/lib/v3/base";
import { cueForApproval } from "@/lib/v3/mascot/event-map";
import { useAgentDirector, usePreloadAgentD } from "@/lib/v3/mascot/hooks";
import { AgentD, AgentDActor } from "@/components/v3/mascot/AgentD";
import { Chip, ErrorScreen, LoadingScreen, Notice, ProductImage, StoreMark, btn } from "@/components/v3/ui";
import { IconCheck, IconPackage, IconReturn, IconShield, IconTruck } from "@/components/v3/icons";
import { dealIntel, tradeoffLines } from "@/lib/v3/deal-intel";
import { ApprovalCard, type ApprovalState } from "./ApprovalCard";
import { DealIntelligence } from "./DealIntelligence";
import { CompareBoard } from "./CompareBoard";
import { AutoBuyRun } from "@/components/v5/autobuy/AutoBuyRun";

type SortKey = "match" | "price" | "delivery";
const SORTS: { id: SortKey; label: string }[] = [
  { id: "match", label: "Best match" },
  { id: "price", label: "Lowest price" },
  { id: "delivery", label: "Fastest" },
];
/** Long enough to see Agent D accept the offer and to read what happens next. */
const AUTO_CHECKOUT_MS = 2200;
const PRIORITY_LABEL = { lowest_price: "Lowest price", fast_delivery: "Fast delivery", best_value: "Best value" } as const;

export function DealExperience({ id, labSlot, analysisLabel }: { id: string; /** V4: renders the Decision Lab between the recommendation and the comparison. */ labSlot?: (s: SessionWithPayment) => ReactNode; /** V4: label of the explanation (provider and model, or rules). */ analysisLabel?: (ev: SessionWithPayment["evaluation"]) => string }) {
  usePreloadAgentD(["success", "accept", "idle"]);
  const { state, reload } = useSession(id);
  if (state.status === "loading")
    return (
      <LoadingScreen label="Agent D is laying out your offers…">
        <AgentD state="thinking" size={132} label={null} priority />
      </LoadingScreen>
    );
  if (state.status === "error")
    return (
      <ErrorScreen message={state.error.message} onRetry={state.error.status === 0 ? reload : undefined}>
        <AgentD state="surprised" size={120} label={null} />
      </ErrorScreen>
    );
  const s = state.data;
  const winner = s.offers.find((o) => o.offerId === s.recommendedOfferId) ?? null;

  // The review only exists once the negotiation produced a server-validated recommendation.
  if (s.status === "negotiating")
    return (
      <ErrorScreen message="Agent D is still negotiating. The offers will be ready for review when it finishes.">
        <AgentD state="negotiating" size={132} label={null} />
        <BaseLink to={`/negotiation/${s.sessionId}`} className={btn("primary", "md")}>
          Watch the negotiation
        </BaseLink>
      </ErrorScreen>
    );
  if (s.status === "failed" || !winner)
    return (
      <ErrorScreen message="The negotiation didn’t produce an offer within your budget. Nothing was paid.">
        <AgentD state="reject" size={120} label={null} />
      </ErrorScreen>
    );
  return <Deal s={s} winner={winner} labSlot={labSlot} analysisLabel={analysisLabel} />;
}

function Deal({ s, winner, labSlot, analysisLabel }: { s: SessionWithPayment; winner: Offer; labSlot?: (s: SessionWithPayment) => ReactNode; analysisLabel?: (ev: SessionWithPayment["evaluation"]) => string }) {
  const h1 = useRef<HTMLHeadingElement>(null);
  const router = useRouter();
  const base = useAppBase();
  const [autoGo, setAutoGo] = useState(false); // true only after an approval confirmed by the server in this visit
  const live = s.mode === "multi_agent";
  const ev = s.evaluation;
  // Agent D presents the result once when the screen opens; this is a recommendation, never an authorisation.
  const agent = useAgentDirector("idle", { key: `present:${s.sessionId}`, state: "success" });
  const [approvalState, setApprovalState] = useState<ApprovalState>(s.approvedOfferId === winner.offerId ? "approved" : "ready");
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("match");
  const [now] = useState(() => Date.now());
  const expired = new Date(winner.offerExpiresAt).getTime() < now;
  const paid = s.payment?.status === "completed";
  const facets = useMemo(() => bestFacets(s.offers), [s.offers]);
  const intel = useMemo(() => dealIntel(s), [s]);
  const tradeoffs = useMemo(() => tradeoffLines(winner, s.offers), [winner, s.offers]);
  const eligibleCount = s.offers.filter((o) => o.eligible).length;
  const cat = winner.catalog;
  const brand = SELLER_BRANDS[winner.sellerId].brand;

  useEffect(() => {
    h1.current?.focus({ preventScroll: true });
  }, []);

  // Agent D opens the checkout for you, but only after the server confirmed your approval, and you can stay. The
  // PayPal authorisation itself still happens on the next page, with PayPal's own button.
  useEffect(() => {
    if (!autoGo) return;
    const t = window.setTimeout(() => router.push(`${base}/checkout/${s.sessionId}`), AUTO_CHECKOUT_MS);
    return () => window.clearTimeout(t);
  }, [autoGo, router, s.sessionId, base]);

  const ordered = useMemo(() => {
    const rank = new Map(ev.rankedOfferIds.map((oid, i) => [oid, i]));
    const key = (o: Offer) => (sort === "price" ? o.finalPriceCents : sort === "delivery" ? o.deliveryDays : (rank.get(o.offerId) ?? 99));
    // Offers that cannot be bought always sit last, whatever the sort.
    return [...s.offers].sort((a, b) => Number(!a.eligible) - Number(!b.eligible) || key(a) - key(b) || (rank.get(a.offerId) ?? 99) - (rank.get(b.offerId) ?? 99));
  }, [s.offers, ev.rankedOfferIds, sort]);

  async function approve() {
    if (approvalState === "approving") return;
    setApprovalState("approving");
    setError(null);
    try {
      const res = await api<{ approvedOfferId: string }>(`/api/negotiations/${s.sessionId}/approve`, { method: "POST", body: JSON.stringify({ offerId: winner.offerId }) });
      // Agent D reacts only to the server's confirmation naming this very offer.
      const cue = cueForApproval(res, winner.offerId);
      if (!cue) throw new Error("approval_unconfirmed");
      agent.react(cue);
      setApprovalState("approved");
      setAutoGo(true);
    } catch (e) {
      setError((e as ApiFailure).message === "approval_unconfirmed" ? "The server did not confirm that approval. Nothing was approved." : (e as ApiFailure).message || "Something went wrong.");
      setApprovalState("ready");
    }
  }

  const savedVsOpening = winner.discountCents > 0 ? winner.discountCents : 0;
  const underBudget = s.intent.budgetCents - winner.finalPriceCents;

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <title>Agent D found your best deal</title>

      {/* Agent D presents the result. */}
      <header className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="flex shrink-0 flex-col items-center">
          <AgentDActor director={agent.handle} size={190} label="Agent D, presenting the best offer" priority />
          <span aria-hidden className="v3-shadow-blob -mt-3" />
        </div>
        <div className="min-w-0 flex-1 pb-4">
          <Chip tone={paid ? "success" : approvalState === "approved" ? "primary" : "success"} icon={<IconCheck size={13} />}>
            {paid ? "Paid · confirmed by the server" : s.checkoutMode === "auto_buy" ? "Agent Auto-Buy · purchase handled by Agent D" : approvalState === "approved" ? "Approved by you · not paid yet" : "Negotiation finished · awaiting your approval"}
          </Chip>
          <h1 ref={h1} tabIndex={-1} className="v3-display mt-4 max-w-3xl text-[clamp(2.3rem,1.4rem+4vw,4.4rem)] outline-none">
            Agent D found your <span className="v3-hl">best deal.</span>
          </h1>
          <p className="mt-4 text-[1.05rem] text-v3-ink2">
            For <strong className="text-v3-ink">{s.intent.productQuery}</strong> · up to {formatEur(s.intent.budgetCents)} · {PRIORITY_LABEL[s.intent.priority]}. {eligibleCount} of {s.offers.length} offers fit your budget.
          </p>
        </div>
      </header>

      <div className="mt-10 grid gap-x-10 gap-y-12 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-12">
          {/* The recommendation. */}
          <section aria-labelledby="rec-title" className="v3-card p-5 sm:p-8">
            <div className="grid gap-6 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-8">
              <figure>
                <ProductImage src={offerImage(winner)} alt={offerName(winner)} className="w-full max-w-[15rem] sm:max-w-none" sizes="(min-width: 640px) 208px, 240px" priority />
                <figcaption className="mt-2 text-xs font-semibold text-v3-ink2">Illustrative image</figcaption>
              </figure>
              <div className="min-w-0">
                <Chip tone="primary" icon={<IconCheck size={13} />}>
                  Recommended by Agent D
                </Chip>
                <h2 id="rec-title" className="mt-3 text-xl font-extrabold leading-snug text-pretty">
                  {offerName(winner)}
                </h2>
                <p className="mt-1.5 flex items-center gap-2 text-[0.95rem] text-v3-ink2">
                  <StoreMark id={winner.sellerId} size={24} />
                  <span className="font-bold text-v3-ink">{brand}</span>· {live ? "demo store" : "simulated seller"}
                </p>
                <p className="v3-num mt-5 font-v3-head text-[clamp(3.4rem,2.4rem+4vw,5.6rem)] font-extrabold leading-none tracking-tight">{formatEur(winner.finalPriceCents)}</p>
                <p className="v3-num mt-2 text-[0.95rem] text-v3-ink2">
                  {cat ? (
                    <>
                      {formatEur(cat.itemPriceCents)} item + {cat.shippingCents === 0 ? "free shipping" : `${formatEur(cat.shippingCents)} shipping`}
                    </>
                  ) : (
                    "Total price"
                  )}
                </p>
                {/* Only arithmetic that is true by construction: the store's own opening price and your own budget. */}
                <ul className="mt-4 flex flex-wrap gap-2">
                  {savedVsOpening > 0 && (
                    <li>
                      <Chip tone="success">
                        {formatEur(savedVsOpening)} lower than {brand}’s opening price ({formatEur(winner.initialPriceCents)})
                      </Chip>
                    </li>
                  )}
                  <li>
                    <Chip tone="primary">{underBudget === 0 ? "Exactly on your budget" : `${formatEur(underBudget)} under your ${formatEur(s.intent.budgetCents)} budget`}</Chip>
                  </li>
                </ul>
                <ul className="mt-5 grid gap-x-6 gap-y-2.5 text-[0.95rem] font-semibold sm:grid-cols-2">
                  {[
                    { icon: <IconTruck size={18} />, v: `${deliveryLabel(winner.deliveryDays)} delivery` },
                    { icon: <IconShield size={18} />, v: `${warrantyLabel(winner.warrantyMonths)} warranty` },
                    { icon: <IconPackage size={18} />, v: cat ? (cat.shippingCents === 0 ? "Free shipping" : `${formatEur(cat.shippingCents)} shipping`) : winner.freeShipping ? "Free shipping" : "Paid shipping" },
                    { icon: <IconReturn size={18} />, v: cat ? `${cat.returnDays}-day returns` : "Returns per store terms" },
                  ].map((f) => (
                    <li key={f.v} className="flex items-center gap-2.5">
                      <span className="text-v3-primary-ink">{f.icon}</span>
                      {f.v}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-v3-ink2">{live ? "Demo-store terms and inventory." : "Simulated terms."} Nothing will be shipped.</p>
              </div>
            </div>

            {intel && <DealIntelligence intel={intel} tradeoffs={tradeoffs} live={live} />}

            {/* Why: advantages and trade-offs, with the origin (AI or rules) always labelled. */}
            <div className="mt-8 border-t border-v3-line pt-7">
              <div className="flex flex-wrap items-center gap-2">
                <p className="v3-eyebrow">Why this offer</p>
                {ev.source === "llm" ? <Chip tone="primary">{analysisLabel ? analysisLabel(ev) : `AI analysis${ev.modelName ? ` · ${ev.modelName}` : ""}`}</Chip> : <Chip tone="accent">{analysisLabel ? analysisLabel(ev) : "Rule-based explanation"}</Chip>}
              </div>
              {s.mode === "v0_rules" && s.fallbackReason && (
                <Notice tone="warn" className="mt-3">
                  {s.responseMode === "ai"
                    ? `You chose AI Agents, but AI could not run (${fallbackReasonLabel(s.fallbackReason)}); the stores answered with backup server rules.`
                    : `Multi-agent AI negotiation wasn't used (${s.fallbackReason.replace(/_/g, " ")}); this is the rule-based simulation.`}
                </Notice>
              )}
              {ev.source === "rules_fallback" && (
                <Notice tone="warn" className="mt-3">
                  AI analysis was unavailable, so this recommendation was explained by rules.
                </Notice>
              )}
              <blockquote className="mt-5 max-w-2xl font-v3-head text-[clamp(1.35rem,1.1rem+1vw,1.8rem)] font-bold leading-snug text-balance">“{ev.aiSummary}”</blockquote>
              <div className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
                {ev.aiReasons.length > 0 && (
                  <div>
                    <p className="text-sm font-extrabold text-v3-success">Advantages</p>
                    <ul className="mt-2 space-y-2.5">
                      {ev.aiReasons.map((r) => (
                        <li key={r} className="flex gap-2.5 text-[0.95rem]">
                          <span className="mt-0.5 text-v3-success"><IconCheck size={17} /></span>
                          <span className="text-pretty">{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {ev.tradeoffs.length > 0 && (
                  <div>
                    <p className="text-sm font-extrabold text-v3-warn">Trade-offs to know</p>
                    <ul className="mt-2 list-disc space-y-2 pl-5 text-[0.95rem] text-v3-ink2 marker:text-v3-warn">
                      {ev.tradeoffs.map((r) => (
                        <li key={r} className="text-pretty">{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {live && s.agentRun && (
                <details className="mt-6 text-sm text-v3-ink2">
                  <summary className="cursor-pointer rounded-md py-1 font-bold text-v3-ink">How the agents ran</summary>
                  <p className="mt-1.5">
                    {s.agentRun.llmCallsSucceeded} real model calls succeeded of {s.agentRun.llmCallsAttempted} attempted · {s.agentRun.fallbackCount} rule-based fallback{s.agentRun.fallbackCount === 1 ? "" : "s"} · {s.agentRun.rejectedProposals} proposal{s.agentRun.rejectedProposals === 1 ? "" : "s"} rejected by the server · {s.agentRun.inputTokens + s.agentRun.outputTokens} tokens
                  </p>
                </details>
              )}
            </div>
          </section>

          {labSlot?.(s)}

          {/* Comparison. */}
          <section aria-labelledby="cmp-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="cmp-title" className="v3-h2 text-[clamp(1.7rem,1.3rem+1.6vw,2.4rem)]">
                {live ? "All four demo-store offers" : "All four simulated offers"}
              </h2>
              <div role="radiogroup" aria-label="Sort offers" className="inline-flex gap-1 rounded-v3-md bg-v3-sunken p-1">
                {SORTS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={sort === o.id}
                    onClick={() => setSort(o.id)}
                    className={`min-h-11 rounded-[10px] px-3.5 text-sm font-bold transition-colors duration-(--v3-d1) ${sort === o.id ? "bg-v3-surface text-v3-ink shadow-v3-card" : "text-v3-ink2 hover:text-v3-ink"}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-6">
              <CompareBoard offers={ordered} scores={ev.scores} recommended={winner} facets={facets} budgetCents={s.intent.budgetCents} />
            </div>
            <p className="mt-4 text-sm text-v3-ink2">
              The recommendation comes from the match score, not from a single row. “Lowest price”, “Fastest” and “Longest warranty” only mark the best value in each row.
            </p>
          </section>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          {s.checkoutMode === "auto_buy" ? (
            // Agent Auto-Buy: there is no manual approval. The purchase (or its recorded result) is shown instead.
            <AutoBuyRun session={s} />
          ) : (
            <ApprovalCard sessionId={s.sessionId} offer={winner} state={approvalState} expired={expired} paid={paid} error={error} live={live} onApprove={approve} redirecting={autoGo} onStay={() => setAutoGo(false)} />
          )}
        </div>
      </div>
    </div>
  );
}
