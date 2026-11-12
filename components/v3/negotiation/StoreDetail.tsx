"use client";

import { deliveryLabel, warrantyLabel } from "@/lib/offer-view";
import type { SellerState } from "@/lib/negotiation-view";
import { formatEur } from "@/shared/format";
import { SELLER_BRANDS } from "@/shared/sellers";
import { stallPresentation } from "@/lib/v3/stage";
import { sourceLabel } from "@/lib/v3/activity";
import { Chip, StoreMark } from "@/components/v3/ui";

const clock = (atMs: number, live: boolean): string => {
  const s = atMs / 1000;
  return live ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

/** One store's recorded story: terms, price movement and its own events. Opens from a stall; nothing here is new data. */
export function StoreDetail({ s, live, onClose }: { s: SellerState; live: boolean; onClose: () => void }) {
  const p = stallPresentation(s);
  const brand = SELLER_BRANDS[s.id];
  const o = s.offer;
  const terms: [string, string][] = o
    ? [
        ["Delivery", deliveryLabel(o.deliveryDays)],
        ["Warranty", warrantyLabel(o.warrantyMonths)],
        ["Shipping", o.catalog ? (o.catalog.shippingCents === 0 ? "Free" : formatEur(o.catalog.shippingCents)) : o.freeShipping ? "Free" : "Paid"],
        ["Returns", o.catalog ? `${o.catalog.returnDays} days` : `${brand.returnDays} days`],
      ]
    : [];
  return (
    <section aria-labelledby="store-title" className="v3-card v3-pop p-5">
      <div className="flex items-start gap-3">
        <StoreMark id={s.id} size={44} />
        <div className="min-w-0 flex-1">
          <h2 id="store-title" className="font-v3-head text-xl font-extrabold leading-tight">
            {s.brand}
          </h2>
          <p className="text-sm text-v3-ink2">{brand.pitch}</p>
        </div>
        <button type="button" onClick={onClose} className="v3-btn v3-btn--ghost v3-btn--sm !px-3">
          Close
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Chip tone={p.tone}>{p.label}</Chip>
        {s.rejectedReason && <Chip tone="warn">{s.rejectedReason === "over_budget" ? "Over your budget" : s.rejectedReason === "out_of_stock" ? "Out of stock" : "Failed policy check"}</Chip>}
        {s.score !== null && <Chip tone="success">Scored {s.score}/100</Chip>}
        {live && (s.source === "gemini" || s.source === "groq") && <Chip tone="primary">AI reply</Chip>}
        {live && s.source === "rules_fallback" && <Chip tone="warn">Rules fallback</Chip>}
      </div>

      {s.priceCents !== null && (
        <dl className="v3-num mt-4 grid grid-cols-2 gap-3 rounded-v3-md bg-v3-soft2 p-4 text-sm">
          <div>
            <dt className="text-v3-ink2">Opening price</dt>
            <dd className="font-v3-head text-lg font-extrabold">{formatEur(s.openingCents ?? s.priceCents)}</dd>
          </div>
          <div>
            <dt className="text-v3-ink2">Current price</dt>
            <dd className="font-v3-head text-lg font-extrabold">{formatEur(s.priceCents)}</dd>
          </div>
          {s.openingCents !== null && s.openingCents !== s.priceCents && (
            <div className="col-span-2 font-semibold text-v3-success">{formatEur(s.openingCents - s.priceCents)} lower than its opening price</div>
          )}
        </dl>
      )}

      {terms.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {terms.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 border-b border-v3-line py-1.5">
              <dt className="text-v3-ink2">{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {s.message && (
        <blockquote className="mt-4 rounded-v3-md border-l-4 border-v3-accent bg-v3-accent-soft px-3 py-2 text-sm">
          <p className="text-pretty">“{s.message}”</p>
          <footer className="mt-1 text-xs font-semibold text-v3-ink2">Latest message from {s.brand}</footer>
        </blockquote>
      )}

      <h3 className="mt-5 text-sm font-extrabold">History with {s.brand}</h3>
      {s.history.length === 0 ? (
        <p className="mt-1 text-sm text-v3-ink2">Nothing recorded for this store yet.</p>
      ) : (
        <ol className="mt-2 space-y-2">
          {s.history.map((e) => {
            const src = sourceLabel(e);
            return (
              <li key={e.eventId} className="text-sm leading-snug">
                <p className="text-pretty">{e.feedText}</p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-v3-ink2">
                  <span className="v3-num font-semibold">{clock(e.atMs, live)}</span>
                  {src && <span>{src}</span>}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
