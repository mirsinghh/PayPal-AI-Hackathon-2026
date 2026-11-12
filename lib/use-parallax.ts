"use client";

import { useEffect, type RefObject } from "react";

/**
 * Pointer parallax with inertia (hero-motion §5.3). Writes --px / --py (-1..1) onto `target`; CSS turns them into
 * `translate` per layer through --depth. Only for a fine pointer and without reduced motion; the rAF stops by
 * itself once the value has settled, so an idle page costs nothing.
 */
export function useParallax(target: RefObject<HTMLElement | null>, listenOn?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = target.current;
    const host = listenOn?.current ?? el;
    if (!el || !host) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduce) return;

    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let raf = 0;
    const frame = () => {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      el.style.setProperty("--px", cx.toFixed(3));
      el.style.setProperty("--py", cy.toFixed(3));
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.002 ? requestAnimationFrame(frame) : 0;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const clamp = (v: number) => Math.min(1, Math.max(-1, v));
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      tx = clamp(((e.clientX - r.left) / r.width - 0.5) * 2);
      ty = clamp(((e.clientY - r.top) / r.height - 0.5) * 2);
      kick();
    };
    const leave = () => {
      tx = 0;
      ty = 0;
      kick();
    };
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
    };
  }, [target, listenOn]);
}
