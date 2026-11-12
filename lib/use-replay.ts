"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePageVisible, useReducedMotionPref } from "@/lib/use-motion-env";

/**
 * Looping replay clock for a frozen sample (hero-motion §6.5: play, hold on the final state, fade, restart).
 * `elapsed` advances in ms of *sample time*, `speed` times faster than real time. Restarts cannot overlap: one effect
 * owns the interval and timeouts and its cleanup cancels all of them (the React equivalent of the skill's runId), and
 * the clock itself lives in a ref so no side effect runs inside a state updater.
 * With reduced motion it opens on the finished state and never loops (the skill's renderStatic).
 */
export function useReplay({ total, speed, holdMs = 5200, fadeMs = 500, running }: { total: number; speed: number; holdMs?: number; fadeMs?: number; running: boolean }) {
  // Starts at 0 on server and client alike (the page is server-rendered); reduced motion jumps to the end after mount.
  const clock = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  const [fading, setFading] = useState(false);
  const [run, setRun] = useState(0);
  const visible = usePageVisible();

  const reduce = useReducedMotionPref();

  useEffect(() => {
    if (reduce || !running || !visible) return;
    let hold = 0;
    let fade = 0;
    const t = window.setInterval(() => {
      clock.current = Math.min(total, clock.current + 100 * speed);
      setElapsed(clock.current);
      if (clock.current >= total) {
        window.clearInterval(t);
        // Hold the finished state, fade it out, then start over.
        hold = window.setTimeout(() => {
          setFading(true);
          fade = window.setTimeout(() => {
            clock.current = 0;
            setElapsed(0);
            setFading(false);
            setRun((r) => r + 1);
          }, fadeMs);
        }, holdMs);
      }
    }, 100);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(hold);
      window.clearTimeout(fade);
    };
  }, [total, speed, holdMs, fadeMs, running, visible, run, reduce]);

  const restart = useCallback(() => {
    clock.current = 0;
    setElapsed(0);
    setFading(false);
    setRun((r) => r + 1);
  }, []);

  // Reduced motion shows the finished state, never a loop (the skill's renderStatic).
  return { elapsed: reduce ? total : elapsed, fading: reduce ? false : fading, restart };
}
