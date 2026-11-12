import type { SellerState } from "@/lib/negotiation-view";
import { formatEur } from "@/shared/format";
import { StoreMark } from "@/components/v3/ui";

/**
 * Price movement per store against your budget. The numbers are always printed; the track is a visual aid only.
 * Positions come from recorded prices (opening and current) and the budget you set. Nothing is projected.
 */
export function PriceTracks({ sellers, budgetCents }: { sellers: SellerState[]; budgetCents: number }) {
  const priced = sellers.filter((s) => s.priceCents !== null);
  const values = [budgetCents, ...priced.flatMap((s) => [s.priceCents as number, s.openingCents ?? s.priceCents ?? budgetCents])];
  const lo = Math.min(...values) * 0.92;
  const hi = Math.max(...values) * 1.04;
  const pct = (c: number) => Math.max(0, Math.min(100, ((c - lo) / (hi - lo)) * 100));

  return (
    <section aria-labelledby="tracks-title" className="v3-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="tracks-title" className="font-v3-head text-lg font-extrabold">
          Price movement
        </h2>
        <p className="v3-num text-sm font-semibold text-v3-ink2">Your budget: {formatEur(budgetCents)}</p>
      </div>
      <ul className="mt-4 space-y-4">
        {sellers.map((s) => {
          const has = s.priceCents !== null;
          const cur = s.priceCents ?? 0;
          const open = s.openingCents ?? cur;
          return (
            <li key={s.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[11rem_minmax(0,1fr)_9rem]">
              <span className="flex items-center gap-2 sm:col-start-1">
                <StoreMark id={s.id} size={24} muted={!has} />
                <span className="truncate text-sm font-bold">{s.brand}</span>
              </span>
              <span className="v3-num col-start-2 row-start-1 justify-self-end text-sm font-extrabold sm:col-start-3 sm:row-start-1">
                {has ? formatEur(cur) : <span className="font-semibold text-v3-ink2">no offer yet</span>}
              </span>
              <span aria-hidden className="relative col-span-2 h-6 sm:col-span-1 sm:col-start-2 sm:row-start-1" style={{ containerType: "inline-size" }}>
                <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-v3-line" />
                {/* budget line */}
                <span className="v3-slide absolute left-0 top-0 h-6 w-0 border-l-2 border-dashed border-v3-ink/50" style={{ translate: `${pct(budgetCents)}cqw 0` }} />
                {has && (
                  <>
                    <span
                      className="v3-slide absolute left-0 top-1/2 h-1.5 w-[100cqw] origin-left rounded-full bg-v3-accent"
                      style={{ translate: `${pct(cur)}cqw -50%`, scale: `${Math.max(0, pct(open) - pct(cur)) / 100} 1` }}
                    />
                    {open !== cur && <span className="v3-slide absolute left-0 top-1/2 size-3 rounded-full border-2 border-v3-ink2 bg-v3-surface" style={{ translate: `calc(${pct(open)}cqw - 50%) -50%` }} />}
                    <span className="v3-slide absolute left-0 top-1/2 size-4 rounded-full border-2 border-v3-surface bg-v3-primary shadow" style={{ translate: `calc(${pct(cur)}cqw - 50%) -50%` }} />
                  </>
                )}
              </span>
              <span className="col-span-2 text-xs text-v3-ink2 sm:col-span-1 sm:col-start-2">
                {has ? (open !== cur ? <>Opened at {formatEur(open)} · now {formatEur(cur)}</> : <>Opening offer, no change yet</>) : "Waiting for this store’s opening offer"}
                {s.status === "set_aside" && " · set aside"}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-v3-ink2">Dashed line: your budget. Hollow dot: opening price. Filled dot: current price.</p>
    </section>
  );
}
