import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "agentd-v4v-"));

import { prepareSession } from "@/server/negotiation/service";
import { BUYER_SYSTEM, sellerSystem } from "@/server/agents/run";
import { SELLER_PROFILES, catalogItem } from "@/server/agents/catalog";
import { buildConversation } from "@/lib/v3/conversation";
import { buildV4Conversation, filterMessages, groupMessages } from "@/lib/v4/conversation";
import { SELLER_PERSONA } from "@/lib/v4/personas";
import { buyerAsk, comparisonClause, pick, sellerOpening, sellerReply } from "@/lib/v4/scripts";
import { SELLER_IDS, type NegotiationEvent, type NegotiationSession, type ProductIntent } from "@/shared/contracts/types";

const intent: ProductIntent = { productQuery: "Running shoes", budgetCents: 10_000, currency: "EUR", priority: "best_value", preferences: ["warranty"], language: "en" };
const ctxOf = (s: NegotiationSession) => ({ budgetCents: s.intent.budgetCents, query: s.intent.productQuery, priority: s.intent.priority, preferences: s.intent.preferences, offers: s.offers });

describe("V4 characters: rule-based simulation lines", () => {
  it("gives every store its own voice, built only from validated data, and never calls them AI", async () => {
    const s = await prepareSession(intent, { caller: null });
    const msgs = buildV4Conversation(s.events, ctxOf(s));
    const spoken = msgs.filter((m) => ["opening", "ask", "reply"].includes(m.kind));
    expect(spoken.length).toBeGreaterThanOrEqual(12);
    expect(spoken.every((m) => m.origin === "rules" && m.scripted)).toBe(true);
    expect(msgs.some((m) => m.origin === "ai")).toBe(false);
    // Each scripted line is non-empty prose and the money lives in the validated price card, not the sentence.
    for (const m of spoken) expect(m.text && m.text.length > 20).toBe(true);
    for (const m of msgs.filter((x) => x.kind === "opening" || x.kind === "reply")) expect(m.price).not.toBeNull();
    // Only amounts the server recorded appear in the text (prices, budget): never a computed number.
    expect(msgs.flatMap((m) => m.amounts).every((a) => a.recorded)).toBe(true);
    // Voices differ per store: no two stores open with the same sentence shape.
    const opens = msgs.filter((m) => m.kind === "opening").map((m) => (m.text ?? "").replace(/€[\d.,]+/g, "€X"));
    expect(new Set(opens).size).toBe(4);
  });

  it("is deterministic and prefix-stable: replaying or polling never rewrites a line", async () => {
    const s = await prepareSession(intent, { caller: null });
    const full = buildV4Conversation(s.events, ctxOf(s));
    expect(buildV4Conversation(s.events, ctxOf(s))).toEqual(full);
    for (let k = 1; k <= s.events.length; k++) {
      const part = buildV4Conversation(s.events.slice(0, k), ctxOf(s));
      expect(part).toEqual(full.slice(0, part.length));
    }
  });

  it("derives replies from recorded prices, and only compares with offers already seen", async () => {
    const s = await prepareSession(intent, { caller: null });
    const msgs = buildV4Conversation(s.events, ctxOf(s));
    for (const m of msgs.filter((x) => x.kind === "reply")) {
      expect(m.outcome).toBe("improved"); // V0 only emits a reply when the price really dropped
      expect(m.text).toContain(m.text!.match(/€[\d.,]+/)![0]);
    }
    // Asks happen after every opening in the replay, so a comparison may mention another store's price: it is a recorded one.
    const recorded = new Set(s.events.flatMap((e) => ["initialPriceCents", "newPriceCents", "previousPriceCents"].map((k) => e.payload[k]).filter((v): v is number => typeof v === "number")));
    for (const m of msgs.filter((x) => x.kind === "ask")) for (const a of m.amounts) expect(recorded.has(a.cents) || a.cents === s.intent.budgetCents).toBe(true);
    // With nothing else known yet there is nothing to compare: no invented rivals.
    expect(comparisonClause({ own: { sellerId: "nova", totalCents: 9000, deliveryDays: 6, warrantyMonths: 12, freeShipping: false }, others: [], priority: "best_value" })).toBeNull();
  });

  it("never claims what the data does not show", () => {
    const slow = { deliveryDays: 6, warrantyMonths: 12, freeShipping: false };
    const fast = { deliveryDays: 1, warrantyMonths: 12, freeShipping: true };
    for (let i = 0; i < 20; i++) {
      expect(sellerOpening("orbit", 12_345, slow, `s${i}`)).not.toMatch(/next.day/i);
      expect(sellerOpening("orbit", 12_345, fast, `s${i}`)).toMatch(/free shipping|next.day|fast/i);
      expect(sellerOpening("prism", 12_345, { deliveryDays: 4, warrantyMonths: 12, freeShipping: false }, `s${i}`)).not.toMatch(/long-term/i);
      expect(sellerReply("prism", { previousCents: 1, newCents: 2, held: false }, { deliveryDays: 4, warrantyMonths: 12, freeShipping: true }, `s${i}`)).not.toMatch(/long-term/i);
    }
  });

  it("keeps each character recognisable (tone markers from the brief)", () => {
    const f = { deliveryDays: 3, warrantyMonths: 36, freeShipping: true };
    const all = (id: "nova" | "orbit" | "prism" | "vertex") => Array.from({ length: 12 }, (_, i) => `${sellerOpening(id, 9900, f, `a${i}`)} ${sellerReply(id, { previousCents: 9900, newCents: 9500, held: false }, f, `b${i}`)} ${sellerReply(id, { previousCents: 9900, newCents: 9900, held: true }, f, `c${i}`)}`).join(" ");
    expect(all("nova")).toMatch(/bargain|deal|outlet|attractive/i);
    expect(all("orbit")).toMatch(/speed|deliver|fast/i);
    expect(all("prism")).toMatch(/warranty|value|protection/i);
    expect(all("vertex")).toMatch(/firm|limit|can't|current terms/i);
    // Agent D: priorities and preferences of the shopper, one comparison at most, always a closing question.
    const ask = buyerAsk({ target: "nova", priority: "fast_delivery", preferences: ["warranty"], budgetCents: 10_000, own: { sellerId: "nova", totalCents: 9000, deliveryDays: 6, warrantyMonths: 12, freeShipping: false }, others: [{ sellerId: "orbit", totalCents: 9500, deliveryDays: 1, warrantyMonths: 12, freeShipping: true }] }, "x");
    expect(ask).toMatch(/Delivery speed matters most/);
    expect(ask).toMatch(/warranty/i);
    expect(ask).toMatch(/Another seller delivers sooner/);
    expect(ask.endsWith("?")).toBe(true);
    expect(pick(["a", "b", "c"], "same")).toBe(pick(["a", "b", "c"], "same"));
  });

  it("groups the story by round and offers focused lenses", async () => {
    const s = await prepareSession(intent, { caller: null });
    const msgs = buildV4Conversation(s.events, ctxOf(s));
    const groups = groupMessages(msgs).map((g) => g.key);
    expect(groups[0]).toBe("mission");
    expect(groups).toEqual(expect.arrayContaining(["opening", "round-1", "evaluation"]));
    expect(filterMessages(msgs, "validation", null).every((m) => m.speaker === "server" || m.kind === "status")).toBe(true);
    expect(filterMessages(msgs, "offers", "nova").every((m) => m.sellerId === "nova" && m.price !== null)).toBe(true);
    expect(filterMessages(msgs, "result", null).every((m) => m.group.key === "evaluation")).toBe(true);
    expect(filterMessages(msgs, "chat", null)).toHaveLength(msgs.length);
  });
});

describe("V4 never rewrites what a real model said", () => {
  const real = JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/gemini-run.json"), "utf8")) as { intent: ProductIntent; events: NegotiationEvent[] };
  const ctx = { budgetCents: real.intent.budgetCents, priority: real.intent.priority, preferences: real.intent.preferences, offers: [] };

  it("keeps Gemini's own text, origin and the rules fallback text untouched", () => {
    const v3 = buildConversation(real.events, { budgetCents: real.intent.budgetCents });
    const v4 = buildV4Conversation(real.events, ctx);
    expect(v4.map((m) => m.text)).toEqual(v3.map((m) => m.text));
    expect(v4.map((m) => m.origin)).toEqual(v3.map((m) => m.origin));
    expect(v4.some((m) => m.scripted)).toBe(false);
    expect(v4.filter((m) => m.origin === "ai").length).toBeGreaterThan(10);
    expect(v4.filter((m) => m.kind === "validation").every((m) => m.speaker === "server" && m.origin === "server")).toBe(true);
    expect(v4.filter((m) => m.kind === "fallback").every((m) => m.speaker === "server")).toBe(true);
  });

  it("separates a store holding its price (commercial) from a server rejection (guardrail)", () => {
    const v4 = buildV4Conversation(real.events, ctx);
    expect(v4.filter((m) => m.outcome === "held").every((m) => m.speaker === "seller")).toBe(true);
    expect(v4.filter((m) => m.kind === "validation").every((m) => m.outcome === null && m.facts.includes("Not a store decision"))).toBe(true);
    // Real rounds are used for grouping when the engine recorded them.
    expect(groupMessages(v4).map((g) => g.key)).toEqual(expect.arrayContaining(["opening", "round-1", "round-2", "evaluation"]));
  });
});

describe("V4 voices change how agents speak, not the business rules", () => {
  it("adds a voice to every seller prompt and to Agent D, with no number or rule inside the voice", () => {
    for (const id of SELLER_IDS) {
      const p = SELLER_PROFILES[id];
      const prompt = sellerSystem(p, catalogItem(id, "headphones"));
      expect(p.voice.length).toBeGreaterThan(80);
      expect(p.voice).not.toMatch(/[\d€%]/); // a voice can't smuggle a price, limit or percentage
      expect(prompt).toContain(p.voice);
      expect(prompt).toContain("never changes your prices, reserve, concession limit"); // the rules still come last and win
      expect(prompt).toContain("never mention or hint at it"); // reserve price still protected
      expect(prompt).toContain(`${p.maxConcessionPerRoundBps / 100}%`); // concession cap unchanged
    }
    expect(SELLER_PROFILES.nova.voice).toMatch(/Bargain Hunter/);
    expect(SELLER_PROFILES.orbit.voice).toMatch(/Speed Specialist/);
    expect(SELLER_PROFILES.prism.voice).toMatch(/Premium Advisor/);
    expect(SELLER_PROFILES.vertex.voice).toMatch(/Tough Negotiator/);
    expect(BUYER_SYSTEM).toMatch(/Agent D/);
    expect(BUYER_SYSTEM).toMatch(/compare ONLY with offers present in the data/);
  });

  it("keeps the economic strategy of every store exactly as it was", () => {
    expect(Object.fromEntries(SELLER_IDS.map((id) => [id, [SELLER_PROFILES[id].strategy, SELLER_PROFILES[id].maxConcessionPerRoundBps, SELLER_PROFILES[id].deliveryDays, SELLER_PROFILES[id].warrantyMonths]]))).toEqual({
      nova: ["price_fighter", 600, 6, 12],
      orbit: ["fast_delivery", 400, 1, 12],
      prism: ["premium_value", 300, 4, 36],
      vertex: ["hard_negotiator", 150, 3, 24],
    });
    expect(Object.values(SELLER_PERSONA).map((p) => p.title)).toEqual(["The Bargain Hunter", "The Speed Specialist", "The Premium Advisor", "The Tough Negotiator"]);
  });
});
