"use client";

import { useEffect, useMemo, useState } from "react";
import type { NegotiationEvent, NegotiationSession } from "@/shared/contracts/types";
import { usePageVisible, useReducedMotionPref } from "@/lib/use-motion-env";
import { isFinished } from "./phase";

export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

/**
 * What the screen is allowed to show, per engine.
 *  - multi_agent (live): everything the server has persisted so far; the page polls, nothing is delayed or invented.
 *  - v0_rules (replay): the already-validated events revealed by a clock the user can pause, speed up or skip.
 * Default speed is 1x: at that pace every reaction of Agent D fits between two recorded events. Faster speeds are the user's choice.
 * Under reduced motion a replay opens already finished (the full story and the final state), as in the classic UI.
 */
export function usePlayback(session: NegotiationSession, opts: { initialSpeed?: Speed; running?: boolean } = {}) {
  const live = session.mode === "multi_agent";
  const events = session.events;
  const total = events.at(-1)?.atMs ?? 0;
  const reduce = useReducedMotionPref();
  const pageVisible = usePageVisible();

  const [clock, setClock] = useState(0);
  const [speed, setSpeed] = useState<Speed>(opts.initialSpeed ?? 1);
  const [paused, setPaused] = useState(false);
  const [forced, setForced] = useState(false); // the user asked to watch the replay despite reduced motion
  const run = opts.running ?? true;

  const elapsed = !live && reduce && !forced ? total : Math.min(clock, total);
  const finished = isFinished(session, elapsed, total);

  useEffect(() => {
    if (live || paused || finished || !pageVisible || !run) return;
    const t = window.setInterval(() => setClock((c) => Math.min(total, c + 100 * speed)), 100);
    return () => window.clearInterval(t);
  }, [live, paused, finished, pageVisible, run, speed, total]);

  // Events are ordered by time, so "visible" is a prefix. Keying on its length keeps the list stable between ticks.
  const count = live ? events.length : events.filter((e) => e.atMs <= elapsed).length;
  const visible: NegotiationEvent[] = useMemo(() => events.slice(0, count), [events, count]);

  const skip = () => {
    setClock(total);
    setForced(true);
  };
  const replay = () => {
    setClock(0);
    setPaused(false);
    setForced(true);
  };
  const cycleSpeed = () => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]);

  return { live, total, elapsed, visible, finished, speed, setSpeed, cycleSpeed, paused, togglePause: () => setPaused((p) => !p), skip, replay, reduced: reduce && !forced };
}
