import { describe, expect, it } from "vitest";
import type { SellerState } from "@/lib/negotiation-view";
import { PHASES, PHASE_STATUS, currentPhase, isFinished, phaseSteps } from "@/lib/v3/phase";
import { SPOT_X, spotX, stallPresentation, walkingLeft } from "@/lib/v3/stage";
import { activityForEvent, currentStatusLine, deriveActivity, sourceLabel } from "@/lib/v3/activity";
import { directorReducer, initialDirector } from "@/lib/v3/mascot/director";
import type { EventPhase, EventType, NegotiationEvent, SellerId } from "@/shared/contracts/types";

let n = 0;
function ev(type: EventType, payload: Record<string, unknown> = {}, sellerId: SellerId | null = null, phase: EventPhase = "negotiate"): NegotiationEvent {
  n++;
  return { eventId: `e${n}`, sessionId: "s", sequence: n, atMs: n * 100, phase, type, sellerId, payload, feedText: type };
}
const seller = (patch: Partial<SellerState>): SellerState =>
  ({ id: "nova", brand: "Brisa Outlet", tagline: "", discovered: true, status: "waiting", priceCents: null, previousCents: null, openingCents: null, message: null, source: null, awaitingReply: false, rejectedReason: null, score: null, winner: false, offer: null, history: [], ...patch }) as SellerState;

describe("progress rail", () => {
  it("never runs ahead of the phase of the latest visible event", () => {
    expect(currentPhase([])).toBeNull();
    expect(phaseSteps([], false).every((s) => s.state === "todo")).toBe(true);
    const steps = phaseSteps([ev("SELLER_DISCOVERED", {}, "nova", "discover")], false);
    expect(steps.map((s) => s.state)).toEqual(["done", "current", "todo", "todo", "todo", "todo"]);
  });
  it("completes only when the run is over", () => {
    expect(phaseSteps([ev("OFFER_RECEIVED", {}, "nova", "offers")], true).every((s) => s.state === "done")).toBe(true);
    expect(PHASES).toHaveLength(6);
  });
  it("decides 'finished' per engine: the server for live runs, the clock for replays", () => {
    expect(isFinished({ status: "negotiating", mode: "multi_agent" }, 99_999, 10)).toBe(false);
    expect(isFinished({ status: "ready", mode: "multi_agent" }, 0, 10)).toBe(true);
    expect(isFinished({ status: "failed", mode: "multi_agent" }, 0, 10)).toBe(true);
    expect(isFinished({ status: "ready", mode: "v0_rules" }, 5, 10)).toBe(false);
    expect(isFinished({ status: "ready", mode: "v0_rules" }, 10, 10)).toBe(true);
    expect(isFinished({ status: "ready" }, 10, 10)).toBe(true); // sessions from before phase 2 are replays
  });
});

describe("stage geometry", () => {
  it("places the four stores in order and the comparison spot in the middle", () => {
    expect(SPOT_X.nova).toBeLessThan(SPOT_X.orbit);
    expect(SPOT_X.orbit).toBeLessThan(SPOT_X.center);
    expect(SPOT_X.center).toBeLessThan(SPOT_X.prism);
    expect(SPOT_X.prism).toBeLessThan(SPOT_X.vertex);
    expect(spotX(null)).toBe(SPOT_X.center);
    expect(spotX("not-a-store")).toBe(SPOT_X.center);
  });
  it("mirrors the sprite only while running to the left", () => {
    let d = directorReducer(initialDirector(), { type: "react", reaction: { key: "a", state: "running", sellerId: "vertex" } });
    expect(walkingLeft(d)).toBe(false); // center -> vertex goes right
    d = directorReducer(directorReducer(d, { type: "done", key: "a" }), { type: "react", reaction: { key: "b", state: "running", sellerId: "nova" } });
    expect(walkingLeft(d)).toBe(true); // vertex -> nova goes left
    d = directorReducer(d, { type: "done", key: "b" });
    expect(walkingLeft(d)).toBe(false); // not running
  });
});

describe("store cards", () => {
  it("states plainly what is recorded, and only that", () => {
    expect(stallPresentation(seller({ status: "waiting" })).label).toBe("Not found yet");
    expect(stallPresentation(seller({ status: "offered", priceCents: 100 })).label).toBe("Offer received");
    expect(stallPresentation(seller({ status: "countered", priceCents: 90, previousCents: 100 }))).toEqual({ label: "Price lowered", tone: "success" });
    expect(stallPresentation(seller({ status: "countered", priceCents: 100, previousCents: null })).label).toBe("Replied");
    expect(stallPresentation(seller({ status: "set_aside" })).tone).toBe("warn");
    expect(stallPresentation(seller({ status: "winner" })).label).toBe("Best match");
    expect(stallPresentation(seller({ status: "asked", awaitingReply: true })).label).toBe("Replying…");
  });
});

describe("activity phrases", () => {
  it("quotes only what the payload contains", () => {
    expect(activityForEvent(ev("OFFER_RECEIVED", { initialPriceCents: 27_122 }, "nova", "offers"))!.text).toBe("Brisa Outlet opened at €271.22.");
    expect(activityForEvent(ev("COUNTEROFFER_RECEIVED", { previousPriceCents: 28_000, newPriceCents: 26_000 }, "orbit"))!.text).toBe("Zefiro Express has replied: €260.00, down from €280.00.");
    expect(activityForEvent(ev("COUNTEROFFER_RECEIVED", { previousPriceCents: 28_000, newPriceCents: 28_000, held: true }, "orbit"))!.text).toBe("Zefiro Express has replied and kept €280.00.");
    expect(activityForEvent(ev("COUNTEROFFER_RECEIVED", {}, "orbit"))!.text).toBe("Zefiro Express has replied.");
    expect(activityForEvent(ev("OFFER_RECEIVED", {}, "nova", "offers"))!.text).toBe("Brisa Outlet sent its opening offer.");
    expect(activityForEvent(ev("SELLER_REJECTED", { reasonCode: "over_budget" }, "vertex", "evaluate"))!.text).toBe("Set Korvan Direct aside: over your budget.");
  });
  it("labels where a reply came from", () => {
    expect(activityForEvent(ev("OFFER_RECEIVED", { source: "gemini" }, "nova"))!.source).toBe("ai");
    expect(activityForEvent(ev("OFFER_RECEIVED", { source: "rules_fallback" }, "nova"))!.source).toBe("fallback");
    expect(activityForEvent(ev("OFFER_RECEIVED", {}, "nova"))!.source).toBeNull();
    expect(sourceLabel(ev("OFFER_RECEIVED", { source: "gemini" }, "nova"))).toBe("AI reply");
    expect(sourceLabel(ev("OFFER_RECEIVED", { source: "rules_fallback" }, "nova"))).toBe("Rules fallback");
  });
  it("says nothing about events that have not been recorded", () => {
    expect(deriveActivity([])).toEqual([]);
    expect(currentStatusLine([]).text).toMatch(/Opening the mission/);
  });
  it("describes a recorded waiting state, then the newest event, then the phase", () => {
    const e = ev("OFFER_RECEIVED", { initialPriceCents: 10_000 }, "nova", "offers");
    expect(currentStatusLine([e], { awaiting: [{ brand: "Zefiro Express" }] }).text).toBe("Waiting for Zefiro Express to reply.");
    expect(currentStatusLine([e]).text).toBe("Brisa Outlet opened at €100.00.");
    const done = ev("NEGOTIATION_COMPLETE", { outcome: "ok" }, null, "complete");
    expect(currentStatusLine([e, done]).text).toBe(PHASE_STATUS.complete);
    expect(currentStatusLine([e, done]).tone).toBe("good");
  });
});
