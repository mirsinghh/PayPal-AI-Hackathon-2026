"use client";

import { useCallback, useEffect, useMemo, useReducer } from "react";
import type { NegotiationEvent } from "@/shared/contracts/types";
import { choreoReducer, initialChoreo, type ChoreoState } from "./choreography";
import { directorReducer, initialDirector, positionOf, type ReactionInput } from "./director";
import { SPRITE_NAMES, sheetUrl, spriteOf, type AgentDVisualState } from "./manifest";

/**
 * Drive Agent D from any screen without duplicating logic:
 *
 *   const agent = useAgentDirector("idle");
 *   agent.react(cueForApproval(response, offerId));   // null is ignored
 *   <AgentDActor director={agent.handle} />
 */
export function useAgentDirector(initial: AgentDVisualState = "idle", intro?: ReactionInput) {
  // `intro` is a reaction that plays when the screen opens (e.g. presenting the best offer): part of the initial
  // state, so no effect is needed to start it.
  const [state, dispatch] = useReducer(directorReducer, initial, (base) => {
    const start = initialDirector(base);
    return intro ? directorReducer(start, { type: "react", reaction: intro }) : start;
  });
  const react = useCallback((reaction: ReactionInput | null | undefined) => {
    if (reaction) dispatch({ type: "react", reaction });
  }, []);
  const setBase = useCallback((s: AgentDVisualState) => dispatch({ type: "base", state: s }), []);
  const done = useCallback((key: string) => dispatch({ type: "done", key }), []);
  const reset = useCallback((base?: AgentDVisualState) => dispatch({ type: "reset", base }), []);
  const handle = useMemo(() => ({ state, done }), [state, done]);
  return { state, handle, react, setBase, done, reset };
}

/** How long a fallback/validation chip stays beside Agent D. The full detail stays in the persisted log. */
export const INDICATOR_MS = 7000;

/**
 * Keeps Agent D in step with the events a screen has revealed. Pass the *visible* list (replay: up to the clock;
 * live: what the server has stored). Opening a screen that already has events hydrates silently instead of
 * replaying history; a shorter list (replay restarted) starts over.
 */
export function useAgentChoreography(events: readonly NegotiationEvent[]) {
  const [state, dispatch] = useReducer(choreoReducer, events, (initial): ChoreoState => choreoReducer(initialChoreo(), { type: "hydrate", events: initial }));

  // Render-phase sync (React's documented "adjust state while rendering" pattern): only when the visible list changed.
  if (events.length !== state.processed || (events[0]?.eventId ?? null) !== state.firstEventId) {
    dispatch({ type: "sync", events });
  }

  const done = useCallback((key: string) => dispatch({ type: "done", key }), []);
  const indicatorKey = state.indicator?.key ?? null;
  useEffect(() => {
    if (!indicatorKey) return;
    const t = window.setTimeout(() => dispatch({ type: "clear_indicator" }), INDICATOR_MS);
    return () => window.clearTimeout(t);
  }, [indicatorKey]);

  const handle = useMemo(() => ({ state: state.director, done }), [state.director, done]);
  return { handle, director: state.director, indicator: state.indicator?.indicator ?? null, spot: positionOf(state.director) };
}

const preloaded = new Set<string>();
/** Warm the cache for the sheets a screen is about to use, so a reaction never starts on an empty frame. */
export function preloadAgentD(states: readonly AgentDVisualState[] = []): void {
  if (typeof window === "undefined") return;
  const sprites = states.length ? states.map(spriteOf) : SPRITE_NAMES;
  for (const sprite of sprites) {
    const url = sheetUrl(sprite);
    if (preloaded.has(url)) continue;
    preloaded.add(url);
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  }
}

export function usePreloadAgentD(states: readonly AgentDVisualState[]): void {
  const key = states.join(",");
  useEffect(() => {
    preloadAgentD(key ? (key.split(",") as AgentDVisualState[]) : []);
  }, [key]);
}
