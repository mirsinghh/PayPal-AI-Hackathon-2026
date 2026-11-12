/**
 * Agent D sprite catalogue (V3). Mirrors AgentD_V3_HQ_Animaciones/manifest.json; tests/v3-assets.test.ts fails if the
 * two ever drift or if a referenced file is missing from public/agent-d/v3/.
 *
 * Two vocabularies on purpose:
 *  - SpriteName       what the art pack calls each animation (file names).
 *  - AgentDVisualState what the product means ("negotiating", not "talk"). Everything outside this folder speaks the
 *                      second one, so the pack can be swapped without touching a single screen.
 */
export const SPRITE_NAMES = [
  "idle",
  "search",
  "thinking",
  "talk",
  "run",
  "offer_received",
  "counteroffer",
  "reject",
  "accept",
  "success",
  "jump",
  "discount",
  "surprised",
  "payment_approved",
] as const;
export type SpriteName = (typeof SPRITE_NAMES)[number];

export interface SpriteSpec {
  frames: number;
  /** Time each frame is on screen, as designed in the pack (70-100 ms). Not accelerated uniformly. */
  frameMs: number;
  /** How the pack intends it to play: loops are ambient, once are reactions. */
  playback: "loop" | "once";
  label: string;
}

export const FRAME_SIZE = 512;

export const SPRITES: Record<SpriteName, SpriteSpec> = {
  idle: { frames: 8, frameMs: 90, playback: "loop", label: "Resting" },
  run: { frames: 8, frameMs: 70, playback: "loop", label: "Running to a store" },
  search: { frames: 8, frameMs: 80, playback: "loop", label: "Looking for offers" },
  thinking: { frames: 8, frameMs: 100, playback: "loop", label: "Thinking" },
  talk: { frames: 8, frameMs: 80, playback: "loop", label: "Negotiating" },
  success: { frames: 8, frameMs: 80, playback: "once", label: "Found the best offer" },
  jump: { frames: 8, frameMs: 80, playback: "once", label: "Celebrating" },
  discount: { frames: 8, frameMs: 80, playback: "once", label: "Got a lower price" },
  accept: { frames: 8, frameMs: 80, playback: "once", label: "Offer approved" },
  reject: { frames: 8, frameMs: 75, playback: "once", label: "Offer set aside" },
  counteroffer: { frames: 8, frameMs: 75, playback: "loop", label: "Sending a counteroffer" },
  offer_received: { frames: 8, frameMs: 80, playback: "once", label: "Reply received" },
  surprised: { frames: 8, frameMs: 70, playback: "once", label: "Surprised" },
  payment_approved: { frames: 8, frameMs: 80, playback: "once", label: "Payment confirmed" },
};

/** Product-level states. The first group is ambient (loops while a phase lasts); the rest are reactions. */
export const VISUAL_STATES = [
  "idle",
  "searching",
  "thinking",
  "negotiating",
  "running",
  "jumping",
  "success",
  "discount",
  "accept",
  "reject",
  "counteroffer",
  "offer_received",
  "surprised",
  "payment_approved",
] as const;
export type AgentDVisualState = (typeof VISUAL_STATES)[number];

export const VISUAL_TO_SPRITE: Record<AgentDVisualState, SpriteName> = {
  idle: "idle",
  searching: "search",
  thinking: "thinking",
  negotiating: "talk",
  running: "run",
  jumping: "jump",
  success: "success",
  discount: "discount",
  accept: "accept",
  reject: "reject",
  counteroffer: "counteroffer",
  offer_received: "offer_received",
  surprised: "surprised",
  payment_approved: "payment_approved",
};

export const spriteOf = (s: AgentDVisualState): SpriteName => VISUAL_TO_SPRITE[s];

export const AGENT_D_ASSET_BASE = "/agent-d/v3";
export const sheetUrl = (sprite: SpriteName): string => `${AGENT_D_ASSET_BASE}/sheets/${sprite}.webp`;
export const poseUrl = (sprite: SpriteName): string => `${AGENT_D_ASSET_BASE}/poses/${sprite}.webp`;

/** One full pass through the sheet, in ms, at the given speed multiplier. */
export const cycleMs = (sprite: SpriteName, speed = 1): number => (SPRITES[sprite].frames * SPRITES[sprite].frameMs) / Math.max(speed, 0.1);

/** Plain-language caption for a state (used as the accessible name and by the activity panel). */
export const stateLabel = (s: AgentDVisualState): string => SPRITES[spriteOf(s)].label;

/**
 * Reactions outrank each other so simultaneous events resolve the same way every time.
 * 0 = ambient (never queued as a reaction), 1 = transient, 2 = meaningful, 3 = outcome, 4 = confirmed by an endpoint.
 */
export const REACTION_PRIORITY: Record<AgentDVisualState, 0 | 1 | 2 | 3 | 4> = {
  idle: 0,
  searching: 0,
  thinking: 0,
  negotiating: 0,
  running: 1,
  counteroffer: 1,
  offer_received: 1,
  jumping: 1,
  surprised: 2,
  reject: 2,
  discount: 2,
  success: 3,
  accept: 4,
  payment_approved: 4,
};

/** How many passes a reaction plays. Looping sprites used as reactions get a fixed, short run instead of forever. */
export function defaultCycles(state: AgentDVisualState): number {
  const sprite = spriteOf(state);
  return SPRITES[sprite].playback === "once" ? 1 : 2;
}
