import type { EventPhase, EventType, NegotiationEvent, NegotiationSession, Offer, SellerId } from "@/shared/contracts/types";
import { getSession, saveSession, withLock } from "@/server/db/store";

export interface EventInput {
  /** Stable key for this logical event within the session. Re-recording the same key is a no-op. */
  key: string;
  phase: EventPhase;
  type: EventType;
  sellerId: SellerId | null;
  payload: Record<string, unknown>;
  feedText: string;
}

/**
 * Persists real negotiation events as they happen. Every write is a read-modify-write under the
 * per-session lock, so parallel seller agents, a concurrent approval or a retried request can never
 * lose or duplicate an event or overwrite another field.
 */
export class EventRecorder {
  constructor(
    readonly sessionId: string,
    private readonly startedAtMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Appends an event (idempotent by key) and optionally upserts an offer in the same atomic write. */
  async record(input: EventInput, offer?: Offer): Promise<boolean> {
    return withLock(`session:${this.sessionId}`, async () => {
      const s = await getSession(this.sessionId);
      if (!s) throw new Error("session_missing");
      const eventId = `evt_${this.sessionId.replace(/^ses_/, "")}_${input.key}`;
      if (s.events.some((e) => e.eventId === eventId)) return false;
      const event: NegotiationEvent = {
        eventId,
        sessionId: this.sessionId,
        sequence: s.events.length,
        atMs: Math.max(0, this.now() - this.startedAtMs),
        phase: input.phase,
        type: input.type,
        sellerId: input.sellerId,
        payload: input.payload,
        feedText: input.feedText,
      };
      s.events.push(event);
      if (offer) {
        const idx = s.offers.findIndex((o) => o.offerId === offer.offerId);
        if (idx >= 0) s.offers[idx] = offer;
        else s.offers.push(offer);
      }
      await saveSession(s);
      return true;
    });
  }

  /** Applies a change to the session under the same lock. */
  async update(mutator: (s: NegotiationSession) => void): Promise<NegotiationSession> {
    return withLock(`session:${this.sessionId}`, async () => {
      const s = await getSession(this.sessionId);
      if (!s) throw new Error("session_missing");
      mutator(s);
      await saveSession(s);
      return s;
    });
  }
}
