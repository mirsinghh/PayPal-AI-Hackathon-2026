"use client";

import { bestFacets, deliveryLabel, diffPhrases, diffVs, ineligibleLabel, warrantyLabel, type OfferFacet } from "@/lib/offer-view";
import { formatEur } from "@/shared/format";
import { SELLER_BRANDS } from "@/shared/sellers";
import type { Offer } from "@/shared/contracts/types";
import { Chip, StoreMark } from "@/components/v3/ui";
import { IconCheck, IconPackage, IconReturn, IconShield, IconTruck } from "@/components/v3/icons";

type Facets = ReturnType<typeof bestFacets>;

const shippingText = (o: Offer): string => (o.catalog ? (o.catalog.shippingCents === 0 ? "Free shipping" : `${formatEur(o.catalog.shippingCents)} shipping`) : o.freeShipping ? "Free shipping" : "Paid shipping");
const returnsText = (o: Offer): string => (o.catalog ? `${o.catalog.returnDays}-day returns` : `${SELLER_BRANDS[o.sellerId].returnDays}-day returns`);

const FACET_LABEL: Record<OfferFacet, string> = { price: "Lowest price", delivery: "Fastest", warranty: "Longest warranty" };

/** A thin proportional bar. Decorative: the value is always printed next to it. */
function Bar({ value, max, tone = "primary" }: { value: number; max: number; tone?: "primary" | "muted" }) {
  const pct = max > 0 ? Math.max(4, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span aria-hidden className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-v3-line">
      <span className={`v3-bar block h-full w-full rounded-full ${tone === "primary" ? "bg-v3-primary" : "bg-v3-control"}`} style={{ transform: `scaleX(${pct / 100})` }} />
    </span>
  );
}

function FacetChips({ offer, facets }: { offer: Offer; facets: Facets }) {
  const on = (Object.keys(FACET_LABEL) as OfferFacet[]).filter((f) => facets[f].has(offer.offerId));
  if (!on.length) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {on.map((f) => (
        <Chip key={f} tone="accent" className="!text-[0.7rem] !py-0.5">
          {FACET_LABEL[f]}
        </Chip>
      ))}
    </span>
  );
}

/**
 * All four offers side by side. Wide screens get a table (best for comparing and for screen readers), phones get one
 * card per store. Both render the same facts; "Lowest price / Fastest / Longest warranty" only mark the best value in
 * each row. The recommendation itself comes from the server's match score and is never recoloured.
 */
export function CompareBoard({ offers, scores, recommended, facets, budgetCents }: { offers: Offer[]; scores: Record<string, number>; recommended: Offer; facets: Facets; budgetCents: number }) {
  const maxDays = Math.max(...offers.map((o) => o.deliveryDays), 1);
  const maxWarranty = Math.max(...offers.map((o) => o.warrantyMonths), 1);
  const maxPrice = Math.max(budgetCents, ...offers.map((o) => o.finalPriceCents));

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[40rem] border-separate border-spacing-x-3 border-spacing-y-0 text-left">
          <caption className="sr-only">Comparison of the four offers: price, difference from the recommended offer, delivery, warranty, shipping, returns and eligibility.</caption>
          <thead>
            <tr>
              <td />
              {offers.map((o) => {
                const rec = o.offerId === recommended.offerId;
                return (
                  <th key={o.offerId} scope="col" className={`rounded-t-v3-lg border border-b-0 px-4 pb-3 pt-4 align-top ${rec ? "border-v3-ink bg-v3-surface" : "border-v3-line bg-v3-surface/70"}`}>
                    <span className="flex items-center gap-2.5">
                      <StoreMark id={o.sellerId} size={30} muted={!o.eligible} />
                      <span className="font-v3-head text-[1.02rem] font-extrabold leading-tight">{SELLER_BRANDS[o.sellerId].brand}</span>
                    </span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {rec && (
                        <Chip tone="success" icon={<IconCheck size={12} />} className="!text-[0.7rem] !py-0.5">
                          Recommended
                        </Chip>
                      )}
                      {!o.eligible && (
                        <Chip tone="warn" className="!text-[0.7rem] !py-0.5">
                          {ineligibleLabel(o.ineligibilityReasons)}
                        </Chip>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="text-[0.95rem]">
            <Row label="Total price" offers={offers} recommended={recommended}>
              {(o) => (
                <>
                  <span className="v3-num font-v3-head text-xl font-extrabold">{formatEur(o.finalPriceCents)}</span>
                  <Bar value={o.finalPriceCents} max={maxPrice} tone={o.eligible ? "primary" : "muted"} />
                  <span className="mt-1.5 block"><FacetChips offer={o} facets={facets} /></span>
                </>
              )}
            </Row>
            <Row label="Compared with the recommendation" offers={offers} recommended={recommended}>
              {(o) =>
                o.offerId === recommended.offerId ? (
                  <span className="text-v3-ink2">—</span>
                ) : (
                  <span className="text-[0.88rem] leading-snug text-v3-ink2">{diffPhrases(diffVs(o, recommended), formatEur).join(" · ") || "Same terms"}</span>
                )
              }
            </Row>
            <Row label="Delivery" offers={offers} recommended={recommended}>
              {(o) => (
                <>
                  <span className="flex items-center gap-1.5 font-bold"><IconTruck size={15} /> {deliveryLabel(o.deliveryDays)}</span>
                  <Bar value={o.deliveryDays} max={maxDays} tone="muted" />
                </>
              )}
            </Row>
            <Row label="Warranty" offers={offers} recommended={recommended}>
              {(o) => (
                <>
                  <span className="flex items-center gap-1.5 font-bold"><IconShield size={15} /> {warrantyLabel(o.warrantyMonths)}</span>
                  <Bar value={o.warrantyMonths} max={maxWarranty} />
                </>
              )}
            </Row>
            <Row label="Shipping" offers={offers} recommended={recommended}>
              {(o) => <span className="flex items-center gap-1.5 font-semibold"><IconPackage size={15} /> {shippingText(o)}</span>}
            </Row>
            <Row label="Returns" offers={offers} recommended={recommended}>
              {(o) => <span className="flex items-center gap-1.5 font-semibold"><IconReturn size={15} /> {returnsText(o)}</span>}
            </Row>
            <Row label="Match score" offers={offers} recommended={recommended} last>
              {(o) =>
                scores[o.offerId] !== undefined ? (
                  <span className="v3-num font-bold">{scores[o.offerId]}<span className="font-semibold text-v3-ink2">/100</span></span>
                ) : (
                  <span className="text-v3-ink2">Not scored</span>
                )
              }
            </Row>
          </tbody>
        </table>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 md:hidden">
        {offers.map((o) => {
          const rec = o.offerId === recommended.offerId;
          return (
            <li key={o.offerId} className={`v3-card p-4 ${rec ? "!border-v3-ink shadow-[4px_4px_0_var(--color-v3-ink)]" : ""} ${o.eligible ? "" : "opacity-80"}`}>
              <div className="flex items-center gap-2.5">
                <StoreMark id={o.sellerId} size={32} muted={!o.eligible} />
                <p className="font-v3-head text-lg font-extrabold leading-tight">{SELLER_BRANDS[o.sellerId].brand}</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {rec && <Chip tone="success" icon={<IconCheck size={12} />}>Recommended</Chip>}
                {!o.eligible && <Chip tone="warn">{ineligibleLabel(o.ineligibilityReasons)}</Chip>}
                <FacetChips offer={o} facets={facets} />
              </div>
              <p className="v3-num mt-3 font-v3-head text-3xl font-extrabold">{formatEur(o.finalPriceCents)}</p>
              {!rec && <p className="mt-1 text-sm text-v3-ink2">{diffPhrases(diffVs(o, recommended), formatEur).join(" · ") || "Same terms as the recommendation"}</p>}
              <ul className="mt-3 space-y-1.5 border-t border-v3-line pt-3 text-sm font-semibold">
                <li className="flex items-center gap-2"><IconTruck size={15} /> {deliveryLabel(o.deliveryDays)} delivery</li>
                <li className="flex items-center gap-2"><IconShield size={15} /> {warrantyLabel(o.warrantyMonths)} warranty</li>
                <li className="flex items-center gap-2"><IconPackage size={15} /> {shippingText(o)}</li>
                <li className="flex items-center gap-2"><IconReturn size={15} /> {returnsText(o)}</li>
              </ul>
              {scores[o.offerId] !== undefined && <p className="v3-num mt-3 text-sm text-v3-ink2">Match score <strong className="text-v3-ink">{scores[o.offerId]}/100</strong></p>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Row({ label, offers, recommended, children, last = false }: { label: string; offers: Offer[]; recommended: Offer; children: (o: Offer) => React.ReactNode; last?: boolean }) {
  return (
    <tr>
      <th scope="row" className="w-40 py-3 pr-2 align-top text-sm font-bold text-v3-ink2">
        {label}
      </th>
      {offers.map((o) => {
        const rec = o.offerId === recommended.offerId;
        return (
          <td key={o.offerId} className={`border-x px-4 py-3 align-top ${last ? "rounded-b-v3-lg border-b" : ""} ${rec ? "border-v3-ink bg-v3-surface" : "border-v3-line bg-v3-surface/70"} ${o.eligible ? "" : "text-v3-ink2"}`}>
            {children(o)}
          </td>
        );
      })}
    </tr>
  );
}
