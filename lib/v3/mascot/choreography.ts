import type { NegotiationEvent } from "@/shared/contracts/types";
import { baseStateForPhase, cueForEvent, reactionsForCue, type Indicator } from "./event-map";
import { directorReducer, initialDirector, positionOf, type DirectorState } from "./director";

/**
 * Keeps Agent D in step with the persisted event list a screen is allowed to show.
 *
 * The screen hands over `visible` (replay: events up to the clock; live: whatever the server has stored). The
 * choreography only ever *reads* it: new events become reactions, a shorter or different list means a replay
 * restarted. Pure and synchronous, so it can run as a reducer and be tested without a browser.
 */
export interface ChoreoState {
  director: DirectorState;
  /** How many of the visible events have been handled. */
  processed: number;
  firstEventId: string | null;
  /** Latest informational chip (AI fallback / server validation), keyed by its event. */
  indicator: { key: string; indicator: Indicator } | null;
}

export type ChoreoAction =
  | { type: "sync"; events: readonly NegotiationEvent[] }
  /** Opening a screen that already has events: show the right ambient state without replaying history. */
  | { type: "hydrate"; events: readonly NegotiationEvent[] }
  | { type: "done"; key: string }
  | { type: "clear_indicator" };

export const initialChoreo = (): ChoreoState => ({
  director: initialDirector(baseStateForPhase(null)),
  processed: 0,
  firstEventId: null,
  indicator: null,
});

const phaseBase = (events: readonly NegotiationEvent[]) => baseStateForPhase(events.at(-1)?.phase ?? null);

export function choreoReducer(s: ChoreoState, a: ChoreoAction): ChoreoState {
  switch (a.type) {
    case "done":
      return { ...s, director: directorReducer(s.director, { type: "done", key: a.key }) };

    case "clear_indicator":
      return s.indicator ? { ...s, indicator: null } : s;

    case "hydrate": {
      // Mark history as seen so a later sync can never replay it.
      // Agent D is wherever the last spot-bearing event put them, so the next event does not trigger a phantom walk.
      const spot = [...a.events].reverse().map((e) => cueForEvent(e).walkTo).find((w) => w !== null) ?? null;
      const director = { ...initialDirector(phaseBase(a.events)), seen: a.events.map((e) => e.eventId), lastSellerId: spot };
      return { director, processed: a.events.length, firstEventId: a.events[0]?.eventId ?? null, indicator: null };
    }

    case "sync": {
      const events = a.events;
      const first = events[0]?.eventId ?? null;
      const restarted = events.length < s.processed || (s.firstEventId !== null && first !== s.firstEventId);
      if (restarted) {
        // A replay started over (or the list was swapped): begin from a clean director, then handle what is visible.
        return choreoReducer({ ...initialChoreo() }, { type: "sync", events });
      }
      if (events.length === s.processed) return s;

      let director = s.director;
      let indicator = s.indicator;
      for (const e of events.slice(s.processed)) {
        const cue = cueForEvent(e);
        for (const reaction of reactionsForCue(cue, positionOf(director))) director = directorReducer(director, { type: "react", reaction });
        if (cue.indicator) indicator = { key: cue.key, indicator: cue.indicator };
      }
      director = directorReducer(director, { type: "base", state: phaseBase(events) });
      return { director, processed: events.length, firstEventId: first, indicator };
    }
  }
}
