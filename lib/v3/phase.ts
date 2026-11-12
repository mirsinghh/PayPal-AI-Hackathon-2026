import type { EventPhase, NegotiationEvent, NegotiationSession } from "@/shared/contracts/types";

/** The six phases the backend records, in order. The V3 stage and the progress rail both read these, nothing else. */
export const PHASES: readonly EventPhase[] = ["initialize", "discover", "offers", "negotiate", "evaluate", "complete"];

export const PHASE_LABEL: Record<EventPhase, string> = {
  initialize: "Understanding",
  discover: "Finding stores",
  offers: "Collecting offers",
  negotiate: "Negotiating",
  evaluate: "Evaluating",
  complete: "Complete",
};

/** Present-tense line for each phase. It describes a confirmed state of the run, not a conversation. */
export const PHASE_STATUS: Record<EventPhase, string> = {
  initialize: "Agent D received your mission.",
  discover: "Agent D is finding the four demo stores.",
  offers: "Agent D is collecting each store's opening offer.",
  negotiate: "Agent D is negotiating with the stores.",
  evaluate: "Agent D is comparing price, delivery and warranty.",
  complete: "Agent D finished. Review the recommendation; nothing has been paid.",
};

export const phaseIndex = (p: EventPhase): number => PHASES.indexOf(p);

/** The phase of the latest event the user is allowed to see. null before the first event. */
export function currentPhase(visible: readonly NegotiationEvent[]): EventPhase | null {
  return visible.at(-1)?.phase ?? null;
}

export interface PhaseStep {
  phase: EventPhase;
  label: string;
  state: "done" | "current" | "todo";
}

/**
 * Progress rail. A step is `done` only once a *later* phase has produced an event, or the run is over: the UI never
 * advances beyond what the persisted state allows.
 */
export function phaseSteps(visible: readonly NegotiationEvent[], finished: boolean): PhaseStep[] {
  const cur = currentPhase(visible);
  const idx = cur ? phaseIndex(cur) : -1;
  return PHASES.map((phase, i) => ({
    phase,
    label: PHASE_LABEL[phase],
    state: finished ? "done" : i < idx ? "done" : i === idx ? "current" : "todo",
  }));
}

/** Whether the run is over, per engine. Live: the server says so. Replay: the clock reached the last event. */
export function isFinished(session: Pick<NegotiationSession, "status" | "mode">, elapsedMs: number, totalMs: number): boolean {
  return session.mode === "multi_agent" ? session.status !== "negotiating" : elapsedMs >= totalMs;
}
