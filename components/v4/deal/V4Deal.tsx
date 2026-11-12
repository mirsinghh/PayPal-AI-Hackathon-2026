"use client";

import { DealExperience } from "@/components/v3/offers/DealExperience";
import { DecisionLab } from "@/components/v4/lab/DecisionLab";
import { buildLab } from "@/lib/v4/lab";
import type { SessionWithPayment } from "@/lib/api";

/**
 * The V3 review screen (recommendation, approval, checkout hand-off: all unchanged) with Agent D's Decision Lab
 * placed between the recommendation and the full comparison. Approval and payment behave exactly as in V3.
 */
export function V4Deal({ id }: { id: string }) {
  return <DealExperience id={id} labSlot={(s: SessionWithPayment) => <LabSection s={s} />} />;
}

function LabSection({ s }: { s: SessionWithPayment }) {
  const lab = buildLab(s);
  if (!lab) return null;
  return <DecisionLab lab={lab} budgetCents={s.intent.budgetCents} offers={s.offers} />;
}
