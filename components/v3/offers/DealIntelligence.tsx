import { formatEur } from "@/shared/format";
import type { DealIntel } from "@/lib/v3/deal-intel";
import { valueLines } from "@/lib/v3/deal-intel";
import { IconCheck, IconTag } from "@/components/v3/icons";

/** What the negotiation achieved, from the server's own numbers. No market comparisons, no estimates. */
export function DealIntelligence({ intel, tradeoffs, live }: { intel: DealIntel; tradeoffs: string[]; live: boolean }) {
  const lines = valueLines(intel);
  const pct = intel.savedPctTenths !== null ? `${Math.floor(intel.savedPctTenths / 10)}.${intel.savedPctTenths % 10}%` : null;
  return (
    <section aria-labelledby="intel-title" className="mt-8 rounded-v3-lg border border-v3-success-line bg-v3-success-soft/60 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="intel-title" className="flex items-center gap-2 font-v3-head text-lg font-extrabold">
          <span aria-hidden className="grid size-8 place-items-center rounded-[10px] bg-v3-success text-white">
            <IconTag size={16} />
          </span>
          What Agent D achieved
        </h3>
        <span className="v3-chip">{live ? "From recorded agent events and server-checked prices" : "From recorded events and server-checked prices"}</span>
      </div>

      <div className="mt-4 grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="rounded-v3-md bg-v3-surface px-5 py-4 text-center shadow-v3-card">
          <p className="text-xs font-extrabold uppercase tracking-wider text-v3-ink2">{intel.savedCents > 0 ? "Lower than the opening price" : "Price after negotiating"}</p>
          <p className="v3-num mt-1 font-v3-head text-[2.4rem] font-extrabold leading-none text-v3-success">{intel.savedCents > 0 ? formatEur(intel.savedCents) : formatEur(intel.finalCents)}</p>
          {pct && <p className="v3-num mt-1 text-sm font-bold text-v3-ink2">−{pct}</p>}
        </div>
        <ul className="space-y-2">
          {lines.map((l) => (
            <li key={l} className="flex gap-2.5 text-[0.95rem] leading-snug">
              <span className="mt-0.5 shrink-0 text-v3-success">
                <IconCheck size={17} />
              </span>
              <span className="text-pretty">{l}</span>
            </li>
          ))}
        </ul>
      </div>

      {tradeoffs.length > 0 && (
        <div className="mt-5 border-t border-v3-success-line pt-4">
          <p className="text-sm font-extrabold">How it compares with the next-best offer</p>
          <ul className="mt-2 space-y-1.5 text-[0.95rem] text-v3-ink2">
            {tradeoffs.map((t) => (
              <li key={t} className="text-pretty">
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
