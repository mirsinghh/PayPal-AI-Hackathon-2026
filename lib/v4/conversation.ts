import { SELLER_IDS, type NegotiationEvent, type NegotiationSession, type Offer, type SellerId } from "@/shared/contracts/types";
import { buildConversation, type ChatMessage } from "@/lib/v3/conversation";
import { authorLabel, authorOf, type Author } from "./provider";
import { buyerAsk, sellerOpening, sellerReply, type KnownOffer } from "./scripts";

/**
 * The V4 conversation = the V3 conversation (built only from persisted events) plus three presentation layers:
 *
 *  1. VOICES for the rule-based simulation. V0 events carry terse lines; where (and only where) the event's own source
 *     says "rule engine" (no `source`), the text is replaced by a scripted, in-character line composed from validated
 *     data (see ./scripts.ts). Those messages are marked `scripted` and keep origin "rules" (Rule-based simulation).
 *  2. NOTHING is rewritten for AI turns or rules fallbacks: a Gemini message keeps its own text and origin, and a
 *     fallback keeps the text the rules engine persisted.
 *  3. GROUPING by round, and an `outcome` for seller replies (improved / held), purely from recorded prices.
 */
export type Outcome = "improved" | "held";

export interface V4Message extends ChatMessage {
  /** The words are a deterministic rule-engine script, not a model's. Only ever true when origin === "rules". */
  scripted: boolean;
  group: { key: string; label: string };
  outcome: Outcome | null;
  /** Which provider/model/agent wrote an AI message, from the persisted event. Null for rules, server and system text. */
  author: Author | null;
  authorLabel: string | null;
}

const GROUP_MISSION = { key: "mission", label: "Mission" };
const GROUP_OPENING = { key: "opening", label: "Opening offers" };
const GROUP_EVAL = { key: "evaluation", label: "Evaluation" };
const roundGroup = (n: number) => ({ key: `round-${n}`, label: `Round ${n}` });

export interface V4Context {
  budgetCents: number;
  query?: string;
  priority: NegotiationSession["intent"]["priority"];
  preferences: NegotiationSession["intent"]["preferences"];
  /** The session's offers: their terms are used only once the store's own opening event has been seen. */
  offers: readonly Offer[];
}

export function buildV4Conversation(events: readonly NegotiationEvent[], ctx: V4Context): V4Message[] {
  const base = buildConversation(events, { budgetCents: ctx.budgetCents, query: ctx.query });
  const byEvent = new Map(events.map((e) => [e.eventId, e]));
  const offerBySeller = new Map<SellerId, Offer>(ctx.offers.map((o) => [o.sellerId, o]));

  const known = new Map<SellerId, KnownOffer>();
  const asks = new Map<SellerId, number>();
  let lastRound = 0;
  const out: V4Message[] = [];

  for (const m of base) {
    const e = byEvent.get(m.eventId);
    const id = m.sellerId;
    let text = m.text;
    let scripted = false;
    let templated = m.templated;
    const price = m.price;

    const terms = (sid: SellerId) => {
      const o = offerBySeller.get(sid);
      return { deliveryDays: o?.deliveryDays ?? null, warrantyMonths: o?.warrantyMonths ?? null, freeShipping: o ? (o.catalog ? o.catalog.shippingCents === 0 : o.freeShipping) : null };
    };

    // Track what is publicly known at this point of the replay (a store's terms only count after its opening).
    if (id && m.kind === "opening" && price) known.set(id, { sellerId: id, totalCents: price.currentCents, ...terms(id) });
    if (id && m.kind === "reply" && price && known.has(id)) known.set(id, { ...(known.get(id) as KnownOffer), totalCents: price.currentCents });

    const ruleEngine = m.origin === "rules" && e !== undefined && e.payload.source == null;
    if (ruleEngine && id) {
      const seed = m.eventId;
      if (m.kind === "opening" && price) {
        text = sellerOpening(id, price.currentCents, terms(id), seed);
        scripted = true;
        templated = false;
      } else if (m.kind === "ask") {
        const own = known.get(id) ?? null;
        text = buyerAsk({ target: id, priority: ctx.priority, preferences: ctx.preferences, budgetCents: ctx.budgetCents, own, others: SELLER_IDS.filter((s) => s !== id && known.has(s)).map((s) => known.get(s) as KnownOffer) }, seed);
        scripted = true;
      } else if (m.kind === "reply" && price) {
        text = sellerReply(id, { previousCents: price.previousCents, newCents: price.currentCents, held: price.held }, terms(id), seed);
        scripted = true;
      }
    }

    if (id && m.kind === "ask") asks.set(id, (asks.get(id) ?? 0) + 1);
    const round = m.round ?? (id && (m.kind === "ask" || m.kind === "reply") ? (asks.get(id) ?? 1) : null);

    let group = lastRound > 0 ? roundGroup(lastRound) : GROUP_OPENING;
    if (m.kind === "status" && (e?.type === "AGENT_INITIALIZED" || e?.type === "SELLER_DISCOVERED")) group = GROUP_MISSION;
    else if (m.kind === "opening") group = GROUP_OPENING;
    else if ((m.kind === "ask" || m.kind === "reply" || m.kind === "plan") && round !== null) {
      group = roundGroup(round);
      lastRound = Math.max(lastRound, round);
    } else if (m.kind === "verdict" || m.kind === "decision" || (m.kind === "status" && e?.type === "NEGOTIATION_COMPLETE")) group = GROUP_EVAL;

    const outcome: Outcome | null = m.kind === "reply" && price ? (price.held || (price.previousCents !== null && price.currentCents >= price.previousCents) ? "held" : "improved") : null;

    // Amounts quoted in a scripted line are re-checked against what the server recorded (they must all be recorded).
    const author = m.origin === "ai" && e && (m.speaker === "buyer" || m.speaker === "seller") ? authorOf(e, m.speaker) : null;
    out.push({ ...m, text, templated, scripted, group, outcome, round, price, author, authorLabel: author ? authorLabel(author) : null });
  }
  return out;
}

/** The only message groups the UI shows, in order of appearance. */
export function groupMessages(messages: readonly V4Message[]): { key: string; label: string; messages: V4Message[] }[] {
  const groups: { key: string; label: string; messages: V4Message[] }[] = [];
  for (const m of messages) {
    const g = groups.at(-1);
    if (g && g.key === m.group.key) g.messages.push(m);
    else groups.push({ key: m.group.key, label: m.group.label, messages: [m] });
  }
  return groups;
}

export type ConversationFilter = "chat" | "validation" | "offers" | "result";

export const FILTER_LABEL: Record<ConversationFilter, string> = {
  chat: "Conversation",
  offers: "Offer changes",
  validation: "Server checks",
  result: "Result",
};

/** Which messages a view shows. `chat` = everything spoken plus the markers that frame it; the rest are focused lenses. */
export function filterMessages(messages: readonly V4Message[], filter: ConversationFilter, sellerId: SellerId | null): V4Message[] {
  const mine = sellerId ? messages.filter((m) => m.sellerId === sellerId) : [...messages];
  switch (filter) {
    case "chat":
      return mine;
    case "offers":
      return mine.filter((m) => m.price !== null);
    case "validation":
      return messages.filter((m) => (m.speaker === "server" || m.kind === "status") && (!sellerId || m.sellerId === sellerId));
    case "result":
      return messages.filter((m) => m.group.key === GROUP_EVAL.key || m.kind === "decision");
  }
}

