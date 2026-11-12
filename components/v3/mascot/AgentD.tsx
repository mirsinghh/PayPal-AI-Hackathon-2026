"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useInView, usePageVisible, useReducedMotionPref } from "@/lib/use-motion-env";
import { visualState, type DirectorState } from "@/lib/v3/mascot/director";
import { SPRITES, cycleMs, poseUrl, sheetUrl, spriteOf, stateLabel, type AgentDVisualState, type SpriteName } from "@/lib/v3/mascot/manifest";

export interface AgentDProps {
  /** What Agent D is doing, in product terms. */
  state: AgentDVisualState;
  /** CSS pixels (number) or any CSS length. The frame is always square, so the character never changes size between states. */
  size?: number | string;
  /** 1 = the pack's own cadence. Only change for a reason (e.g. a deliberate slow-down), never to "speed up" everything. */
  speed?: number;
  /** Passes through the sheet. Omit for the sprite's natural behaviour: loops repeat, one-shots play once. */
  cycles?: number | "infinite";
  /** Changing this restarts the animation even if `state` is the same (a new reaction of the same kind). */
  runKey?: string | number;
  /** Fires once when a finite animation has played its passes. Never fires for endless loops. */
  onComplete?: () => void;
  /** Accessible name. `null` marks the sprite as purely decorative (e.g. when a caption already says it). */
  label?: string | null;
  paused?: boolean;
  /** Mirror horizontally (Agent D running to the left). */
  flip?: boolean;
  /** Load this sheet with high priority (above the fold). */
  priority?: boolean;
  className?: string;
}

/**
 * Agent D. A controlled, reusable sprite: give it a state and it plays it, anywhere in the product.
 *
 *  - Plays the pack's spritesheet with a pure-CSS stepped transform (no per-frame React work).
 *  - Pauses when the tab is hidden or the sprite is off screen.
 *  - `prefers-reduced-motion`: shows the state's static pose instead (and still reports completion, so callers that
 *    wait for `onComplete` never get stuck).
 * Use <AgentDActor> when a director (events/reactions) drives it.
 */
export function AgentD({ state, size = 160, speed = 1, cycles, runKey = 0, onComplete, label, paused = false, flip = false, priority = false, className = "" }: AgentDProps) {
  const targetSprite = spriteOf(state);
  const reduced = useReducedMotionPref();
  const visible = usePageVisible();
  const box = useRef<HTMLSpanElement>(null);
  const inView = useInView(box, "120px");
  const targetIter = cycles ?? (SPRITES[targetSprite].playback === "loop" ? "infinite" : 1);

  // Never show a blank frame between animations: the sprite on screen only changes once the next sheet is decoded
  // (usually instantly, since screens preload what they use). Everything animation-related follows what is shown.
  const [shown, setShown] = useState({ sprite: targetSprite, runKey, iter: targetIter });
  useEffect(() => {
    if (shown.sprite === targetSprite && shown.runKey === runKey && shown.iter === targetIter) return;
    let alive = true;
    const next = { sprite: targetSprite, runKey, iter: targetIter };
    const img = new Image();
    img.src = sheetUrl(targetSprite);
    img
      .decode()
      .catch(() => undefined)
      .then(() => {
        if (alive) setShown(next);
      });
    return () => {
      alive = false;
    };
  }, [targetSprite, runKey, targetIter, shown]);

  const { sprite, iter } = shown;
  const finite = iter !== "infinite";

  const done = useRef(onComplete);
  useEffect(() => {
    done.current = onComplete;
  });

  // Reduced motion shows a still pose, so there is no animationend: report completion after a calm beat instead.
  useEffect(() => {
    if (!reduced || !finite) return;
    const t = window.setTimeout(() => done.current?.(), Math.min(1200, cycleMs(sprite, speed) * (iter as number)));
    return () => window.clearTimeout(t);
  }, [reduced, finite, iter, sprite, speed, shown.runKey]);

  const style = {
    "--agent-size": typeof size === "number" ? `${size}px` : size,
    "--agent-cycle": `${cycleMs(sprite, speed)}ms`,
    "--agent-iter": String(iter),
  } as CSSProperties;

  const name = label === undefined ? stateLabel(state) : label;
  const a11y = name === null ? { "aria-hidden": true as const } : { role: "img" as const, "aria-label": name };

  const sheet = (
    // A plain <img>: the sheet is a fixed 8-frame strip moved by CSS transform; next/image would resize/re-encode it and break the frame maths.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={`${sprite}:${shown.runKey}`}
      className="v3-agent__sheet"
      src={sheetUrl(sprite)}
      alt=""
      draggable={false}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      onAnimationEnd={finite ? () => done.current?.() : undefined}
    />
  );
  const pose = (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="v3-agent__pose" src={poseUrl(sprite)} alt="" draggable={false} decoding="async" fetchPriority={priority ? "high" : "auto"} />
  );

  const core = (
    <span ref={box} className={`v3-agent ${className}`} style={style} data-paused={paused || !visible || !inView} data-sprite={sprite} {...a11y}>
      {reduced ? pose : sheet}
    </span>
  );
  return flip ? <span className="v3-agent-flip">{core}</span> : core;
}

/** Handle produced by useAgentDirector / useAgentChoreography. */
export interface DirectorHandle {
  state: DirectorState;
  done: (key: string) => void;
}

/** Agent D driven by a director: ambient loop underneath, event reactions on top, one pass each. */
export function AgentDActor({ director, ...rest }: { director: DirectorHandle } & Omit<AgentDProps, "state" | "runKey" | "cycles" | "onComplete">) {
  const { state, done } = director;
  const active = state.active;
  return (
    <AgentD
      {...rest}
      state={visualState(state)}
      runKey={`${state.run}:${active?.key ?? "base"}`}
      cycles={active ? active.cycles : "infinite"}
      onComplete={active ? () => done(active.key) : undefined}
    />
  );
}

/** Static avatar from a pose (header logo, chips). Costs one tiny image and no animation. */
export function AgentDPose({ sprite = "idle", size = 32, className = "" }: { sprite?: SpriteName; size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={poseUrl(sprite)} alt="" aria-hidden width={size} height={size} draggable={false} className={`select-none ${className}`} style={{ width: size, height: size }} />
  );
}
