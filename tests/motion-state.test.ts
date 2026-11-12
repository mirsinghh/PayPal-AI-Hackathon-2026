import { describe, expect, it } from "vitest";
import { activePulses, agentActivity } from "@/lib/negotiation-view";
import { duration } from "@/lib/motion";
import type { NegotiationEvent } from "@/shared/contracts/types";

const ev = (over: Partial<NegotiationEvent>): NegotiationEvent => ({
  eventId: "e",
  sessionId: "s",
  sequence: 0,
  atMs: 1000,
  phase: "negotiate",
  type: "BUYER_MESSAGE",
  sellerId: "nova",
  payload: {},
  feedText: "",
  ...over,
});

describe("agent activity (drives the buyer node's data-speaker)", () => {
  it("is idle when no recorded event is travelling", () => {
    expect(agentActivity([])).toEqual({ state: "idle", sellerId: null });
  });

  it("asking while a buyer message travels, receiving while an offer travels", () => {
    const ask = ev({ eventId: "a", type: "BUYER_MESSAGE", sellerId: "orbit", atMs: 1000 });
    const offer = ev({ eventId: "b", type: "COUNTEROFFER_RECEIVED", sellerId: "prism", atMs: 1200 });
    expect(agentActivity(activePulses([ask], 1100, 900))).toEqual({ state: "asking", sellerId: "orbit" });
    expect(agentActivity(activePulses([ask, offer], 1300, 900))).toEqual({ state: "receiving", sellerId: "prism" });
  });

  it("returns to idle once the marker has finished travelling", () => {
    const ask = ev({ type: "BUYER_MESSAGE", atMs: 1000 });
    expect(agentActivity(activePulses([ask], 1000 + duration.pulse * 1000 + 1, duration.pulse * 1000)).state).toBe("idle");
  });
});

describe("motion tokens", () => {
  it("keep the three-duration system from the skill", () => {
    expect([duration.micro, duration.state, duration.enter]).toEqual([0.18, 0.32, 0.6]);
    // narrative movement stays in the 700-1000 ms family
    expect(duration.pulse).toBeGreaterThanOrEqual(0.7);
    expect(duration.pulse).toBeLessThanOrEqual(1);
  });
});
