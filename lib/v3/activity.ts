import { SELLER_BRANDS } from "@/shared/sellers";
import { formatEur } from "@/shared/format";
import type { NegotiationEvent, NegotiationSession } from "@/shared/contracts/types";
import { PHASE_STATUS } from "./phase";

/**
 * Agent D's activity line: one short, present-tense sentence per *recorded* event.
 *
 * It is a reading aid, not a transcript. The persisted feed (`event.feedText`) is shown verbatim in the log and is
 * never replaced by these phrases. Every number or name below comes from the event payload or the seller identity;
 * nothing is generated, and an event we do not understand yields no sentence at all.
 */
export type ActivityTone = "neutral" | "store" | "good" | "notice";

export interface ActivityLine {
  eventId: string;
  text: string;
  tone: ActivityTone;
  /** Where the words came from: a real model reply, the rules fallback, or neither (rule engine / server facts). */
  source: "ai" | "fallback" | null;
}

/** The model-written origins the backend records: seller/buyer turns say "gemini"; the buyer's final choice says "llm". */
export const isAi = (source: unknown): boolean => source === "gemini" || source === "llm";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const brandOf = (e: NegotiationEvent): string => (e.sellerId ? SELLER_BRANDS[e.sellerId].brand : "A store");
const REASON: Record<string, string> = {
  over_budget: "over your budget",
  out_of_stock: "out of stock",
  invalid_policy: "failed the policy check",
};

export function activityForEvent(e: NegotiationEvent): ActivityLine | null {
  const source = isAi(e.payload.source) ? "ai" : e.payload.source === "rules_fallback" ? "fallback" : null;
  const line = (text: string, tone: ActivityTone): ActivityLine => ({ eventId: e.eventId, text, tone, source });
  const brand = brandOf(e);

  switch (e.type) {
    case "AGENT_INITIALIZED":
      return line("Understood your mission.", "neutral");
    case "SELLER_DISCOVERED":
      return line(`Found ${brand}.`, "store");
    case "OFFER_RECEIVED": {
      const p = num(e.payload.initialPriceCents);
      return line(p !== null ? `${brand} opened at ${formatEur(p)}.` : `${brand} sent its opening offer.`, "store");
    }
    case "BUYER_MESSAGE": {
      const target = num(e.payload.targetPriceCents);
      return line(target !== null ? `Sent a counteroffer to ${brand}: target ${formatEur(target)} for the item.` : `Sent a counteroffer to ${brand}.`, "neutral");
    }
    case "COUNTEROFFER_RECEIVED": {
      const prev = num(e.payload.previousPriceCents);
      const next = num(e.payload.newPriceCents);
      if (prev !== null && next !== null && next < prev && e.payload.held !== true) return line(`${brand} has replied: ${formatEur(next)}, down from ${formatEur(prev)}.`, "good");
      if (next !== null) return line(`${brand} has replied and kept ${formatEur(next)}.`, "store");
      return line(`${brand} has replied.`, "store");
    }
    case "REQUIREMENT_VERIFIED":
      return line(e.payload.passed === true ? `Checked ${brand} against your budget: within budget.` : `Checked ${brand} against your budget: over budget.`, "neutral");
    case "SELLER_REJECTED":
      return line(`Set ${brand} aside: ${REASON[String(e.payload.reasonCode)] ?? "not eligible"}.`, "notice");
    case "OFFER_EVALUATED": {
      const score = num(e.payload.score);
      return line(score !== null ? `Scored ${brand}: ${score}/100 for your priorities.` : `Scored ${brand}.`, "neutral");
    }
    case "BUYER_DECISION":
      return line(e.payload.final === true ? "Made the final choice among eligible offers." : "Decided how to approach this round.", "neutral");
    case "WINNER_SELECTED":
      return line("Found the strongest eligible offer.", "good");
    case "NEGOTIATION_COMPLETE":
      return e.payload.outcome === "no_offer_within_budget"
        ? line("No offer fit your budget. Nothing was paid.", "notice")
        : line("Recommendation ready. Nothing has been paid.", "good");
    case "AGENT_FALLBACK":
      return line(`${brand === "A store" ? "An agent" : brand}: a rule-based move covered an AI turn. This is not a store decision.`, "notice");
    case "OFFER_REJECTED_BY_SERVER":
      return line(`Server validation rejected a proposal${e.sellerId ? ` from ${brand}` : ""}; the last valid price stands. This is not a store decision.`, "notice");
  }
}

/** All recorded activity so far, oldest first. */
export function deriveActivity(visible: readonly NegotiationEvent[]): ActivityLine[] {
  return visible.flatMap((e) => activityForEvent(e) ?? []);
}

/**
 * The single sentence shown beside Agent D right now: the newest recorded event's phrase when there is one,
 * a recorded waiting state ("X is replying") for live runs, or the phase description before any event exists.
 */
export function currentStatusLine(
  visible: readonly NegotiationEvent[],
  opts: { awaiting?: { brand: string }[]; session?: Pick<NegotiationSession, "status"> } = {},
): { text: string; tone: ActivityTone } {
  const waiting = opts.awaiting?.[0];
  if (waiting) return { text: `Waiting for ${waiting.brand} to reply.`, tone: "store" };
  const last = visible.at(-1);
  if (!last) return { text: "Opening the mission…", tone: "neutral" };
  const line = activityForEvent(last);
  if (line && last.phase !== "complete") return { text: line.text, tone: line.tone };
  return { text: PHASE_STATUS[last.phase], tone: last.phase === "complete" ? "good" : "neutral" };
}

export function sourceLabel(e: NegotiationEvent): "AI reply" | "Rules fallback" | null {
  if (isAi(e.payload.source)) return "AI reply";
  if (e.payload.source === "rules_fallback") return "Rules fallback";
  return null;
}
