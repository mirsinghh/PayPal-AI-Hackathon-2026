import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "agentdeal-v4l-"));

import { getSession, saveSession } from "@/server/db/store";
import { resetRunSlotsForTests } from "@/server/agents/config";
import type { ModelCaller, ModelRequest } from "@/server/agents/model";
import { runMultiAgentNegotiation } from "@/server/agents/run";
import { prepareSession, startNegotiation } from "@/server/negotiation/service";
import { rankOffers } from "@/server/negotiation/ranking";
import { buildLab, scoreComponents, whatIf, compareTo } from "@/lib/v4/lab";
import { PRIORITIES, type NegotiationSession, type Priority, type ProductIntent } from "@/shared/contracts/types";

const intentFor = (priority: Priority, productQuery = "Running shoes", budgetCents = 10_000): ProductIntent => ({ productQuery, budgetCents, currency: "EUR", priority, preferences: ["warranty", "free_shipping"], language: "en" });

describe("Decision Lab data", () => {
  it.each(PRIORITIES)("reproduces the server's stored scores from the real scoring formula (%s)", async (priority) => {
    const s = await prepareSession(intentFor(priority), { caller: null });
    const comps = scoreComponents(s.offers, priority);
    for (const o of s.offers) {
      const c = comps[o.offerId];
      expect(Math.round(c.price + c.delivery + c.warranty)).toBe(s.evaluation.scores[o.offerId]);
    }
    const lab = buildLab(s)!;
    expect(lab.breakdownReliable).toBe(true);
    expect(lab.rows.every((r) => r.components !== null)).toBe(true);
  });

  it("explains the stored recommendation, with eligible offers ranked before set-aside ones", async () => {
    const s = await prepareSession(intentFor("best_value"), { caller: null });
    const lab = buildLab(s)!;
    expect(lab.winner.offer.offerId).toBe(s.recommendedOfferId);
    expect(lab.rows.map((r) => r.eligible)).toEqual([...lab.rows.map((r) => r.eligible)].sort((a, b) => Number(b) - Number(a)));
    const ranks = lab.rows.filter((r) => r.eligible).map((r) => r.rank);
    expect(ranks).toEqual(ranks.map((_, i) => i + 1));
    expect(lab.rows.filter((r) => !r.eligible).every((r) => r.rank === null && r.whyNot)).toBe(true);
    expect(lab.rows.every((r) => r.score === s.evaluation.scores[r.offer.offerId])).toBe(true);
    expect(lab.priority).toBe("best_value");
    expect(lab.weights).toEqual({ price: 45, delivery: 25, warranty: 30 });
    expect(lab.advantages).toEqual(s.evaluation.aiReasons);
    expect(lab.tradeoffs).toEqual(s.evaluation.tradeoffs);
  });

  it("answers the trade-off questions from the eligible offers only", async () => {
    const s = await prepareSession(intentFor("lowest_price"), { caller: null });
    const lab = buildLab(s)!;
    const eligible = s.offers.filter((o) => o.eligible);
    const f = Object.fromEntries(lab.facets.map((x) => [x.id, x]));
    expect(f.cheapest.sellerIds.every((id) => eligible.find((o) => o.sellerId === id)!.finalPriceCents === Math.min(...eligible.map((o) => o.finalPriceCents)))).toBe(true);
    expect(f.fastest.sellerIds.every((id) => eligible.find((o) => o.sellerId === id)!.deliveryDays === Math.min(...eligible.map((o) => o.deliveryDays)))).toBe(true);
    expect(f.warranty.sellerIds.every((id) => eligible.find((o) => o.sellerId === id)!.warrantyMonths === Math.max(...eligible.map((o) => o.warrantyMonths)))).toBe(true);
    expect(f.match.sellerIds).toEqual([lab.winner.sellerId]);
    expect(f.budget.sellerIds.length).toBeLessThanOrEqual(eligible.length);
    expect(f.budget.value).toContain("within €100.00");
  });

  it("what-if is the server's own ranking under another priority, and changes nothing", async () => {
    const s = await prepareSession(intentFor("best_value"), { caller: null });
    const before = JSON.stringify(s);
    for (const p of PRIORITIES) {
      const r = whatIf(s.offers, p)!;
      const real = rankOffers(s.offers, p);
      expect(r).toEqual({ winnerOfferId: real.recommendedOfferId, rankedOfferIds: real.rankedOfferIds, scores: real.scores });
    }
    expect(whatIf(s.offers, "best_value")!.rankedOfferIds).toEqual(s.evaluation.rankedOfferIds);
    expect(whatIf(s.offers.map((o) => ({ ...o, eligible: false })), "best_value")).toBeNull();
    expect(JSON.stringify(s)).toBe(before);
  });

  it("keeps every piece of evidence tied to real persisted events with the right origin", async () => {
    const s = await prepareSession(intentFor("best_value"), { caller: null });
    const lab = buildLab(s)!;
    const byId = new Map(s.events.map((e) => [e.eventId, e]));
    const all = lab.conclusions.flatMap((c) => c.evidence);
    for (const ev of all) for (const ref of ev.events) expect(byId.get(ref.eventId)?.type).toBe(ref.type);
    // Rule-based run: the explanation is the rules fallback, never an "AI agent message".
    expect(lab.explanation.origin).toBe("fallback");
    expect(all.some((e) => e.origin === "ai")).toBe(false);
    // Server checks cite server events; computations cite none.
    expect(all.filter((e) => e.origin === "server").every((e) => e.events.length > 0)).toBe(true);
    expect(all.filter((e) => e.origin === "computed").every((e) => e.events.length === 0)).toBe(true);
    expect(lab.conclusions[0].title).toBe(`Why ${lab.winner.brand}`);
    expect(lab.conclusions).toHaveLength(4);
  });

  it("returns nothing until the negotiation has a recommendation", async () => {
    const s = await prepareSession(intentFor("best_value"), { caller: null });
    expect(buildLab({ ...s, status: "negotiating" })).toBeNull();
    expect(buildLab({ ...s, recommendedOfferId: "nope" })).toBeNull();
  });

  it("hides the breakdown rather than invent it when the stored scores can't be reproduced", async () => {
    const s = await prepareSession(intentFor("best_value"), { caller: null });
    const tampered: NegotiationSession = { ...s, evaluation: { ...s.evaluation, scores: Object.fromEntries(Object.entries(s.evaluation.scores).map(([k, v]) => [k, v + 7])) } };
    const lab = buildLab(tampered)!;
    expect(lab.breakdownReliable).toBe(false);
    expect(lab.rows.every((r) => r.components === null)).toBe(true);
  });

  it("compares any store with the pick in plain arithmetic", async () => {
    const s = await prepareSession(intentFor("best_value"), { caller: null });
    const lab = buildLab(s)!;
    const other = lab.rows.find((r) => r.offer.offerId !== lab.winner.offer.offerId)!;
    const text = compareTo(other.offer, lab.winner.offer).join(" ");
    expect(text).toMatch(/€|day|month/);
  });
});

/* ---------- a (scripted) multi-agent session: AI explanation, final-choice event ---------- */
interface Row { sellerId: string; offerId: string; itemPriceCents: number; itemPrice: string; total: string; withinBudget: boolean }
interface Prompt { turn?: string; yourListPriceCents?: number; yourCurrentItemPriceCents?: number; offers?: Row[] }

function fakeModel(): ModelCaller {
  return async (req: ModelRequest) => {
    const agent = req.system.includes("Buyer Agent of a shopper") ? "buyer" : "seller";
    let u: Prompt | null = null;
    try {
      u = JSON.parse(req.user);
    } catch {
      const last = [...req.history].reverse().find((t) => t.role === "user");
      u = last ? JSON.parse(last.text) : null;
    }
    let out: unknown;
    if (agent === "seller") {
      out = u?.turn === "opening" ? { action: "quote", priceCents: u.yourListPriceCents!, message: "Here is my price for this item." } : { action: "concede", priceCents: u!.yourCurrentItemPriceCents! - Math.max(1, Math.floor(u!.yourCurrentItemPriceCents! / 100)), message: "A little better, as requested." };
    } else if (String(u?.turn).startsWith("negotiation_round")) {
      out = { rationale: "Asking every seller for a small discount.", moves: u!.offers!.map((o) => ({ sellerId: o.sellerId, action: "counter", targetPriceCents: Math.floor(o.itemPriceCents * 0.97), message: `Can you beat ${o.itemPrice}?` })) };
    } else {
      const best = u!.offers!.filter((o) => o.withinBudget).sort((a, b) => a.total.localeCompare(b.total, "en", { numeric: true }))[0];
      out = { chosenOfferId: best.offerId, summary: `Best value for you at ${best.total} all-in.`, reasons: ["Lowest total within budget."], tradeoffs: ["Slower delivery than the fastest store."] };
    }
    return { text: JSON.stringify(out), model: "fake-model", inputTokens: 1, outputTokens: 1 };
  };
}

describe("Decision Lab on a multi-agent session", () => {
  beforeEach(() => {
    resetRunSlotsForTests();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("labels the explanation as an AI agent message, links it to the final-choice event and flags an off-top choice", async () => {
    vi.stubEnv("MULTI_AGENT_NEGOTIATION", "true");
    const intent = intentFor("best_value", "Wireless noise-cancelling headphones", 35_000);
    const caller = fakeModel();
    const { session } = await startNegotiation(intent, { caller });
    await saveSession(session);
    await runMultiAgentNegotiation(session.sessionId, intent, "headphones", caller, {});
    const stored = (await getSession(session.sessionId))!;
    const lab = buildLab(stored)!;
    expect(lab.explanation).toEqual({ text: stored.evaluation.aiSummary, origin: "ai", model: "fake-model" });
    const expl = lab.conclusions[0].evidence[0];
    expect(expl.origin).toBe("ai");
    const final = stored.events.find((e) => e.type === "BUYER_DECISION" && e.payload.final === true)!;
    expect(expl.events.map((r) => r.eventId)).toEqual([final.eventId]);
    expect(lab.choseOffTop).toBe(stored.evaluation.rankedOfferIds[0] !== stored.recommendedOfferId);
    if (lab.choseOffTop) expect(lab.why.join(" ")).toMatch(/different offer from the server's top-ranked/);
    expect(lab.breakdownReliable).toBe(true);
  });
});
