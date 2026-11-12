"use client";

import { useMemo, useRef } from "react";
import { deriveDraft, deriveSellers } from "@/lib/negotiation-view";
import { useInView } from "@/lib/use-motion-env";
import { useParallax } from "@/lib/use-parallax";
import { useReplay } from "@/lib/use-replay";
import { SAMPLE_NEGOTIATION } from "@/shared/sample-negotiation";
import { IconCheck } from "@/components/icons";
import { DraftSlip } from "@/components/negotiation/DraftSlip";
import { Stage } from "@/components/negotiation/Stage";
import { btnGhost } from "@/components/ui";

const SAMPLE_SPEED = 3;
const noop = () => undefined;

/**
 * The product visibly working, above the fold (hero-motion §1): a pre-recorded run of the REAL rule engine, replayed
 * in a loop. It is always labelled as a sample (not the visitor's request, nothing live), reads events from the same
 * data model as the real negotiation screen, pauses off screen and with a hidden tab, and under reduced motion shows
 * the finished state instead of looping.
 */
export function SampleStage() {
  const session = SAMPLE_NEGOTIATION;
  const total = session.events.at(-1)?.atMs ?? 0;
  const root = useRef<HTMLDivElement>(null);
  const inView = useInView(root);
  useParallax(root);
  const { elapsed, fading, restart } = useReplay({ total, speed: SAMPLE_SPEED, running: inView });

  const count = session.events.filter((e) => e.atMs <= elapsed).length;
  const visible = useMemo(() => session.events.slice(0, count), [session.events, count]);
  const sellers = useMemo(() => deriveSellers(session, visible), [session, visible]);
  const draft = useMemo(() => deriveDraft(sellers, session.intent.budgetCents), [sellers, session.intent.budgetCents]);
  const finished = elapsed >= total;

  return (
    <div ref={root} data-inview={inView} className="relative pb-4 sm:pb-8" aria-label="Sample negotiation" role="region">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow flex items-center gap-2">
          <span aria-hidden className="size-1.5 rounded-full bg-primary" />
          Sample run · pre-recorded, rule engine
        </p>
        <button type="button" onClick={restart} className={`${btnGhost} min-h-9 px-3`}>
          Replay sample
        </button>
      </div>

      <div className="stage-item" style={{ ["--depth" as string]: 6, ["--h" as string]: 3 }}>
        <div className={`transition-opacity duration-(--d3) ease-out-soft ${fading ? "opacity-0" : "opacity-100"}`}>
          <Stage sellers={sellers} events={visible} elapsed={elapsed} selectedId={null} onSelect={noop} active={!finished} live={false} variant="sample" />
        </div>
      </div>

      {/* The slip fills in from the same events, hanging off the stage like a document on a desk. */}
      <div
        className="stage-item relative z-10 mt-4 sm:-mt-4 sm:ml-auto sm:mr-5 sm:w-[20rem]"
        style={{ ["--depth" as string]: 18, ["--h" as string]: 5 }}
      >
        <div className={`transition-opacity duration-(--d3) ease-out-soft ${fading ? "opacity-0" : "opacity-100"}`}>
          <DraftSlip draft={draft} short className="shadow-pop" />
        </div>
      </div>

      {/* Promises, not activity. Floating chips sit nearest the viewer, so they move the most. */}
      <div className="stage-item stage-item--float pointer-events-none absolute -left-2 bottom-3 hidden sm:block" style={{ ["--depth" as string]: 28, ["--h" as string]: 7 }}>
        <p className="flex items-center gap-2 rounded-md border border-line-strong bg-surface px-3 py-2 text-small shadow-pop">
          <span className="text-success">
            <IconCheck size={16} />
          </span>
          You approve before anything is paid
        </p>
      </div>
    </div>
  );
}
