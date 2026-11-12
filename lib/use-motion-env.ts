"use client";

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

/** Reads the OS setting once, synchronously. Only call from components that render after hydration (client-fetched screens). */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** True while the tab is visible. Loops and replay clocks pause when it is hidden. */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const on = () => setVisible(!document.hidden);
    on();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible;
}

/** Whether the element is (nearly) on screen. Ambient animation is paused when it is not. */
export function useInView(ref: RefObject<Element | null>, margin = "80px"): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => setInView(e.isIntersecting)), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin]);
  return inView;
}

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";
/** Reactive reduced-motion preference. false on the server, so server-rendered pages hydrate without a mismatch. */
export function useReducedMotionPref(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(REDUCE_QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(REDUCE_QUERY).matches,
    () => false,
  );
}
