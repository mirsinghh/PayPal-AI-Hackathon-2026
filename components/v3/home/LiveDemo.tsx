"use client";

import { useMemo, useRef, useState } from "react";
import { deriveSellers } from "@/lib/negotiation-view";
import { useInView } from "@/lib/use-motion-env";
import { SAMPLE_NEGOTIATION } from "@/shared/sample-negotiation";
import type { SellerId } from "@/shared/contracts/types";
import { currentStatusLine } from "@/lib/v3/activity";
import { usePlayback } from "@/lib/v3/use-playback";
import { useAgentChoreography, usePreloadAgentD } from "@/lib/v3/mascot/hooks";
import { Stage } from "@/components/v3/negotiation/Stage";
import { PhaseRail } from "@/components/v3/negotiation/PhaseRail";
import { ReplayControls } from "@/components/v3/negotiation/ReplayControls";
import { Chip } from "@/components/v3/ui";

/**
 * An interactive, pre-recorded negotiation: the frozen run of the real rule engine, played through the very same stage,
 * event adapter and Agent D director as the live screen. Labelled as a demo; it is not the visitor's request.
 */
export function LiveDemo() {
  usePreloadAgentD(["running", "offer_received", "counteroffer", "negotiating", "discount", "success"]);
  const session = SAMPLE_NEGOTIATION;
  const root = useRef<HTMLElement>(null);
  const inView = useInView(root);
  const playback = usePlayback(session, { initialSpeed: 1, running: inView });
  const [selectedId, setSelectedId] = useState<SellerId | null>(null);

  const sellers = useMemo(() => deriveSellers(session, playback.visible), [session, playback.visible]);
  const agent = useAgentChoreography(playback.visible);
  const status = currentStatusLine(playback.visible);
  const offersIn = sellers.filter((s) => s.priceCents !== null).length;

  return (
    <section ref={root} id="demo" aria-labelledby="demo-title" className="mx-auto w-full max-w-[1240px] scroll-mt-24 px-4 py-20 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="v3-eyebrow">Watch Agent D in action</p>
          <h2 id="demo-title" className="v3-h2 mt-3 max-w-2xl text-[clamp(2rem,1.4rem+2.6vw,3.4rem)]">
            A negotiation you can <span className="v3-hl">pause</span> and poke.
          </h2>
        </div>
        <Chip tone="accent">Pre-recorded demo · rule engine · not live store activity</Chip>
      </div>
      <p className="mt-4 max-w-2xl text-v3-ink2">
        This is a recorded run for “{session.intent.productQuery}”. It plays through the same screen you get for your own request. Select a store to see its terms.
      </p>

      <div className="mt-8 space-y-4">
        <PhaseRail visible={playback.visible} finished={playback.finished} offersIn={offersIn} total={sellers.length} />
        <Stage sellers={sellers} director={agent.handle} status={status.text} indicator={agent.indicator} selectedId={selectedId} onSelect={setSelectedId} live={false} compact ambient={inView} speed={playback.speed} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ReplayControls
            paused={playback.paused}
            speed={playback.speed}
            finished={playback.finished}
            onTogglePause={playback.togglePause}
            onSpeed={playback.setSpeed}
            onSkip={playback.skip}
            onReplay={() => {
              setSelectedId(null);
              playback.replay();
            }}
          />
          <p className="text-sm font-semibold text-v3-ink2" role="status">
            {playback.finished ? "Replay finished. Nothing was paid." : status.text}
          </p>
        </div>
      </div>
    </section>
  );
}
