"use client";

import { memo } from "react";
import type { Draft } from "@/lib/negotiation-view";
import { formatEur } from "@/shared/format";
import type { ProductIntent } from "@/shared/contracts/types";
import { DealSlip, SlotRow } from "@/components/slip/Slip";

/**
 * The deal slip while the negotiation runs. Each row stays a placeholder until the recorded event that produces it,
 * so the document visibly fills in as the stores answer. "Lowest so far" is arithmetic over visible offers, and
 * "Recommended" only appears with the server's winner event.
 */
export const DraftSlip = memo(function DraftSlip({
  draft,
  intent,
  short = false,
  className = "",
}: {
  draft: Draft;
  intent?: ProductIntent;
  /** Home-page sample: only the rows that tell the story. */
  short?: boolean;
  className?: string;
}) {
  const started = draft.offers > 0;
  return (
    <DealSlip stage={draft.recommended ? "ready" : "drafting"} className={className}>
      <dl className={short ? "space-y-2.5" : "space-y-3"}>
        {!short && intent && <SlotRow label="Request" value={intent.productQuery} />}
        {!short && intent && <SlotRow label="Budget" value={`up to ${formatEur(intent.budgetCents)}`} />}
        <SlotRow label="Stores joined" value={draft.joined > 0 ? `${draft.joined} of ${draft.total}` : null} />
        <SlotRow label="Offers received" value={started ? `${draft.offers} of ${draft.total}` : null} />
        {!short && <SlotRow label="Within budget" value={started ? `${draft.withinBudget} of ${draft.offers}` : null} />}
        {!short && <SlotRow label="Counter-offers" value={started ? String(draft.counters) : null} />}
        <SlotRow label="Lowest so far" value={draft.lowest ? `${formatEur(draft.lowest.cents)} · ${draft.lowest.brand}` : null} />
        <SlotRow label="Recommended" value={draft.recommended ? `${draft.recommended.brand} · ${formatEur(draft.recommended.cents)}` : null} />
      </dl>
    </DealSlip>
  );
});
