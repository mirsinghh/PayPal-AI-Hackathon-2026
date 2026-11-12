"use client";

import { rejectionLabel, STATUS_LABEL, type SellerState } from "@/lib/negotiation-view";
import { deliveryLabel, offerImage, offerName, warrantyLabel } from "@/lib/offer-view";
import { formatEur } from "@/shared/format";
import { SELLER_BRANDS } from "@/shared/sellers";
import { AnimatedMoney } from "@/components/AnimatedMoney";
import { IconArrowLeft, IconPackage, IconReturn, IconShield, IconTruck } from "@/components/icons";
import { ProductImage } from "@/components/ProductImage";
import { SellerMark } from "@/components/SellerMark";
import { Badge, btnGhost } from "@/components/ui";
import { directionOf, formatClock } from "@/components/negotiation/Timeline";

/** One merchant's offer, terms and message history, built only from what the backend has recorded for it so far. */
export function SellerDetail({ s, live, onBack }: { s: SellerState; live: boolean; onBack: () => void }) {
  const offer = s.offer;
  const profile = SELLER_BRANDS[s.id];
  const shipping = offer?.catalog ? (offer.catalog.shippingCents === 0 ? "Free shipping" : `${formatEur(offer.catalog.shippingCents)} shipping`) : offer ? (offer.freeShipping ? "Free shipping" : "Paid shipping") : null;

  return (
    <div>
      <button onClick={onBack} className={`${btnGhost} -ml-3 min-h-10 px-3`}>
        <IconArrowLeft size={16} /> All activity
      </button>

      <div className="mt-2 flex items-start gap-3">
        <SellerMark id={s.id} size={40} />
        <div className="min-w-0">
          <h2 className="text-h3 font-semibold">{s.brand}</h2>
          <p className="text-small text-ink-2">{profile.pitch}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge tone={s.winner ? "success" : s.status === "set_aside" ? "warning" : "muted"}>
          {s.status === "set_aside" ? rejectionLabel(s.rejectedReason) : STATUS_LABEL[s.status]}
        </Badge>
        {s.score !== null && <Badge tone="muted">Score {s.score}/100</Badge>}
      </div>

      <section aria-label="Current offer" className="mt-5 border-t border-line pt-5">
        {offer && s.priceCents !== null ? (
          <div className="flex gap-3">
            <ProductImage src={offerImage(offer)} alt={offerName(offer)} className="size-20" sizes="80px" />
            <div className="min-w-0">
              <p className="text-small text-ink-2">{offerName(offer)}</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <AnimatedMoney cents={s.priceCents} className="text-h2 font-semibold" />
                {s.previousCents !== null && <span className="tabular text-small text-ink-2 line-through">{formatEur(s.previousCents)}</span>}
              </div>
              {s.openingCents !== null && s.previousCents === null && s.priceCents === s.openingCents && (
                <p className="text-caption text-ink-2">Opening offer</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-small text-ink-2">
            {s.status === "set_aside" ? "This store made no eligible offer." : "No offer yet. It will appear here as soon as this store replies."}
          </p>
        )}

        {offer && s.priceCents !== null && (
          <ul className="mt-4 grid grid-cols-1 gap-2 text-small sm:grid-cols-2">
            <li className="flex items-center gap-2 text-ink-2">
              <IconTruck size={16} /> <span className="text-ink">{deliveryLabel(offer.deliveryDays)}</span>
            </li>
            <li className="flex items-center gap-2 text-ink-2">
              <IconShield size={16} /> <span className="text-ink">{warrantyLabel(offer.warrantyMonths)} warranty</span>
            </li>
            <li className="flex items-center gap-2 text-ink-2">
              <IconPackage size={16} /> <span className="text-ink">{shipping}</span>
            </li>
            {offer.catalog && (
              <li className="flex items-center gap-2 text-ink-2">
                <IconReturn size={16} /> <span className="text-ink">{offer.catalog.returnDays}-day returns</span>
              </li>
            )}
          </ul>
        )}
        {offer && <p className="mt-3 text-caption text-ink-2">Terms are demo data and aren&apos;t a real merchant commitment.</p>}

        {s.message && (
          <figure className="mt-4 rounded-md bg-subtle p-3">
            <blockquote className="text-small text-ink">“{s.message}”</blockquote>
            <figcaption className="mt-1 text-caption text-ink-2">
              {s.source === "rules_fallback" ? "Rules fallback (the AI reply was unavailable)" : "AI seller agent"}
            </figcaption>
          </figure>
        )}
      </section>

      <section aria-label={`${s.brand} history`} className="mt-5 border-t border-line pt-5">
        <h3 className="text-small font-medium">History</h3>
        {s.history.length === 0 ? (
          <p className="mt-2 text-small text-ink-2">Nothing recorded yet.</p>
        ) : (
          <ol className="mt-2 space-y-3">
            {s.history.map((e) => (
              <li key={e.eventId} className="border-l-2 border-line pl-3">
                <p className="text-small">{e.feedText}</p>
                <p className="mt-0.5 text-caption text-ink-2">
                  <span className="tabular">{formatClock(e.atMs, live)}</span>
                  {directionOf(e) ? ` · ${directionOf(e)}` : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
