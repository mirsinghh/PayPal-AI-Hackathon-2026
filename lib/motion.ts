import type { Transition, Variants } from "motion/react";

/**
 * Motion tokens, mirrored from app/globals.css (--ease, --d1/--d2/--d3). See AgentDeal_DOCS/SKILL.md.
 *
 * One curve and three durations for the whole web. Outside them there are only:
 *  - narrative movement tied to a recorded event (the message markers in the negotiation graph), and
 *  - ambient loops (CSS only, paused off screen).
 * Server state always wins over transitions: nothing here delays data, it only animates what is already true.
 */
export const EASE = [0.22, 1, 0.36, 1] as const;
/** Back-and-forth paths and long loops only. */
export const EASE_IO = [0.65, 0, 0.35, 1] as const;

export const duration = {
  /** d1: hover, colour, press. */
  micro: 0.18,
  /** d2: open/close, panel and route changes. */
  state: 0.32,
  /** d3: entries and appearing blocks. */
  enter: 0.6,
  /** Narrative (700-1000 ms): a marker travelling along one edge of the negotiation graph. */
  pulse: 0.9,
} as const;

/**
 * Springs are used only where Motion measures layout (reorders, the sliding selector pill, list items),
 * where a fixed curve cannot know the distance. Everything else uses EASE + duration.
 */
export const spring = {
  /** Snappy, no overshoot: selection, layout reorder. */
  snappy: { type: "spring", stiffness: 520, damping: 40, mass: 0.8 } satisfies Transition,
  /** Slightly softer: panels and cards appearing. */
  soft: { type: "spring", stiffness: 320, damping: 34, mass: 0.9 } satisfies Transition,
  /** The one place with a hint of bounce: the payment confirmation mark. */
  pop: { type: "spring", stiffness: 420, damping: 22, mass: 0.8 } satisfies Transition,
} as const;

export const ease = (seconds: number): Transition => ({ duration: seconds, ease: EASE });

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: ease(duration.state) },
};
