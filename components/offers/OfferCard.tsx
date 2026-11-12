"use client";

import { motion } from "motion/react";
import { bestFacets, deliveryLabel, diffPhrases, diffVs, ineligibleLabel, offerImage, offerName, warrantyLabel } from "@/lib/offer-view";
import { spring } from "@/lib/motion";
import { formatEur } from "@/shared/format";
import { SELLER_BRANDS } from "@/shared/sellers";
import type { Offer } from "@/shared/contracts/types";
import { IconCheck, IconPackage, IconReturn, IconShield, IconTruck } from "@/components/icons";
import { ProductImage } from "@/components/ProductImage";
import { SellerMark } from "@/components/SellerMark";
import { Badge } from "@/components/ui";

type Facets = ReturnType<typeof bestFacets>;

function Fact({ icon, label, value, best }: { icon: React.ReactNode; label: string; value: string; best?: string }) {
  return (
    <div className="flex items-center gap-2.5 py-2 text-small">
      <span className="text-ink-2">{icon}</span>
      <dt className="sr-only">{label}</dt>
      <dd className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span>{value}</span>
        {best && <span className="shrink-0 text-caption font-medium text-primary">{best}</span>}
      </dd>
    </div>
  );
}

/** Compact offer for the comparison grid. Same rows in the same order on every card, so the eye can scan across. */
export function OfferCard({
  offer,
  score,
  recommended,
  recommendedOffer,
  facets,
}: {
  offer: Offer;
  score: number | undefined;
  recommended: boolean;
  recommendedOffer: Offer;
  facets: Facets;
}) {
  const brand = SELLER_BRANDS[offer.sellerId];
  const diff = !recommended && offer.eligible ? diffPhrases(diffVs(offer, recommendedOffer), formatEur) : [];
  const shipping = offer.catalog ? (offer.catalog.shippingCents === 0 ? "Free shipping" : `${formatEur(offer.catalog.shippingCents)} shipping`) : offer.freeShipping ? "Free shipping" : "Paid shipping";

  return (
    <motion.li
      layout="position"
      transition={spring.snappy}
      className={`flex flex-col rounded-lg border bg-surface p-4 ${recommended ? "border-primary ring-1 ring-primary" : "border-line"} ${offer.eligible ? "" : "opacity-70"}`}
    >
      <div className="flex items-start gap-3">
        <ProductImage src={offerImage(offer)} alt="" className="size-14" sizes="56px" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-small font-medium">
            <SellerMark id={offer.sellerId} size={20} muted={!offer.eligible} />
            <span className="truncate">{brand.brand}</span>
          </p>
          <p className="mt-0.5 line-clamp-2 text-caption text-ink-2">{offerName(offer)}</p>
        </div>
      </div>

      <div className="mt-3 flex min-h-[1.625rem] flex-wrap items-center gap-1.5">
        {recommended && (
          <Badge tone="primary" icon={<IconCheck size={12} />}>
            Recommended
          </Badge>
        )}
        {!offer.eligible && <Badge tone="warning">{ineligibleLabel(offer.ineligibilityReasons)}</Badge>}
        {facets.price.has(offer.offerId) && <Badge tone="muted">Lowest price</Badge>}
      </div>

      <p className="tabular mt-3 text-h2 font-semibold">{formatEur(offer.finalPriceCents)}</p>
      <p className="tabular text-caption text-ink-2">
        {offer.catalog ? `${formatEur(offer.catalog.itemPriceCents)} item + ${offer.catalog.shippingCents === 0 ? "free shipping" : formatEur(offer.catalog.shippingCents)}` : "Total, shipping per store terms"}
      </p>

      <dl className="mt-3 divide-y divide-line border-y border-line">
        <Fact icon={<IconTruck size={16} />} label="Delivery" value={`${deliveryLabel(offer.deliveryDays)} delivery`} best={facets.delivery.has(offer.offerId) ? "Fastest" : undefined} />
        <Fact icon={<IconShield size={16} />} label="Warranty" value={`${warrantyLabel(offer.warrantyMonths)} warranty`} best={facets.warranty.has(offer.offerId) ? "Longest" : undefined} />
        <Fact icon={<IconPackage size={16} />} label="Shipping" value={shipping} />
        <Fact
          icon={<IconReturn size={16} />}
          label="Returns"
          value={offer.catalog ? `${offer.catalog.returnDays}-day returns` : "Returns per store terms"}
        />
      </dl>

      <div className="mt-3 min-h-[2.5rem] text-caption text-ink-2">
        {recommended ? (
          <p>Best fit for your priorities{score !== undefined ? ` · match score ${score}/100` : ""}.</p>
        ) : offer.eligible ? (
          <>
            {score !== undefined && <p>Match score {score}/100.</p>}
            {diff.length > 0 && (
              <p className="mt-0.5">
                <span className="text-ink">vs recommended:</span> {diff.join(" · ")}
              </p>
            )}
          </>
        ) : (
          <p>Not considered for the recommendation.</p>
        )}
      </div>
    </motion.li>
  );
}
