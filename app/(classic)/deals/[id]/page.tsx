"use client";

import { LayoutGroup } from "motion/react";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiFailure, useSession, type SessionWithPayment } from "@/lib/api";
import { bestFacets, deliveryLabel, offerImage, offerName, warrantyLabel } from "@/lib/offer-view";
import { formatEur } from "@/shared/format";
import { SELLER_BRANDS } from "@/shared/sellers";
import type { Offer } from "@/shared/contracts/types";
import { Badge, ErrorState, LoadingState, StatusBanner } from "@/components/ui";
import { IconCheck, IconPackage, IconReturn, IconShield, IconTruck } from "@/components/icons";
import { ProductImage } from "@/components/ProductImage";
import { SellerMark } from "@/components/SellerMark";
import { Reveal } from "@/components/Reveal";
import { Segmented } from "@/components/Segmented";
import { OfferCard } from "@/components/offers/OfferCard";
import { CompareMatrix } from "@/components/offers/CompareMatrix";
import { ApprovalPanel } from "@/components/offers/ApprovalPanel";

type SortKey = "match" | "price" | "delivery";
const SORTS: { id: SortKey; label: string }[] = [
  { id: "match", label: "Best match" },
  { id: "price", label: "Lowest price" },
  { id: "delivery", label: "Fastest" },
];
const PRIORITY_LABEL = { lowest_price: "Lowest price", fast_delivery: "Fast delivery", best_value: "Best value" } as const;

export default function DealPage({ params }: PageProps<"/deals/[id]">) {
  const { id } = use(params);
  const { state, reload } = useSession(id);
  if (state.status === "loading") return <LoadingState label="Preparing your offers…" />;
  if (state.status === "error") return <ErrorState message={state.error.message} onRetry={state.error.status === 0 ? reload : undefined} />;
  return <Deal s={state.data} />;
}

function Deal({ s }: { s: SessionWithPayment }) {
  const router = useRouter();
  const h1 = useRef<HTMLHeadingElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("match");
  useEffect(() => h1.current?.focus({ preventScroll: true }), []);

  const winner = s.offers.find((o) => o.offerId === s.recommendedOfferId)!;
  const live = s.mode === "multi_agent";
  const ev = s.evaluation;
  const [now] = useState(() => Date.now());
  const expired = new Date(winner.offerExpiresAt).getTime() < now;
  const paid = s.payment?.status === "completed";
  const facets = useMemo(() => bestFacets(s.offers), [s.offers]);

  const ordered = useMemo(() => {
    const rank = new Map(ev.rankedOfferIds.map((id, i) => [id, i]));
    const key = (o: Offer) => (sort === "price" ? o.finalPriceCents : sort === "delivery" ? o.deliveryDays : (rank.get(o.offerId) ?? 99));
    // Offers that can't be bought always sit last, whatever the sort.
    return [...s.offers].sort((a, b) => Number(!a.eligible) - Number(!b.eligible) || key(a) - key(b) || (rank.get(a.offerId) ?? 99) - (rank.get(b.offerId) ?? 99));
  }, [s.offers, ev.rankedOfferIds, sort]);

  async function approve() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/negotiations/${s.sessionId}/approve`, { method: "POST", body: JSON.stringify({ offerId: winner.offerId }) });
      router.push(`/checkout/${s.sessionId}`);
    } catch (e) {
      setError((e as ApiFailure).message);
      setBusy(false);
    }
  }

  const cat = winner.catalog;
  const eligibleCount = s.offers.filter((o) => o.eligible).length;

  return (
    <div className="space-y-10">
      <title>Best offer · AgentDeal</title>

      <header>
        <Badge tone="success" icon={<IconCheck size={12} />}>
          Negotiation complete
        </Badge>
        <h1 ref={h1} tabIndex={-1} className="mt-4 max-w-3xl font-display text-[clamp(2.25rem,1.5rem+3.4vw,4rem)] leading-[1.02] outline-none text-balance">
          <em>{SELLER_BRANDS[winner.sellerId].brand}</em> has the best offer for you.
        </h1>
        <p className="mt-4 text-body text-ink-2">
          For <span className="text-ink">{s.intent.productQuery}</span> · up to {formatEur(s.intent.budgetCents)} · {PRIORITY_LABEL[s.intent.priority]}. {eligibleCount} of {s.offers.length} offers fit your budget.
        </p>
      </header>

      <div className="grid gap-x-10 gap-y-12 lg:grid-cols-[minmax(0,1fr)_23rem]">
        {/* 1. The recommendation: the product first, then the reasons, set as a page rather than a stack of boxes. */}
        <Reveal index={0} className="lg:col-start-1">
          <section aria-labelledby="rec-title">
            <div className="grid gap-6 sm:grid-cols-[13.5rem_minmax(0,1fr)] sm:gap-8">
              <figure>
                <ProductImage src={offerImage(winner)} alt={offerName(winner)} className="w-full max-w-[16rem] sm:max-w-none" sizes="(min-width: 640px) 216px, 256px" priority />
                <figcaption className="eyebrow mt-2.5">Illustrative image</figcaption>
              </figure>
              <div className="min-w-0">
                <Badge tone="primary" icon={<IconCheck size={12} />}>
                  Recommended
                </Badge>
                <h2 id="rec-title" className="mt-3 text-h2 font-semibold text-pretty">
                  {offerName(winner)}
                </h2>
                <p className="mt-1.5 flex items-center gap-2 text-small text-ink-2">
                  <SellerMark id={winner.sellerId} size={22} />
                  <span className="font-medium text-ink">{SELLER_BRANDS[winner.sellerId].brand}</span>
                  {live ? "· demo store" : "· simulated seller"}
                </p>
                <p className="tabular mt-5 font-display text-[clamp(3.25rem,2.4rem+3.6vw,5rem)] leading-none">{formatEur(winner.finalPriceCents)}</p>
                <p className="tabular mt-2 text-small text-ink-2">
                  {cat ? (
                    <>
                      {formatEur(cat.itemPriceCents)} item + {cat.shippingCents === 0 ? "free shipping" : `${formatEur(cat.shippingCents)} shipping`}
                    </>
                  ) : (
                    "Total price"
                  )}
                  {winner.discountCents > 0 && (
                    <>
                      {" "}
                      · <span className="line-through">{formatEur(winner.initialPriceCents)}</span> at first, {formatEur(winner.discountCents)} lower after negotiating
                    </>
                  )}
                </p>
                <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2.5 text-small">
                  {[
                    { icon: <IconTruck size={17} />, v: `${deliveryLabel(winner.deliveryDays)} delivery` },
                    { icon: <IconShield size={17} />, v: `${warrantyLabel(winner.warrantyMonths)} warranty` },
                    { icon: <IconPackage size={17} />, v: cat ? (cat.shippingCents === 0 ? "Free shipping" : `${formatEur(cat.shippingCents)} shipping`) : winner.freeShipping ? "Free shipping" : "Paid shipping" },
                    { icon: <IconReturn size={17} />, v: cat ? `${cat.returnDays}-day returns` : "Returns per store terms" },
                  ].map((f) => (
                    <li key={f.v} className="flex items-center gap-2">
                      <span className="text-ink-2">{f.icon}</span>
                      {f.v}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-caption text-ink-2">{live ? "Demo-store terms and inventory." : "Simulated terms."} Nothing will be shipped.</p>
              </div>
            </div>

            {/* Why: an editorial pull-quote and plain reasons, with the AI / rules origin always labelled. */}
            <div className="mt-10 border-t border-line pt-8">
              <div className="flex flex-wrap items-center gap-2">
                <p className="eyebrow">Why this offer</p>
                {ev.source === "llm" ? <Badge tone="primary">AI analysis{ev.modelName ? ` · ${ev.modelName}` : ""}</Badge> : <Badge tone="warning">Rule-based explanation</Badge>}
              </div>
              {s.mode === "v0_rules" && s.fallbackReason && (
                <div className="mt-3">
                  <StatusBanner tone="warning">Multi-agent AI negotiation wasn&apos;t used ({s.fallbackReason.replace(/_/g, " ")}); this is the rule-based simulation.</StatusBanner>
                </div>
              )}
              {ev.source === "rules_fallback" && (
                <div className="mt-3">
                  <StatusBanner tone="warning">AI analysis was unavailable, so this recommendation was explained by rules.</StatusBanner>
                </div>
              )}
              <blockquote className="mt-5 max-w-2xl font-display text-[clamp(1.5rem,1.2rem+1.2vw,2rem)] italic leading-[1.2] text-balance">{ev.aiSummary}</blockquote>
              <div className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
                {ev.aiReasons.length > 0 && (
                  <ul className="space-y-2.5">
                    {ev.aiReasons.map((r) => (
                      <li key={r} className="flex gap-2.5 text-small">
                        <span className="mt-0.5 text-primary">
                          <IconCheck size={16} />
                        </span>
                        <span className="text-pretty">{r}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {ev.tradeoffs.length > 0 && (
                  <div>
                    <p className="text-small font-medium">Trade-offs to know</p>
                    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-small text-ink-2 marker:text-line-strong">
                      {ev.tradeoffs.map((r) => (
                        <li key={r} className="text-pretty">
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {live && s.agentRun && (
                <details className="mt-6 text-caption text-ink-2">
                  <summary className="cursor-pointer rounded-sm py-1 font-medium text-ink">How the agents ran</summary>
                  <p className="mt-1.5">
                    {s.agentRun.llmCallsSucceeded} real model calls succeeded of {s.agentRun.llmCallsAttempted} attempted · {s.agentRun.fallbackCount} rule-based fallback
                    {s.agentRun.fallbackCount === 1 ? "" : "s"} · {s.agentRun.rejectedProposals} proposal{s.agentRun.rejectedProposals === 1 ? "" : "s"} rejected by the server ·{" "}
                    {s.agentRun.inputTokens + s.agentRun.outputTokens} tokens
                  </p>
                </details>
              )}
            </div>
          </section>
        </Reveal>

        {/* 2. Approval slip: right column on desktop, straight after the recommendation on mobile. */}
        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start lg:sticky lg:top-24">
          <ApprovalPanel
            sessionId={s.sessionId}
            offer={winner}
            expired={expired}
            paid={paid}
            busy={busy}
            error={error}
            onApprove={approve}
            confirmationHref={`/checkout/${s.sessionId}`}
            live={live}
          />
        </div>

        {/* 3. Comparison: a side-by-side matrix on wide screens, compact cards on phones. */}
        <Reveal index={1} className="lg:col-start-1">
          <section aria-labelledby="cmp-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="cmp-title" className="font-display text-[1.875rem] leading-none">
                {live ? "All four demo-store offers" : "All four simulated offers"}
              </h2>
              <Segmented name="sort" legend="Sort offers" hideLegend options={SORTS} value={sort} onChange={setSort} />
            </div>
            <LayoutGroup>
              <div className="mt-5">
                <CompareMatrix offers={ordered} scores={ev.scores} recommended={winner} facets={facets} />
                <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
                  {ordered.map((o) => (
                    <OfferCard key={o.offerId} offer={o} score={ev.scores[o.offerId]} recommended={o.offerId === winner.offerId} recommendedOffer={winner} facets={facets} />
                  ))}
                </ul>
              </div>
            </LayoutGroup>
            <p className="mt-4 text-caption text-ink-2">
              The recommendation comes from the match score, not from a single row. “Lowest price”, “Fastest” and “Longest” only mark the best value in each row; the recommendation is never recoloured.
            </p>
          </section>
        </Reveal>
      </div>
    </div>
  );
}
