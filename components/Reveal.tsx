"use client";

import { useLayoutEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from "react";

/**
 * Entry reveal (SKILL §2.2): an element that starts below the fold fades and rises once as it nears the viewport.
 * `index` staggers siblings through the --i CSS variable (80 ms each).
 *
 * Progressive enhancement: the server renders every element fully visible. Only after hydration, and only for
 * elements that really start off screen, does this add `data-reveal` (the hidden state) before the first paint of
 * that state, so no-JS visitors and above-the-fold content are never hidden.
 *
 * After the transition `data-reveal` is released: its delay and 600 ms duration would otherwise keep slowing the
 * element's own hover transitions.
 */
export function Reveal({
  as: Tag = "div",
  index = 0,
  className,
  children,
}: {
  as?: ElementType;
  index?: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    // Already on screen: leave it as rendered, nothing to reveal.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.94) return;

    el.setAttribute("data-reveal", "");
    el.getBoundingClientRect(); // commit the hidden state so the transition has something to start from

    const release = () => el.removeAttribute("data-reveal");
    const onEnd = (e: TransitionEvent) => {
      if (e.target === el && e.propertyName === "opacity") release();
    };
    let timer = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        el.classList.add("is-in");
        el.addEventListener("transitionend", onEnd);
        timer = window.setTimeout(release, 1800); // safety net if transitionend never fires
      },
      { threshold: 0.14, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
      el.removeEventListener("transitionend", onEnd);
      el.removeAttribute("data-reveal");
      el.classList.remove("is-in");
    };
  }, []);

  return (
    <Tag ref={ref} style={{ "--i": index } as CSSProperties} className={className}>
      {children}
    </Tag>
  );
}
