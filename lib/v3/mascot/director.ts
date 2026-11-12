import { REACTION_PRIORITY, defaultCycles, type AgentDVisualState } from "./manifest";

/**
 * Pure state machine that decides what Agent D shows. No React, no timers: the renderer reports when a one-shot
 * finished (`done`) and the director answers with the next thing to show. That makes the rules testable and the
 * outcome deterministic however many events arrive at once.
 *
 *  - `base`      the ambient loop that fits the current phase (searching, negotiating...). Always playing underneath.
 *  - `reaction`  a short, event-keyed animation on top (offer received, discount...). Plays at most once per key.
 *  - Priority    a higher-priority reaction interrupts the active one; equal or lower ones wait in a short FIFO queue.
 *  - Coalescing  back-to-back identical reactions collapse, and the queue is capped, so a burst never turns into a
 *                parade of animations that lags behind the data. The data itself is never delayed by the mascot.
 */
export interface Reaction {
  /** Stable identity, normally the event id. The same key is never played twice. */
  key: string;
  state: AgentDVisualState;
  priority: number;
  /** Passes through the sprite before the reaction ends (may be fractional, e.g. a walk of 1.25 passes). */
  cycles: number;
  /** Store Agent D should stand at while this reaction plays. */
  sellerId?: string | null;
}

export type ReactionInput = Pick<Reaction, "key" | "state"> & Partial<Pick<Reaction, "priority" | "cycles" | "sellerId">>;

export interface DirectorState {
  base: AgentDVisualState;
  active: Reaction | null;
  /** Bumps whenever a new animation starts, so the renderer restarts the sprite even for the same state twice. */
  run: number;
  queue: Reaction[];
  /** Keys already accepted (played, playing or queued). */
  seen: string[];
  /** Last spot a reaction placed Agent D at. */
  lastSellerId: string | null;
  /** The spot before that one (lets the stage face Agent D the way they are walking). */
  fromSellerId: string | null;
}

export type DirectorAction =
  | { type: "base"; state: AgentDVisualState }
  | { type: "react"; reaction: ReactionInput }
  | { type: "done"; key: string }
  | { type: "reset"; base?: AgentDVisualState };

export const MAX_QUEUE = 3;
const MAX_SEEN = 400;

export const initialDirector = (base: AgentDVisualState = "idle"): DirectorState => ({
  base,
  active: null,
  run: 0,
  queue: [],
  seen: [],
  lastSellerId: null,
  fromSellerId: null,
});

/** What the sprite should be playing right now. */
export const visualState = (s: DirectorState): AgentDVisualState => s.active?.state ?? s.base;

/** Where Agent D stands: wherever the active reaction says, otherwise where the last one left them. */
export const positionOf = (s: DirectorState): string | null => s.active?.sellerId ?? s.lastSellerId;

function normalise(input: ReactionInput): Reaction {
  return {
    key: input.key,
    state: input.state,
    priority: input.priority ?? REACTION_PRIORITY[input.state],
    cycles: input.cycles ?? defaultCycles(input.state),
    sellerId: input.sellerId ?? null,
  };
}

function start(s: DirectorState, r: Reaction): DirectorState {
  const moved = !!r.sellerId && r.sellerId !== s.lastSellerId;
  return { ...s, active: r, run: s.run + 1, lastSellerId: r.sellerId ?? s.lastSellerId, fromSellerId: moved ? s.lastSellerId : s.fromSellerId };
}

function enqueue(queue: Reaction[], r: Reaction): Reaction[] {
  const last = queue.at(-1);
  // Coalesce: another identical reaction right behind itself adds nothing but delay.
  if (last && last.state === r.state && last.sellerId === r.sellerId && last.priority === r.priority) return queue;
  const next = [...queue, r];
  while (next.length > MAX_QUEUE) {
    // Drop the oldest of the lowest-priority entries; outcomes are the last thing to be discarded.
    const lowest = Math.min(...next.map((x) => x.priority));
    next.splice(next.findIndex((x) => x.priority === lowest), 1);
  }
  return next;
}

export function directorReducer(s: DirectorState, a: DirectorAction): DirectorState {
  switch (a.type) {
    case "base":
      return s.base === a.state ? s : { ...s, base: a.state };

    case "react": {
      const r = normalise(a.reaction);
      if (s.seen.includes(r.key)) return s; // one-shot per key, even if the same event is replayed to us
      const seen = [...s.seen, r.key].slice(-MAX_SEEN);
      const withSeen = { ...s, seen };
      if (!withSeen.active) return start(withSeen, r);
      if (r.priority > withSeen.active.priority) {
        // Interrupt. Waiting reactions of lower rank are now stale news; equal/higher ones keep their turn.
        return start({ ...withSeen, queue: withSeen.queue.filter((q) => q.priority >= r.priority) }, r);
      }
      return { ...withSeen, queue: enqueue(withSeen.queue, r) };
    }

    case "done": {
      // Ignore a completion report from an animation that was already replaced (stale animationend).
      if (!s.active || s.active.key !== a.key) return s;
      const [next, ...rest] = s.queue;
      if (next) return start({ ...s, queue: rest }, next);
      return { ...s, active: null };
    }

    case "reset":
      return initialDirector(a.base ?? s.base);
  }
}
