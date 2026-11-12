import { deliveryLabel, offerImage, offerName, warrantyLabel } from "@/lib/offer-view";
import { formatEur } from "@/shared/format";
import { SELLER_BRANDS } from "@/shared/sellers";
import type { Offer } from "@/shared/contracts/types";
import { ProductImage, StoreMark } from "@/components/v3/ui";
import { IconPackage, IconReturn, IconShield, IconTruck } from "@/components/v3/icons";

/** The approved offer, as stated by the server. Read-only: the amount can't be changed from here. */
export function OrderSummary({ offer }: { offer: Offer }) {
  const cat = offer.catalog;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <ProductImage src={offerImage(offer)} alt={offerName(offer)} className="size-20" sizes="80px" />
        <div className="min-w-0">
          <p className="font-extrabold leading-snug text-pretty">{offerName(offer)}</p>
          <p className="mt-1 flex items-center gap-2 text-sm text-v3-ink2">
            <StoreMark id={offer.sellerId} size={20} /> {SELLER_BRANDS[offer.sellerId].brand}
          </p>
        </div>
      </div>
      <dl className="space-y-2 text-[0.95rem]">
        {cat && (
          <>
            <div className="flex justify-between gap-4">
              <dt className="text-v3-ink2">Item</dt>
              <dd className="v3-num font-semibold">{formatEur(cat.itemPriceCents)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-v3-ink2">Shipping</dt>
              <dd className="v3-num font-semibold">{cat.shippingCents === 0 ? "Free" : formatEur(cat.shippingCents)}</dd>
            </div>
          </>
        )}
        <div className="flex items-baseline justify-between gap-4 border-t border-dashed border-v3-line-strong pt-3">
          <dt className="font-extrabold">Total to pay</dt>
          <dd className="v3-num font-v3-head text-3xl font-extrabold leading-none">{formatEur(offer.finalPriceCents)}</dd>
        </div>
      </dl>
      <ul className="grid gap-x-4 gap-y-2 text-sm font-semibold text-v3-ink2 sm:grid-cols-2">
        <li className="flex items-center gap-2"><IconTruck size={15} /> {deliveryLabel(offer.deliveryDays)} delivery</li>
        <li className="flex items-center gap-2"><IconShield size={15} /> {warrantyLabel(offer.warrantyMonths)} warranty</li>
        <li className="flex items-center gap-2"><IconPackage size={15} /> {cat ? (cat.shippingCents === 0 ? "Free shipping" : `${formatEur(cat.shippingCents)} shipping`) : offer.freeShipping ? "Free shipping" : "Paid shipping"}</li>
        <li className="flex items-center gap-2"><IconReturn size={15} /> {cat ? `${cat.returnDays}-day returns` : "Returns per store terms"}</li>
      </ul>
    </div>
  );
}
