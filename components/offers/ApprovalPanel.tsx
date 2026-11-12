"use client";

import Link from "next/link";
import { deliveryLabel, offerImage, offerName, slipRef, warrantyLabel } from "@/lib/offer-view";
import { formatEur } from "@/shared/format";
import { SELLER_BRANDS } from "@/shared/sellers";
import type { Offer } from "@/shared/contracts/types";
import { IconArrowRight, IconLock } from "@/components/icons";
import { ProductImage } from "@/components/ProductImage";
import { SellerMark } from "@/components/SellerMark";
import { DealSlip, LedgerRow, SlipTotal, type SlipStage } from "@/components/slip/Slip";
import { Spinner, StatusBanner, arrowNudge, btnLarge, btnPrimary, btnSecondary } from "@/components/ui";

/**
 * What the buyer is about to approve: the exact item, store, total and terms, as ruled ledger rows.
 * Money is only displayed here; the server decides it.
 */
export function OfferSummary({ offer, withTerms = true }: { offer: Offer; withTerms?: boolean }) {
  const brand = SELLER_BRANDS[offer.sellerId].brand;
  const c = offer.catalog;
  return (
    <div>
      <div className="flex gap-4">
        <ProductImage src={offerImage(offer)} alt={offerName(offer)} className="size-20" sizes="80px" />
        <div className="min-w-0">
          <p className="text-body font-medium text-pretty">{offerName(offer)}</p>
          <p className="mt-1.5 flex items-center gap-2 text-small text-ink-2">
            <SellerMark id={offer.sellerId} size={18} />
            {brand} <span className="text-caption">(demo store)</span>
          </p>
        </div>
      </div>

      <dl className="mt-5 space-y-2.5">
        {c ? (
          <>
            <LedgerRow label="Item" value={formatEur(c.itemPriceCents)} />
            <LedgerRow label="Shipping" value={c.shippingCents === 0 ? "Free" : formatEur(c.shippingCents)} />
          </>
        ) : (
          <>
            <LedgerRow label="Starting offer" muted value={<span className="line-through">{formatEur(offer.initialPriceCents)}</span>} />
            {offer.discountCents > 0 && <LedgerRow label="Negotiated down" value={`−${formatEur(offer.discountCents)}`} />}
          </>
        )}
        {withTerms && (
          <>
            <LedgerRow label="Delivery" value={deliveryLabel(offer.deliveryDays)} />
            <LedgerRow label="Warranty" value={warrantyLabel(offer.warrantyMonths)} />
            {c && <LedgerRow label="Returns" value={`${c.returnDays} days`} />}
          </>
        )}
      </dl>
      <div className="mt-4">
        <SlipTotal>{formatEur(offer.finalPriceCents)}</SlipTotal>
      </div>
    </div>
  );
}

export function ApprovalPanel({
  sessionId,
  offer,
  expired,
  paid,
  busy,
  error,
  onApprove,
  confirmationHref,
  live,
}: {
  sessionId: string;
  offer: Offer;
  expired: boolean;
  paid: boolean;
  busy: boolean;
  error: string | null;
  onApprove: () => void;
  confirmationHref: string;
  live: boolean;
}) {
  const brand = SELLER_BRANDS[offer.sellerId].brand;
  const validUntil = new Date(offer.offerExpiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const stage: SlipStage = paid ? "paid" : "proposed";
  return (
    <section id="approve" aria-labelledby="approve-title">
      <p className="eyebrow text-primary">Step 1 of 2 · AgentDeal approval</p>
      <h2 id="approve-title" className="mt-2 font-display text-[1.875rem] leading-[1.05]">
        Approve this offer
      </h2>

      <DealSlip
        className="mt-4"
        stage={stage}
        reference={slipRef(sessionId)}
        footer={
          <div className="space-y-3">
            <p className="text-caption text-ink-2">
              Offer valid until {validUntil}. Delivery, warranty and returns are {live ? "demo-store" : "simulated"} terms; nothing will be shipped.
            </p>
            {expired && <StatusBanner tone="warning">This demo offer has expired. Start a new request.</StatusBanner>}
            {paid && <StatusBanner tone="success">Sandbox payment already completed for this negotiation.</StatusBanner>}
            {error && <StatusBanner tone="danger">{error}</StatusBanner>}

            {paid ? (
              <Link href={confirmationHref} className={`${btnPrimary} ${btnLarge} w-full`}>
                View receipt
              </Link>
            ) : (
              <button onClick={onApprove} disabled={busy || expired} className={`${btnPrimary} ${btnLarge} w-full`}>
                {busy ? (
                  <>
                    <Spinner /> Approving…
                  </>
                ) : (
                  <>
                    Approve and continue <IconArrowRight size={18} className={arrowNudge} />
                  </>
                )}
              </button>
            )}
            <Link href="/" className={`${btnSecondary} w-full`}>
              Not now
            </Link>
          </div>
        }
      >
        <OfferSummary offer={offer} />
      </DealSlip>

      <div className="mt-4 flex gap-2.5 text-caption text-ink-2">
        <IconLock size={16} className="mt-0.5 shrink-0" />
        <p>
          Approving tells AgentDeal you want this offer from <span className="font-medium text-ink">{brand}</span>. <strong className="font-medium text-ink">No money moves yet.</strong> Next you sign in to PayPal
          Sandbox and authorize the payment yourself.
        </p>
      </div>
    </section>
  );
}
