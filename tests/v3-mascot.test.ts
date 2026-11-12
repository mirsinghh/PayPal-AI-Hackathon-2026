import { describe, expect, it } from "vitest";
import { directorReducer, initialDirector, positionOf, visualState, MAX_QUEUE, type DirectorAction, type DirectorState } from "@/lib/v3/mascot/director";
import { baseStateForPhase, cueForApproval, cueForEvent, cueForPayment, reactionsForCue, visualForEvent, WALK_CYCLES } from "@/lib/v3/mascot/event-map";
import { REACTION_PRIORITY, SPRITE_NAMES, VISUAL_STATES, VISUAL_TO_SPRITE, cycleMs, defaultCycles } from "@/lib/v3/mascot/manifest";
import type { EventPhase, EventType, NegotiationEvent, SellerId } from "@/shared/contracts/types";

let n = 0;
function ev(type: EventType, payload: Record<string, unknown> = {}, sellerId: SellerId | null = null, phase: EventPhase = "negotiate"): NegotiationEvent {
  n++;
  return { eventId: `evt_${n}`, sessionId: "s", sequence: n, atMs: n * 1000, phase, type, sellerId, payload, feedText: type };
}

const run = (actions: DirectorAction[], from: DirectorState = initialDirector()) => actions.reduce(directorReducer, from);

describe("manifest", () => {
  it("every product state maps to a real sprite and has a priority", () => {
    for (const s of VISUAL_STATES) {
      expect(SPRITE_NAMES).toContain(VISUAL_TO_SPRITE[s]);
      expect(REACTION_PRIORITY[s]).toBeGreaterThanOrEqual(0);
    }
    expect(new Set(Object.values(VISUAL_TO_SPRITE)).size).toBe(SPRITE_NAMES.length);
  });
  it("keeps the pack's 70-100 ms cadence instead of one speed for everything", () => {
    const cycles = SPRITE_NAMES.map((s) => cycleMs(s));
    expect(Math.min(...cycles)).toBe(560);
    expect(Math.max(...cycles)).toBe(800);
    expect(cycleMs("run", 2)).toBe(280);
  });
  it("loops used as reactions get a short fixed run; one-shots play once", () => {
    expect(defaultCycles("offer_received")).toBe(1);
    expect(defaultCycles("counteroffer")).toBe(2);
  });
});

describe("animation director", () => {
  it("plays a reaction once per key, then returns to the ambient state", () => {
    let s = run([{ type: "base", state: "negotiating" }, { type: "react", reaction: { key: "a", state: "offer_received" } }]);
    expect(visualState(s)).toBe("offer_received");
    s = run([{ type: "done", key: "a" }], s);
    expect(s.active).toBeNull();
    expect(visualState(s)).toBe("negotiating");
    // The same event replayed to the director (re-render, polling refresh) must not animate again.
    s = run([{ type: "react", reaction: { key: "a", state: "offer_received" } }], s);
    expect(s.active).toBeNull();
    expect(s.queue).toHaveLength(0);
  });

  it("restarts the sprite for a repeated state under a new key", () => {
    let s = run([{ type: "react", reaction: { key: "a", state: "offer_received" } }]);
    const first = s.run;
    s = run([{ type: "done", key: "a" }, { type: "react", reaction: { key: "b", state: "offer_received" } }], s);
    expect(s.run).toBeGreaterThan(first);
  });

  it("lets a higher-priority outcome interrupt, and drops the stale lower-priority queue", () => {
    const s = run([
      { type: "react", reaction: { key: "walk", state: "running" } },
      { type: "react", reaction: { key: "offer", state: "offer_received" } },
      { type: "react", reaction: { key: "win", state: "success" } },
    ]);
    expect(s.active?.key).toBe("win");
    expect(s.queue).toHaveLength(0);
  });

  it("queues equal or lower priority in arrival order", () => {
    let s = run([
      { type: "react", reaction: { key: "reject", state: "reject" } },
      { type: "react", reaction: { key: "offer", state: "offer_received" } },
      { type: "react", reaction: { key: "walk", state: "running" } },
    ]);
    expect(s.active?.key).toBe("reject");
    expect(s.queue.map((q) => q.key)).toEqual(["offer", "walk"]);
    s = run([{ type: "done", key: "reject" }], s);
    expect(s.active?.key).toBe("offer");
    s = run([{ type: "done", key: "offer" }], s);
    expect(s.active?.key).toBe("walk");
    s = run([{ type: "done", key: "walk" }], s);
    expect(s.active).toBeNull();
  });

  it("ignores a completion report from an animation that was already replaced", () => {
    const s = run([
      { type: "react", reaction: { key: "walk", state: "running" } },
      { type: "react", reaction: { key: "win", state: "success" } },
      { type: "done", key: "walk" }, // late animationend of the interrupted walk
    ]);
    expect(s.active?.key).toBe("win");
  });

  it("coalesces identical back-to-back reactions and caps the queue (a burst is never a parade)", () => {
    let s = run([{ type: "react", reaction: { key: "x", state: "reject" } }]);
    s = run(
      ["a", "b", "c", "d", "e", "f"].map((k) => ({ type: "react" as const, reaction: { key: k, state: "offer_received" as const } })),
      s,
    );
    expect(s.queue).toHaveLength(1); // five identical offer_received collapse into one
    const mixed = run(
      [
        { type: "react", reaction: { key: "m0", state: "reject" } },
        { type: "react", reaction: { key: "m1", state: "offer_received" } },
        { type: "react", reaction: { key: "m2", state: "running" } },
        { type: "react", reaction: { key: "m3", state: "counteroffer" } },
        { type: "react", reaction: { key: "m4", state: "surprised" } },
      ],
    );
    expect(mixed.queue.length).toBeLessThanOrEqual(MAX_QUEUE);
  });

  it("is deterministic: the same events give the same outcome", () => {
    const actions: DirectorAction[] = [
      { type: "base", state: "searching" },
      { type: "react", reaction: { key: "1", state: "running" } },
      { type: "react", reaction: { key: "2", state: "offer_received" } },
      { type: "done", key: "1" },
      { type: "react", reaction: { key: "3", state: "discount" } },
    ];
    expect(run(actions)).toEqual(run(actions));
  });

  it("tracks where Agent D stands from the reactions, and reset clears everything", () => {
    let s = run([{ type: "react", reaction: { key: "a", state: "running", sellerId: "orbit" } }]);
    expect(positionOf(s)).toBe("orbit");
    s = run([{ type: "done", key: "a" }], s);
    expect(positionOf(s)).toBe("orbit"); // stays where the last reaction left them
    s = run([{ type: "reset", base: "thinking" }], s);
    expect(positionOf(s)).toBeNull();
    expect(visualState(s)).toBe("thinking");
    expect(s.seen).toHaveLength(0);
  });
});

describe("event -> Agent D mapping", () => {
  it("maps ambient state from the phase the persisted events have reached", () => {
    expect(baseStateForPhase(null)).toBe("thinking");
    expect(baseStateForPhase("initialize")).toBe("thinking");
    expect(baseStateForPhase("discover")).toBe("searching");
    expect(baseStateForPhase("offers")).toBe("searching");
    expect(baseStateForPhase("negotiate")).toBe("negotiating");
    expect(baseStateForPhase("evaluate")).toBe("thinking");
    expect(baseStateForPhase("complete")).toBe("idle");
  });

  it("reacts to the recorded events the product spec lists", () => {
    expect(visualForEvent(ev("AGENT_INITIALIZED", {}, null, "initialize"))).toBe("thinking");
    expect(visualForEvent(ev("SELLER_DISCOVERED", {}, "nova", "discover"))).toBe("running");
    expect(visualForEvent(ev("OFFER_RECEIVED", { initialPriceCents: 100 }, "nova", "offers"))).toBe("offer_received");
    expect(visualForEvent(ev("BUYER_MESSAGE", {}, "nova"))).toBe("counteroffer");
    expect(visualForEvent(ev("OFFER_EVALUATED", { score: 80 }, "nova", "evaluate"))).toBe("thinking");
    expect(visualForEvent(ev("WINNER_SELECTED", { offerId: "o" }, "orbit", "complete"))).toBe("success");
  });

  it("gives the discount reaction only for a recorded price drop", () => {
    const drop = ev("COUNTEROFFER_RECEIVED", { previousPriceCents: 28_000, newPriceCents: 26_000 }, "nova");
    const held = ev("COUNTEROFFER_RECEIVED", { previousPriceCents: 28_000, newPriceCents: 28_000, held: true }, "nova");
    const heldFlag = ev("COUNTEROFFER_RECEIVED", { previousPriceCents: 28_000, newPriceCents: 26_000, held: true }, "nova");
    const missing = ev("COUNTEROFFER_RECEIVED", {}, "nova");
    expect(cueForEvent(drop).reaction?.state).toBe("discount");
    expect(cueForEvent(held).reaction?.state).toBe("offer_received");
    expect(cueForEvent(heldFlag).reaction?.state).toBe("offer_received");
    expect(cueForEvent(missing).reaction?.state).toBe("offer_received");
  });

  it("treats a set-aside offer as a server verdict, with the right reaction per reason", () => {
    expect(cueForEvent(ev("SELLER_REJECTED", { reasonCode: "over_budget" }, "vertex", "evaluate")).reaction?.state).toBe("reject");
    expect(cueForEvent(ev("SELLER_REJECTED", { reasonCode: "invalid_policy" }, "vertex", "evaluate")).reaction?.state).toBe("reject");
    expect(cueForEvent(ev("SELLER_REJECTED", { reasonCode: "out_of_stock" }, "vertex", "offers")).reaction?.state).toBe("surprised");
    // During evaluation Agent D stays at the comparison spot instead of running to the store.
    expect(cueForEvent(ev("SELLER_REJECTED", { reasonCode: "over_budget" }, "vertex", "evaluate")).walkTo).toBe("center");
  });

  it("shows fallbacks and server validation as informational indicators, never as a facial reaction", () => {
    const fb = cueForEvent(ev("AGENT_FALLBACK", { agent: "orbit", reason: "invalid", source: "rules_fallback" }, "orbit"));
    expect(fb.reaction).toBeNull();
    expect(fb.indicator?.kind).toBe("fallback");
    const val = cueForEvent(ev("OFFER_REJECTED_BY_SERVER", { reasons: ["price_below_floor"] }, "nova"));
    expect(val.reaction).toBeNull();
    expect(val.indicator?.kind).toBe("validation");
  });

  it("never maps accept or payment_approved from any negotiation event", () => {
    const types: EventType[] = [
      "AGENT_INITIALIZED", "SELLER_DISCOVERED", "OFFER_RECEIVED", "BUYER_MESSAGE", "COUNTEROFFER_RECEIVED", "REQUIREMENT_VERIFIED",
      "SELLER_REJECTED", "OFFER_EVALUATED", "WINNER_SELECTED", "NEGOTIATION_COMPLETE", "BUYER_DECISION", "AGENT_FALLBACK", "OFFER_REJECTED_BY_SERVER",
    ];
    for (const t of types) {
      const state = cueForEvent(ev(t, { previousPriceCents: 2, newPriceCents: 1, reasonCode: "over_budget" }, "nova")).reaction?.state;
      expect(state).not.toBe("accept");
      expect(state).not.toBe("payment_approved");
    }
  });

  it("does not celebrate when the negotiation ends without an offer", () => {
    expect(cueForEvent(ev("NEGOTIATION_COMPLETE", { outcome: "no_offer_within_budget" }, null, "complete")).reaction?.state).toBe("reject");
    expect(cueForEvent(ev("NEGOTIATION_COMPLETE", { recommendedOfferId: "o", outcome: "ok" }, null, "complete")).reaction).toBeNull();
  });

  it("walks to a different store first, but not when already there", () => {
    const cue = cueForEvent(ev("OFFER_RECEIVED", { initialPriceCents: 1 }, "prism", "offers"));
    const moving = reactionsForCue(cue, "nova");
    expect(moving.map((r) => r.state)).toEqual(["running", "offer_received"]);
    expect(moving[0].cycles).toBe(WALK_CYCLES);
    expect(reactionsForCue(cue, "prism").map((r) => r.state)).toEqual(["offer_received"]);
    // A discovery already is the walk; it must not walk twice.
    const disc = cueForEvent(ev("SELLER_DISCOVERED", {}, "prism", "discover"));
    expect(reactionsForCue(disc, "nova").map((r) => r.state)).toEqual(["running"]);
  });
});

describe("reactions that come from endpoints, not events", () => {
  it("accept requires the approval response to name the approved offer", () => {
    expect(cueForApproval({ approvedOfferId: "off_1" }, "off_1")?.state).toBe("accept");
    expect(cueForApproval({ approvedOfferId: "off_2" }, "off_1")).toBeNull();
    expect(cueForApproval(null, "off_1")).toBeNull();
    expect(cueForApproval({}, "off_1")).toBeNull();
  });
  it("payment_approved requires a payment record that says completed", () => {
    expect(cueForPayment({ status: "completed", orderId: "ORD" })?.state).toBe("payment_approved");
    for (const status of ["approval_pending", "approved", "capturing", "created", "unknown_pending_reconciliation", "failed", "cancelled", undefined]) {
      expect(cueForPayment({ status })).toBeNull();
    }
    expect(cueForPayment(null)).toBeNull();
  });
});

import { choreoReducer, initialChoreo, type ChoreoState } from "@/lib/v3/mascot/choreography";

describe("choreography (visible events -> director)", () => {
  const seq = (...events: NegotiationEvent[]) => events;
  const discover = (id: SellerId) => ev("SELLER_DISCOVERED", {}, id, "discover");

  it("turns only newly visible events into reactions, in order", () => {
    const e1 = ev("AGENT_INITIALIZED", {}, null, "initialize");
    const e2 = discover("nova");
    let s: ChoreoState = initialChoreo();
    s = choreoReducer(s, { type: "sync", events: seq(e1) });
    expect(s.director.active).toBeNull();
    expect(s.director.base).toBe("thinking");
    s = choreoReducer(s, { type: "sync", events: seq(e1, e2) });
    expect(s.director.active?.state).toBe("running");
    expect(s.director.active?.sellerId).toBe("nova");
    expect(s.director.base).toBe("searching");
    // The same list again changes nothing (polling refresh with no new event).
    expect(choreoReducer(s, { type: "sync", events: seq(e1, e2) })).toBe(s);
  });

  it("queues a batch of simultaneous events deterministically", () => {
    const batch = seq(discover("nova"), discover("orbit"), discover("prism"), discover("vertex"));
    const a = choreoReducer(initialChoreo(), { type: "sync", events: batch });
    const b = choreoReducer(initialChoreo(), { type: "sync", events: batch });
    expect(a).toEqual(b);
    expect(a.director.queue.length).toBeLessThanOrEqual(MAX_QUEUE);
    expect(a.processed).toBe(4);
  });

  it("treats a shorter list as a restarted replay and clears history", () => {
    const e1 = ev("AGENT_INITIALIZED", {}, null, "initialize");
    const e2 = discover("nova");
    let s = choreoReducer(initialChoreo(), { type: "sync", events: seq(e1, e2) });
    s = choreoReducer(s, { type: "sync", events: [] });
    expect(s.processed).toBe(0);
    expect(s.director.active).toBeNull();
    expect(s.director.seen).toHaveLength(0);
    // After the restart the very same events react again.
    s = choreoReducer(s, { type: "sync", events: seq(e1, e2) });
    expect(s.director.active?.state).toBe("running");
  });

  it("hydrates an already-running session without replaying its history", () => {
    const events = seq(ev("AGENT_INITIALIZED", {}, null, "initialize"), discover("nova"), ev("OFFER_RECEIVED", { initialPriceCents: 1 }, "nova", "offers"));
    let s = choreoReducer(initialChoreo(), { type: "hydrate", events });
    expect(s.director.active).toBeNull();
    expect(s.director.base).toBe("searching");
    const next = ev("BUYER_MESSAGE", {}, "nova", "negotiate");
    s = choreoReducer(s, { type: "sync", events: [...events, next] });
    expect(s.director.active?.state).toBe("counteroffer");
    expect(s.director.base).toBe("negotiating");
  });

  it("surfaces fallback and validation as an indicator while leaving the mascot's mood alone", () => {
    const e = ev("OFFER_REJECTED_BY_SERVER", { reasons: ["price_below_floor"] }, "nova");
    const s = choreoReducer(initialChoreo(), { type: "sync", events: seq(e) });
    expect(s.indicator?.indicator.kind).toBe("validation");
    expect(s.director.active).toBeNull();
    expect(choreoReducer(s, { type: "clear_indicator" }).indicator).toBeNull();
  });

  it("ends in a calm idle once the recommendation is ready, after celebrating the outcome", () => {
    const events = seq(
      ev("WINNER_SELECTED", { offerId: "o" }, "orbit", "complete"),
      ev("NEGOTIATION_COMPLETE", { recommendedOfferId: "o", outcome: "ok" }, null, "complete"),
    );
    let s = choreoReducer(initialChoreo(), { type: "sync", events });
    expect(s.director.base).toBe("idle");
    expect(s.director.active?.state).toBe("success"); // interrupted the walk to the winner
    s = choreoReducer(s, { type: "done", key: s.director.active!.key });
    expect(visualState(s.director)).toBe("idle");
  });
});
