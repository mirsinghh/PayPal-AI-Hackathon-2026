import { formatEur } from "@/shared/format";
import { SELLER_BRANDS } from "@/shared/sellers";
import type { NegotiationEvent, SellerId } from "@/shared/contracts/types";
import { isAi } from "./activity";

/**
 * The negotiation as a conversation, built ONLY from persisted events.
 *
 * Authenticity rules (tests/v3-conversation.test.ts):
 *  - A message's words are the event's own `payload.message` (what the model or the rule engine wrote, verbatim).
 *    Nothing is paraphrased, shortened or invented. The buyer's per-round rationale and the final choice come verbatim
 *    from the event's persisted `feedText`.
 *  - Where an event has no text (the V0 opening offer), a template built from the recorded price is used and marked
 *    `templated`, with origin "rules": it is never presented as an AI message.
 *  - Origin comes from the event's own `source`: gemini/llm -> ai, rules_fallback -> fallback, none on a message ->
 *    the rule engine. Server verdicts and guardrails are their own origin.
 *  - Money lives in `price` (taken from validated offer events), never in the prose. Euro amounts quoted inside a
 *    message are only cross-checked against prices the server already recorded; the UI treats them as narrative.
 */
export type MessageOrigin = "ai" | "rules" | "fallback" | "server" | "system";
export type Speaker = "buyer" | "seller" | "server" | "system";
export type MessageKind = "opening" | "ask" | "reply" | "plan" | "decision" | "validation" | "fallback" | "verdict" | "status";

export interface PriceChange {
  /** Price before this event for this store (null for an opening offer). */
  previousCents: number | null;
  /** All-in price the server validated. */
  currentCents: number;
  itemCents: number | null;
  shippingCents: number | null;
  /** The seller replied but kept its price. */
  held: boolean;
}

export interface AmountMention {
  cents: number;
  /** True when the server had already recorded this exact amount for this negotiation. */
  recorded: boolean;
}

export interface ChatMessage {
  id: string;
  eventId: string;
  sequence: number;
  atMs: number;
  /** Which store's thread it belongs to; null = buyer-level (plan, final choice, mission). */
  sellerId: SellerId | null;
  speaker: Speaker;
  kind: MessageKind;
  origin: MessageOrigin;
  /** Verbatim text, or a rule-engine template when `templated`. */
  text: string | null;
  templated: boolean;
  price: PriceChange | null;
  /** Buyer's target for the item (only on `ask`). */
  targetCents: number | null;
  round: number | null;
  /** Short checks/facts from the payload (score, within budget, rejection reason). */
  facts: string[];
  amounts: AmountMention[];
  tech: { type: string; source: string | null; provider: string | null; model: string | null; latencyMs: number | null; reasons: string[] };
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/* ---------- euro amounts quoted in free text (client-safe twin of server/agents/validate.ts) ---------- */

function toCents(raw: string): number | null {
  const s = raw.replace(/[.,]+$/, "");
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const sep = Math.max(lastDot, lastComma);
  let whole = s;
  let frac = "";
  if (sep >= 0) {
    const after = s.length - sep - 1;
    const both = lastDot >= 0 && lastComma >= 0;
    if (both || after !== 3) {
      whole = s.slice(0, sep);
      frac = s.slice(sep + 1);
    }
  }
  whole = whole.replace(/[.,]/g, "");
  if (!/^\d+$/.test(whole) || !/^\d{0,2}$/.test(frac)) return null;
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0") || 0);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function amountsInText(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(?:€|EUR)\s?(\d[\d.,]*)|(\d[\d.,]*)\s?(?:€|EUR)/gi)) out.push(toCents(m[1] ?? m[2]) ?? -1);
  return out;
}

const PRICE_KEYS = ["initialPriceCents", "itemPriceCents", "shippingCents", "previousPriceCents", "newPriceCents", "targetPriceCents"] as const;

const REASON_TEXT: Record<string, string> = { over_budget: "Over your budget", out_of_stock: "Out of stock", invalid_policy: "Failed the store's policy check" };

export function buildConversation(events: readonly NegotiationEvent[], ctx: { budgetCents: number; query?: string }): ChatMessage[] {
  const out: ChatMessage[] = [];
  const recorded = new Set<number>([ctx.budgetCents]);
  const brand = (id: SellerId | null) => (id ? SELLER_BRANDS[id].brand : "A store");

  for (const e of events) {
    // Only amounts the server had recorded up to this event count as recorded for this message.
    for (const k of PRICE_KEYS) {
      const v = num(e.payload[k]);
      if (v !== null) recorded.add(v);
    }
    const src = str(e.payload.source);
    const round = num(e.payload.round);
    const sourceOrigin: MessageOrigin = isAi(src) ? "ai" : src === "rules_fallback" ? "fallback" : "rules";
    const base = (patch: Partial<ChatMessage> & Pick<ChatMessage, "speaker" | "kind" | "origin">): ChatMessage => {
      const text = patch.text ?? null;
      return {
        id: e.eventId,
        eventId: e.eventId,
        sequence: e.sequence,
        atMs: e.atMs,
        sellerId: e.sellerId,
        text,
        templated: false,
        price: null,
        targetCents: null,
        round,
        facts: [],
        amounts: text ? amountsInText(text).map((cents) => ({ cents, recorded: recorded.has(cents) })) : [],
        tech: { type: e.type, source: src, provider: str(e.payload.provider), model: str(e.payload.model), latencyMs: num(e.payload.latencyMs), reasons: Array.isArray(e.payload.reasons) ? e.payload.reasons.map(String) : [] },
        ...patch,
      };
    };

    switch (e.type) {
      case "AGENT_INITIALIZED":
        out.push(base({ speaker: "system", kind: "status", origin: "system", sellerId: null, text: `Mission received: ${str(e.payload.productQuery) ?? ctx.query ?? "your request"}, up to ${formatEur(num(e.payload.budgetCents) ?? ctx.budgetCents)}.` }));
        break;
      case "SELLER_DISCOVERED":
        out.push(base({ speaker: "system", kind: "status", origin: "system", text: `${brand(e.sellerId)} joined the negotiation.` }));
        break;

      case "OFFER_RECEIVED": {
        const current = num(e.payload.initialPriceCents);
        const said = str(e.payload.message);
        out.push(
          base({
            speaker: "seller",
            kind: "opening",
            origin: sourceOrigin,
            text: said ?? (current !== null ? `Opening offer: ${formatEur(current)}.` : null),
            templated: !said,
            price: current !== null ? { previousCents: null, currentCents: current, itemCents: num(e.payload.itemPriceCents), shippingCents: num(e.payload.shippingCents), held: false } : null,
          }),
        );
        break;
      }

      case "BUYER_MESSAGE":
        out.push(base({ speaker: "buyer", kind: "ask", origin: sourceOrigin, text: str(e.payload.message), targetCents: num(e.payload.targetPriceCents) }));
        break;

      case "COUNTEROFFER_RECEIVED": {
        const current = num(e.payload.newPriceCents);
        const previous = num(e.payload.previousPriceCents);
        const said = str(e.payload.message);
        out.push(
          base({
            speaker: "seller",
            kind: "reply",
            origin: sourceOrigin,
            text: said,
            price: current !== null ? { previousCents: previous, currentCents: current, itemCents: num(e.payload.itemPriceCents), shippingCents: num(e.payload.shippingCents), held: e.payload.held === true || (previous !== null && previous === current) } : null,
          }),
        );
        break;
      }

      case "BUYER_DECISION":
        // The rationale / final choice text is persisted in the event's feedText; the payload carries no copy of it.
        out.push(
          base({
            speaker: "buyer",
            kind: e.payload.final === true ? "decision" : "plan",
            origin: sourceOrigin,
            sellerId: null,
            text: e.payload.final === true ? e.feedText : e.feedText.replace(/^Round \d+:\s*/, ""),
            facts: e.payload.final === true ? ["Validated by the server before it became the recommendation"] : [],
          }),
        );
        break;

      case "REQUIREMENT_VERIFIED":
        out.push(base({ speaker: "server", kind: "verdict", origin: "server", text: `Budget check: ${e.payload.passed === true ? "within your budget" : "over your budget"}.` }));
        break;
      case "OFFER_EVALUATED":
        out.push(base({ speaker: "server", kind: "verdict", origin: "server", text: `Scored ${num(e.payload.score) ?? "?"}/100 for your priorities.` }));
        break;
      case "SELLER_REJECTED":
        out.push(base({ speaker: "server", kind: "verdict", origin: "server", text: `${brand(e.sellerId)} was set aside by the server: ${REASON_TEXT[String(e.payload.reasonCode)] ?? "not eligible"}.`, facts: ["Not a decision by the store"] }));
        break;
      case "WINNER_SELECTED":
        out.push(base({ speaker: "server", kind: "verdict", origin: "server", text: `Strongest eligible offer: ${brand(e.sellerId)}.`, facts: [e.payload.reason === "buyer_agent_choice_validated" ? "Chosen by Agent D, validated by the server" : "Highest match score among eligible offers"] }));
        break;
      case "NEGOTIATION_COMPLETE":
        out.push(base({ speaker: "system", kind: "status", origin: "system", sellerId: null, text: e.payload.outcome === "no_offer_within_budget" ? "Finished: no offer fit your budget. Nothing was paid." : "Finished. Recommendation ready; nothing has been paid." }));
        break;

      case "AGENT_FALLBACK":
        out.push(base({ speaker: "server", kind: "fallback", origin: "fallback", text: e.feedText, facts: ["A rule-based move covered an AI turn", "Not a store decision"] }));
        break;
      case "OFFER_REJECTED_BY_SERVER":
        out.push(base({ speaker: "server", kind: "validation", origin: "server", text: e.feedText, facts: ["The last valid price stands", "Not a store decision"] }));
        break;
    }
  }
  return out;
}

/** One store's thread: its own messages. Buyer-level messages (plans, the final choice) live in the global view. */
export function threadFor(messages: readonly ChatMessage[], sellerId: SellerId | null): ChatMessage[] {
  return sellerId ? messages.filter((m) => m.sellerId === sellerId) : [...messages];
}

export const ORIGIN_LABEL: Record<MessageOrigin, string> = {
  ai: "AI agent message",
  rules: "Rule-based simulation",
  fallback: "Rules fallback",
  server: "Server validation",
  system: "System status",
};

/** Which Agent D pose accompanies a buyer-side message (a still of the pack's own animation for that moment). */
export function poseForMessage(m: Pick<ChatMessage, "kind" | "speaker">): "counteroffer" | "thinking" | "success" | "idle" {
  if (m.speaker !== "buyer") return "idle";
  return m.kind === "ask" ? "counteroffer" : m.kind === "plan" ? "thinking" : "success";
}
