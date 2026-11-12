"use client";

import { motion } from "motion/react";
import { bestFacets, deliveryLabel, diffPhrases, diffVs, ineligibleLabel, offerImage, offerName, warrantyLabel } from "@/lib/offer-view";
import { duration, ease, spring } from "@/lib/motion";
import { formatEur } from "@/shared/format";
import { SELLER_BRANDS } from "@/shared/sellers";
import type { Offer } from "@/shared/contracts/types";
import { IconCheck } from "@/components/icons";
import { ProductImage } from "@/components/ProductImage";
import { SellerMark } from "@/components/SellerMark";
import { Badge } from "@/components/ui";

type Facets = ReturnType<typeof bestFacets>;

/** Fixed row heights keep every column aligned without a table, so whole columns can slide when the sort changes. */
const ROWS = [
  { id: "price", label: "Total", h: 84 },
  { id: "breakdown", label: "Item + shipping", h: 40 },
  { id: "delivery", label: "Delivery", h: 48 },
  { id: "warranty", label: "Warranty", h: 48 },
  { id: "shipping", label: "Shipping", h: 48 },
  { id: "returns", label: "Returns", h: 48 },
  { id: "match", label: "Match score", h: 56 },
  { id: "diff", label: "vs recommended", h: 72 },
] as const;
const HEAD_H = 140;

function Best({ children }: { children: string }) {
  return <span className="eyebrow text-primary">{children}</span>;
}

/**
 * Side-by-side comparison for wide screens: one column per store, the same rows everywhere, the best value of each
 * row marked in words. The recommended column is outlined (not filled) and the rest are never recoloured.
 */
export function CompareMatrix({
  offers,
  scores,
  recommended,
  facets,
}: {
  offers: Offer[];
  scores: Record<string, number>;
  recommended: Offer;
  facets: Facets;
}) {
  return (
    <div className="hidden gap-3 lg:grid" style={{ gridTemplateColumns: `6.5rem repeat(${offers.length}, minmax(0, 1fr))` }}>
      {/* Row labels (decorative duplicate: every column carries its own accessible labels). */}
      <div aria-hidden className="pt-[calc(var(--head)+1px)]" style={{ ["--head" as string]: `${HEAD_H}px` }}>
        {ROWS.map((r) => (
          <p key={r.id} className="eyebrow flex items-center" style={{ height: r.h }}>
            {r.label}
          </p>
        ))}
      </div>

      {offers.map((o) => {
        const isRec = o.offerId === recommended.offerId;
        const brand = SELLER_BRANDS[o.sellerId];
        const c = o.catalog;
        const score = scores[o.offerId];
        const diff = !isRec && o.eligible ? diffPhrases(diffVs(o, recommended), formatEur) : [];
        return (
          <motion.ul
            key={o.offerId}
            layout="position"
            transition={spring.snappy}
            className={`list-none overflow-hidden rounded-lg border bg-surface ${isRec ? "border-primary ring-1 ring-primary" : "border-line"} ${o.eligible ? "" : "opacity-70"}`}
          >
            <li className="flex flex-col gap-2.5 border-b border-line p-3.5" style={{ height: HEAD_H }}>
              <div className="flex items-center justify-between gap-2">
                <p className="flex min-w-0 items-start gap-2 text-small font-medium leading-tight">
                  <SellerMark id={o.sellerId} size={20} muted={!o.eligible} />
                  <span className="min-w-0 flex-1">{brand.brand}</span>
                </p>
              </div>
              <div className="flex min-h-0 flex-1 items-center gap-2.5">
                <ProductImage src={offerImage(o)} alt="" className="size-14" sizes="56px" />
                <p className="line-clamp-3 text-caption text-ink-2">{offerName(o)}</p>
              </div>
            </li>

            <li className="flex flex-col justify-center border-b border-line px-3.5" style={{ height: ROWS[0].h }}>
              <span className="sr-only">Total</span>
              <span className="tabular font-display text-[2rem] leading-none">{formatEur(o.finalPriceCents)}</span>
              <span className="mt-1.5 flex min-h-4 items-center gap-1.5">
                {isRec && (
                  <Badge tone="primary" icon={<IconCheck size={12} />}>
                    Recommended
                  </Badge>
                )}
                {!o.eligible && <Badge tone="warning">{ineligibleLabel(o.ineligibilityReasons)}</Badge>}
                {facets.price.has(o.offerId) && <Best>Lowest price</Best>}
              </span>
            </li>

            <li className="tabular flex items-center border-b border-line px-3.5 text-caption text-ink-2" style={{ height: ROWS[1].h }}>
              <span className="sr-only">Item plus shipping: </span>
              {c ? `${formatEur(c.itemPriceCents)} + ${c.shippingCents === 0 ? "free" : formatEur(c.shippingCents)}` : "Per store terms"}
            </li>

            <li className="flex flex-col justify-center gap-0.5 border-b border-line px-3.5 text-small" style={{ height: ROWS[2].h }}>
              <span>
                <span className="sr-only">Delivery: </span>
                {deliveryLabel(o.deliveryDays)}
              </span>
              {facets.delivery.has(o.offerId) && <Best>Fastest</Best>}
            </li>

            <li className="flex flex-col justify-center gap-0.5 border-b border-line px-3.5 text-small" style={{ height: ROWS[3].h }}>
              <span>
                <span className="sr-only">Warranty: </span>
                {warrantyLabel(o.warrantyMonths)}
              </span>
              {facets.warranty.has(o.offerId) && <Best>Longest</Best>}
            </li>

            <li className="flex items-center border-b border-line px-3.5 text-small" style={{ height: ROWS[4].h }}>
              <span className="sr-only">Shipping: </span>
              {c ? (c.shippingCents === 0 ? "Free" : formatEur(c.shippingCents)) : o.freeShipping ? "Free" : "Paid"}
            </li>

            <li className="flex items-center border-b border-line px-3.5 text-small" style={{ height: ROWS[5].h }}>
              <span className="sr-only">Returns: </span>
              {c ? `${c.returnDays} days` : "Per store terms"}
            </li>

            <li className="flex flex-col justify-center gap-2 border-b border-line px-3.5" style={{ height: ROWS[6].h }}>
              <span className="tabular text-small">
                <span className="sr-only">Match score: </span>
                {score !== undefined && o.eligible ? `${score}/100` : "Not scored"}
              </span>
              <span aria-hidden className="block h-1 overflow-hidden rounded-full bg-line">
                <motion.span
                  className="block h-full origin-left rounded-full bg-primary"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: o.eligible && score !== undefined ? score / 100 : 0 }}
                  transition={ease(duration.enter)}
                />
              </span>
            </li>

            <li className="px-3.5 py-3 text-caption text-ink-2" style={{ minHeight: ROWS[7].h, height: ROWS[7].h }}>
              <span className="sr-only">Difference from the recommended offer: </span>
              {isRec ? "Best fit for your priorities." : diff.length > 0 ? diff.join(" · ") : o.eligible ? "Same as recommended." : "Not considered."}
            </li>
          </motion.ul>
        );
      })}
    </div>
  );
}
