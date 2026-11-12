import type { NegotiationEvent } from "@/shared/contracts/types";
import { PHASE_LABEL, phaseSteps } from "@/lib/v3/phase";

/** Six phases, driven only by the phase of the latest event the screen has revealed. Never ahead of the data. */
export function PhaseRail({ visible, finished, offersIn, total }: { visible: readonly NegotiationEvent[]; finished: boolean; offersIn: number; total: number }) {
  const steps = phaseSteps(visible, finished);
  const current = steps.find((s) => s.state === "current");
  return (
    <div role="group" aria-label="Negotiation progress">
      <p className="text-[0.95rem] font-semibold">
        <span className="font-extrabold">{finished ? "Complete" : current ? PHASE_LABEL[current.phase] : "Starting"}</span>
        <span className="text-v3-ink2"> · {offersIn} of {total} offers received</span>
      </p>
      <ol className="mt-2.5 grid grid-cols-6 gap-1.5">
        {steps.map((s) => (
          <li key={s.phase} aria-current={s.state === "current" ? "step" : undefined} className="min-w-0">
            <span aria-hidden className="block h-2 overflow-hidden rounded-full bg-v3-line">
              <span className="v3-bar block h-full w-full rounded-full bg-v3-primary" style={{ transform: `scaleX(${s.state === "done" ? 1 : s.state === "current" ? 0.5 : 0})` }} />
            </span>
            <span className={`mt-1.5 hidden truncate text-xs font-bold sm:block ${s.state === "todo" ? "text-v3-ink2" : "text-v3-ink"}`}>{s.label}</span>
            <span className="sr-only">
              {s.label}: {s.state === "done" ? "done" : s.state === "current" ? "in progress" : "not started"}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
