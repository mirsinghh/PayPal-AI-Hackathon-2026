"use client";

import { useMemo, useState } from "react";
import { deliveryLabel, warrantyLabel } from "@/lib/offer-view";
import { formatEur } from "@/shared/format";
import { SELLER_BRANDS } from "@/shared/sellers";
import type { Offer, Priority, SellerId } from "@/shared/contracts/types";
import { PRIORITIES } from "@/shared/contracts/types";
import { COMPONENT_LABEL, EVIDENCE_LABEL, PRIORITY_NAME, compareTo, whatIf, type Component, type EventRef, type EvidenceOrigin, type LabData, type LabRow } from "@/lib/v4/lab";
import { SELLER_PERSONA } from "@/lib/v4/personas";
import { Chip, StoreMark, type ChipTone } from "@/components/v3/ui";
import { IconCheck, IconPackage, IconShield, IconTruck } from "@/components/v3/icons";

const COMP_CLASS: Record<Component, string> = { price: "bg-v3-primary", delivery: "bg-[#0E7490]", warranty: "bg-v3-accent" };
const COMP_PATTERN: Record<Component, string> = { price: "", delivery: "v4-stripes", warranty: "v4-dots" };
const ORIGIN_TONE: Record<EvidenceOrigin, ChipTone> = { ai: "primary", fallback: "warn", server: "neutral", computed: "accent" };

export interface LabProps {
  lab: LabData;
  budgetCents: number;
  /** Open an evidence event in the conversation (negotiation room). Omit to show the references as plain labels. */
  onShowEvent?: (ref: EventRef) => void;
  offers: readonly Offer[];
}

/**
 * Agent D's Decision Lab. Each block answers one question:
 *  A. What is recommended?  B. How do the offers score?  C. Where does each store win?  D. Why did it win?  E. Where does it come from?
 * Everything shown is data the backend already produced (stored scores, offers, persisted events). See lib/v4/lab.ts.
 */
export function DecisionLab({ lab, budgetCents, onShowEvent, offers }: LabProps) {
  const [selected, setSelected] = useState<SellerId | null>(null);
  const [facet, setFacet] = useState<string | null>(null);
  const focusIds = useMemo(() => new Set(lab.facets.find((f) => f.id === facet)?.sellerIds ?? []), [facet, lab.facets]);
  const sel = lab.rows.find((r) => r.sellerId === selected) ?? null;

  return (
    <section aria-labelledby="lab-title" className="space-y-6">
      <header>
        <p className="v3-eyebrow">Decision Lab</p>
        <h2 id="lab-title" className="v3-h2 mt-1 text-[clamp(1.6rem,1.2rem+1.6vw,2.3rem)]">
          Why Agent D recommends this offer
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-v3-ink2">Every number here comes from the server&apos;s own data: the stored scores, the validated offers and the persisted events. Nothing is estimated.</p>
      </header>

      <Hero lab={lab} budgetCents={budgetCents} />

      <Scores lab={lab} selected={selected} onSelect={setSelected} focusIds={focusIds} />

      <Tradeoffs lab={lab} facet={facet} onFacet={setFacet} sel={sel} onClear={() => setSelected(null)} />

      <Why lab={lab} offers={offers} />

      <Evidence lab={lab} onShowEvent={onShowEvent} />
    </section>
  );
}

/* ---------- A. Recommendation hero ---------- */

function Hero({ lab, budgetCents }: { lab: LabData; budgetCents: number }) {
  const w = lab.winner;
  const o = w.offer;
  const headroom = budgetCents - o.finalPriceCents;
  return (
    <div className="v3-card relative overflow-hidden border-v3-primary/30 p-5 sm:p-6">
      <div aria-hidden className="v3-dots pointer-events-none absolute inset-0 opacity-30" />
      <div className="relative grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div>
          <Chip tone="primary" icon={<IconCheck size={13} />}>
            Recommended by Agent D
          </Chip>
          <p className="mt-3 flex items-center gap-3">
            <StoreMark id={w.sellerId} size={46} />
            <span>
              <span className="block font-v3-head text-xl font-extrabold leading-tight">{w.brand}</span>
              <span className="block text-sm font-semibold text-v3-ink2">{SELLER_PERSONA[w.sellerId].title}</span>
            </span>
          </p>
          <p className="v3-num mt-4 font-v3-head text-[clamp(2.6rem,2rem+3vw,3.8rem)] font-extrabold leading-none tracking-tight">{formatEur(o.finalPriceCents)}</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            <li>
              <Chip tone="success">Eligible · {headroom === 0 ? "exactly on budget" : `${formatEur(headroom)} under budget`}</Chip>
            </li>
            {w.score !== null && (
              <li>
                <Chip tone="primary">
                  Match score {w.score}/100
                </Chip>
              </li>
            )}
            {w.rank !== null && (
              <li>
                <Chip>Rank {w.rank}</Chip>
              </li>
            )}
          </ul>
          <p className="mt-2 text-xs text-v3-ink2">The match score is the server&apos;s ranking score for your priority. It is not a probability or a promise.</p>
          <ul className="mt-4 grid gap-1.5 text-sm font-semibold sm:grid-cols-2">
            <li className="flex items-center gap-2"><IconTruck size={16} /> {deliveryLabel(o.deliveryDays)} delivery</li>
            <li className="flex items-center gap-2"><IconShield size={16} /> {warrantyLabel(o.warrantyMonths)} warranty</li>
            <li className="flex items-center gap-2"><IconPackage size={16} /> {o.catalog ? (o.catalog.shippingCents === 0 ? "Free shipping" : `${formatEur(o.catalog.shippingCents)} shipping`) : o.freeShipping ? "Free shipping" : "Paid shipping"}</li>
          </ul>
        </div>
        <div className="grid content-start gap-4 sm:grid-cols-2 md:grid-cols-1">
          <div>
            <p className="flex flex-wrap items-center gap-2 text-sm font-extrabold text-v3-success">
              Strengths <OriginChip origin={lab.explanation.origin} model={lab.explanation.model} />
            </p>
            {lab.advantages.length ? (
              <ul className="mt-1.5 space-y-1.5">
                {lab.advantages.map((r) => (
                  <li key={r} className="flex gap-2 text-sm text-pretty"><span className="mt-0.5 text-v3-success"><IconCheck size={15} /></span>{r}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-v3-ink2">No strengths were recorded.</p>
            )}
          </div>
          {lab.tradeoffs.length > 0 && (
            <div>
              <p className="text-sm font-extrabold text-v3-warn">Trade-offs</p>
              <ul className="mt-1.5 list-disc space-y-1.5 pl-5 text-sm text-v3-ink2 marker:text-v3-warn">
                {lab.tradeoffs.map((r) => (
                  <li key={r} className="text-pretty">{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OriginChip({ origin, model }: { origin: EvidenceOrigin; model?: string | null }) {
  return (
    <Chip tone={ORIGIN_TONE[origin]} className="!py-0.5 !text-[0.68rem]">
      {EVIDENCE_LABEL[origin]}
      {origin === "ai" && model ? ` · ${model}` : ""}
    </Chip>
  );
}

/* ---------- B. Visual comparison ---------- */

function Scores({ lab, selected, onSelect, focusIds }: { lab: LabData; selected: SellerId | null; onSelect: (id: SellerId | null) => void; focusIds: Set<SellerId> }) {
  const comps: Component[] = ["price", "delivery", "warranty"];
  return (
    <div className="v3-card p-5 sm:p-6">
      <h3 className="font-v3-head text-lg font-extrabold">How the four offers score</h3>
      <p className="mt-1 text-sm text-v3-ink2">
        Bars show the server&apos;s score out of 100 for “{PRIORITY_NAME[lab.priority]}”.{lab.breakdownReliable ? " Each bar is split into the real parts of that score." : ""} Offers that can&apos;t be bought are shown hatched and aren&apos;t ranked.
      </p>
      {lab.breakdownReliable && (
        <ul aria-label="Legend" className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-bold text-v3-ink2">
          {comps.map((c) => (
            <li key={c} className="flex items-center gap-1.5">
              <span aria-hidden className={`inline-block h-3 w-5 rounded-sm ${COMP_CLASS[c]} ${COMP_PATTERN[c]}`} />
              {COMPONENT_LABEL[c]} ({lab.weights[c]}% of the score)
            </li>
          ))}
        </ul>
      )}
      <ul className="mt-4 space-y-2.5">
        {lab.rows.map((r) => {
          const isSel = selected === r.sellerId;
          const dim = focusIds.size > 0 && !focusIds.has(r.sellerId);
          const winner = r.offer.offerId === lab.winner.offer.offerId;
          return (
            <li key={r.offer.offerId}>
              <button
                type="button"
                aria-pressed={isSel}
                onClick={() => onSelect(isSel ? null : r.sellerId)}
                className={`grid w-full grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-v3-md border px-2.5 py-2 text-left transition-[opacity,box-shadow] duration-(--v3-d1) sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_3.5rem] ${isSel ? "border-v3-ink shadow-v3-card" : "border-transparent hover:border-v3-line"} ${dim ? "opacity-45" : ""}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <StoreMark id={r.sellerId} size={28} muted={!r.eligible} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-extrabold">{r.brand}</span>
                    <span className="block text-[0.7rem] font-semibold text-v3-ink2">
                      {winner ? "Recommended" : r.eligible ? `Rank ${r.rank ?? "–"}` : r.whyNot}
                    </span>
                  </span>
                </span>
                <span className={`relative h-6 overflow-hidden rounded-full bg-v3-sunken ${r.eligible ? "" : "v4-hatch"}`}>
                  <span className="flex h-full" style={{ width: `${Math.max(2, r.score ?? 0)}%` }}>
                    {r.components && r.eligible ? (
                      comps.map((c) => <span key={c} className={`h-full ${COMP_CLASS[c]} ${COMP_PATTERN[c]}`} style={{ width: `${(r.components![c] / Math.max(r.score ?? 1, 1)) * 100}%` }} />)
                    ) : (
                      <span className={`h-full w-full ${r.eligible ? "bg-v3-primary" : "bg-v3-line-strong"}`} />
                    )}
                  </span>
                </span>
                <span className="v3-num col-span-2 text-right text-sm font-extrabold sm:col-span-1">{r.score ?? "—"}<span className="text-xs font-semibold text-v3-ink2">/100</span></span>
              </button>
            </li>
          );
        })}
      </ul>
      {lab.breakdownReliable && (
        <details className="mt-4 text-sm">
          <summary className="inline-flex min-h-9 cursor-pointer items-center rounded-md font-bold underline decoration-v3-line-strong underline-offset-2">Score table (accessible numbers)</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[26rem] text-left text-sm">
              <caption className="sr-only">Score points per store and per part of the score</caption>
              <thead className="text-xs text-v3-ink2">
                <tr>
                  <th scope="col" className="py-1 pr-3">Store</th>
                  {comps.map((c) => <th key={c} scope="col" className="py-1 pr-3">{COMPONENT_LABEL[c]}</th>)}
                  <th scope="col" className="py-1">Score</th>
                </tr>
              </thead>
              <tbody className="v3-num">
                {lab.rows.map((r) => (
                  <tr key={r.offer.offerId} className="border-t border-v3-line">
                    <th scope="row" className="py-1.5 pr-3 font-bold">{r.brand}{!r.eligible && <span className="font-normal text-v3-ink2"> (set aside)</span>}</th>
                    {comps.map((c) => <td key={c} className="py-1.5 pr-3">{(r.components as Record<Component, number>)[c].toFixed(1)}</td>)}
                    <td className="py-1.5 font-extrabold">{r.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-v3-ink2">Parts are shown to one decimal; the stored score is the rounded sum.</p>
          </div>
        </details>
      )}
    </div>
  );
}

/* ---------- C. Trade-off explorer ---------- */

function Tradeoffs({ lab, facet, onFacet, sel, onClear }: { lab: LabData; facet: string | null; onFacet: (id: string | null) => void; sel: LabRow | null; onClear: () => void }) {
  return (
    <div className="v3-card p-5 sm:p-6">
      <h3 className="font-v3-head text-lg font-extrabold">Where each store wins</h3>
      <p className="mt-1 text-sm text-v3-ink2">Pick a measure to highlight who leads it among the offers you could buy.</p>
      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {lab.facets.map((f) => {
          const on = facet === f.id;
          return (
            <li key={f.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onFacet(on ? null : f.id)}
                className={`h-full w-full rounded-v3-md border p-3 text-left transition-colors duration-(--v3-d1) ${on ? "border-v3-ink bg-v3-soft" : "border-v3-line bg-v3-surface hover:border-v3-line-strong"}`}
              >
                <span className="text-[0.7rem] font-extrabold uppercase tracking-wider text-v3-ink2">{f.label}</span>
                <span className="v3-num mt-1 block font-v3-head text-lg font-extrabold leading-tight">{f.value}</span>
                <span className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-bold">
                  {f.sellerIds.length ? (
                    f.sellerIds.map((id) => (
                      <span key={id} className="inline-flex items-center gap-1.5">
                        <StoreMark id={id} size={18} />
                        {SELLER_BRANDS[id].brand}
                      </span>
                    ))
                  ) : (
                    <span className="text-v3-ink2">No eligible offer</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div aria-live="polite" className="mt-4">
        {sel ? (
          <div className="rounded-v3-md border border-v3-line bg-v3-soft2 p-3.5 text-sm">
            <p className="flex flex-wrap items-center gap-2 font-extrabold">
              <StoreMark id={sel.sellerId} size={22} /> {sel.brand} compared with {lab.winner.brand}
              <button type="button" onClick={onClear} className="ml-auto min-h-9 rounded-md px-2 text-xs font-bold text-v3-ink2 underline underline-offset-2">Clear</button>
            </p>
            {sel.offer.offerId === lab.winner.offer.offerId ? (
              <p className="mt-1.5 text-v3-ink2">This is the recommended offer.</p>
            ) : (
              <p className="mt-1.5">
                {compareLine(sel, lab.winner)}
                {!sel.eligible && <span className="text-v3-ink2"> It was set aside by the server ({sel.whyNot?.toLowerCase()}).</span>}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-v3-ink2">Select a store in the chart above to see how it compares with the pick.</p>
        )}
      </div>
    </div>
  );
}

function compareLine(sel: LabRow, pick: LabRow): string {
  const parts = compareTo(sel.offer, pick.offer);
  return parts.length ? `${sel.brand} vs the pick: ${parts.join(", ")}.` : `${sel.brand} matches the pick on price, delivery, warranty and shipping.`;
}

/* ---------- D. Why this offer won (+ what-if) ---------- */

function Why({ lab, offers }: { lab: LabData; offers: readonly Offer[] }) {
  const [hypo, setHypo] = useState<Priority>(lab.priority);
  const alt = useMemo(() => (hypo === lab.priority ? null : whatIf(offers, hypo)), [hypo, lab.priority, offers]);
  const altWinner = alt ? offers.find((o) => o.offerId === alt.winnerOfferId) : null;
  return (
    <div className="v3-card p-5 sm:p-6">
      <h3 className="font-v3-head text-lg font-extrabold">Why this offer won</h3>
      <div role="img" aria-label={`Score weights for ${PRIORITY_NAME[lab.priority]}: price ${lab.weights.price}%, delivery ${lab.weights.delivery}%, warranty ${lab.weights.warranty}%`} className="mt-3 flex h-3 overflow-hidden rounded-full">
        {(["price", "delivery", "warranty"] as const).map((c) => (
          <span key={c} className={`${COMP_CLASS[c]} ${COMP_PATTERN[c]}`} style={{ width: `${lab.weights[c]}%` }} />
        ))}
      </div>
      <ol className="mt-4 space-y-2.5">
        {lab.why.map((line, i) => (
          <li key={i} className="flex gap-2.5 text-[0.95rem]">
            <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-v3-soft text-[0.7rem] font-extrabold text-v3-primary-ink">{i + 1}</span>
            <span className="text-pretty">{line}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-v3-ink2">Computed from your request and the stored scores.</p>

      <div className="mt-6 rounded-v3-md border border-dashed border-v3-line-strong bg-v3-soft2/60 p-4">
        <p className="flex flex-wrap items-center gap-2 text-sm font-extrabold">
          What-if comparison <Chip tone="accent" className="!py-0.5 !text-[0.68rem]">Hypothetical</Chip>
        </p>
        <p className="mt-1 text-xs text-v3-ink2">Re-ranks the same four offers with the server&apos;s ranking under another priority. It changes nothing: your negotiation and any approved offer stay exactly as they are.</p>
        <div role="radiogroup" aria-label="Priority for the what-if comparison" className="mt-3 inline-flex flex-wrap gap-1 rounded-v3-md bg-v3-sunken p-1">
          {PRIORITIES.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={hypo === p} onClick={() => setHypo(p)} className={`min-h-11 rounded-[10px] px-3.5 text-sm font-bold transition-colors duration-(--v3-d1) ${hypo === p ? "bg-v3-surface text-v3-ink shadow-v3-card" : "text-v3-ink2 hover:text-v3-ink"}`}>
              {PRIORITY_NAME[p]}
              {p === lab.priority && <span className="sr-only"> (your choice)</span>}
            </button>
          ))}
        </div>
        <p role="status" className="mt-3 text-sm">
          {hypo === lab.priority ? (
            <span className="text-v3-ink2">This is the priority you chose, so it is the real result.</span>
          ) : altWinner ? (
            <>
              With <strong>{PRIORITY_NAME[hypo]}</strong>, the ranking would put <strong>{SELLER_BRANDS[altWinner.sellerId].brand}</strong> first ({alt!.scores[altWinner.offerId]}/100)
              {altWinner.offerId === lab.winner.offer.offerId ? ": the same offer." : `, not ${lab.winner.brand}.`}
            </>
          ) : (
            <span className="text-v3-ink2">No eligible offer to rank.</span>
          )}
        </p>
      </div>
    </div>
  );
}

/* ---------- E. Evidence and reasoning ---------- */

function Evidence({ lab, onShowEvent }: { lab: LabData; onShowEvent?: (r: EventRef) => void }) {
  return (
    <div className="v3-card p-5 sm:p-6">
      <h3 className="font-v3-head text-lg font-extrabold">Evidence and reasoning</h3>
      <p className="mt-1 text-sm text-v3-ink2">Open a conclusion to see where it comes from. Each line says who produced it, and links to the recorded events behind it.</p>
      <div className="mt-4 space-y-2.5">
        {lab.conclusions.map((c, i) => (
          <details key={c.id} open={i === 0} className="group rounded-v3-md border border-v3-line bg-v3-surface">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3.5 py-2 font-extrabold">
              {c.id !== "winner" && <StoreMark id={c.id as SellerId} size={22} />}
              {c.title}
              <span className="ml-auto text-xs font-semibold text-v3-ink2">{c.evidence.length} item{c.evidence.length === 1 ? "" : "s"}</span>
            </summary>
            <ul className="space-y-2.5 border-t border-v3-line px-3.5 py-3">
              {c.evidence.map((e) => (
                <li key={e.id} className="text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <OriginChip origin={e.origin} model={e.origin === "ai" ? lab.explanation.model : null} />
                  </p>
                  <p className="mt-1 text-pretty">{e.origin === "ai" || e.origin === "fallback" ? `“${e.text}”` : e.text}</p>
                  {e.events.length > 0 && (
                    <p className="mt-1.5 flex flex-wrap gap-1.5">
                      {e.events.map((ev) =>
                        onShowEvent ? (
                          <button key={ev.eventId} type="button" onClick={() => onShowEvent(ev)} className="min-h-8 rounded-full border border-v3-line-strong bg-v3-surface px-2.5 text-[0.7rem] font-bold text-v3-primary-ink hover:bg-v3-soft2">
                            #{ev.sequence} {ev.type} · show in conversation
                          </button>
                        ) : (
                          <span key={ev.eventId} className="v3-chip !py-0.5 !text-[0.7rem]">
                            #{ev.sequence} {ev.type}
                          </span>
                        ),
                      )}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  );
}
