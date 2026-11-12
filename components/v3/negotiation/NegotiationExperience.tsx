"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/lib/api";
import { deriveDraft, deriveSellers } from "@/lib/negotiation-view";
import { offerImage, offerName } from "@/lib/offer-view";
import { AI_DEMO_NOTICE, formatEur } from "@/shared/format";
import { SELLER_BRANDS } from "@/shared/sellers";
import type { NegotiationSession, SellerId } from "@/shared/contracts/types";
import { currentStatusLine, deriveActivity } from "@/lib/v3/activity";
import { deriveReasoning, tradeoffFacts } from "@/lib/v3/reasoning";
import { usePlayback } from "@/lib/v3/use-playback";
import { useAgentChoreography, usePreloadAgentD } from "@/lib/v3/mascot/hooks";
import { Chip, ErrorScreen, LoadingScreen, Notice, ProductImage, StoreMark, btn } from "@/components/v3/ui";
import { IconArrow, IconCheck } from "@/components/v3/icons";
import { AgentD } from "@/components/v3/mascot/AgentD";
import { Stage } from "./Stage";
import { PhaseRail } from "./PhaseRail";
import { ActivityPanel, EventLog } from "./ActivityPanel";
import { ReasoningPanel } from "./ReasoningPanel";
import { Conversation } from "./Conversation";
import { buildConversation } from "@/lib/v3/conversation";
import { visualState } from "@/lib/v3/mascot/director";
import { stateLabel } from "@/lib/v3/mascot/manifest";
import { StoreDetail } from "./StoreDetail";
import { PriceTracks } from "./PriceTracks";
import { ReplayControls } from "./ReplayControls";

const PRIORITY_LABEL = { lowest_price: "Lowest price", fast_delivery: "Fast delivery", best_value: "Best value" } as const;
const ENGINE_STATES = ["thinking", "searching", "running", "offer_received", "counteroffer", "negotiating", "discount", "success", "idle"] as const;

export function NegotiationExperience({ id }: { id: string }) {
  usePreloadAgentD(ENGINE_STATES);
  const { state, reload } = useSession(id);
  if (state.status === "loading")
    return (
      <LoadingScreen label="Agent D is opening your mission…">
        <AgentD state="thinking" size={132} label={null} priority />
      </LoadingScreen>
    );
  if (state.status === "error") return <ErrorScreen message={state.error.message} onRetry={state.error.status === 0 ? reload : undefined}><AgentD state="surprised" size={120} label={null} /></ErrorScreen>;
  return <Negotiation session={state.data} />;
}

function Negotiation({ session }: { session: NegotiationSession }) {
  const playback = usePlayback(session);
  const { live, visible, finished } = playback;
  const [selectedId, setSelectedId] = useState<SellerId | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const sellers = useMemo(() => deriveSellers(session, visible), [session, visible]);
  const selected = sellers.find((s) => s.id === selectedId) ?? null;
  const awaiting = useMemo(() => sellers.filter((s) => s.awaitingReply).map((s) => ({ id: s.id, brand: s.brand })), [sellers]);
  const draft = useMemo(() => deriveDraft(sellers, session.intent.budgetCents), [sellers, session.intent.budgetCents]);
  const offersIn = sellers.filter((s) => s.priceCents !== null).length;

  const agent = useAgentChoreography(visible);
  const activity = useMemo(() => deriveActivity(visible), [visible]);
  const reasoning = useMemo(() => deriveReasoning(visible), [visible]);
  const conversation = useMemo(() => buildConversation(visible, { budgetCents: session.intent.budgetCents, query: session.intent.productQuery }), [visible, session.intent.budgetCents, session.intent.productQuery]);
  const facts = useMemo(() => tradeoffFacts(sellers), [sellers]);
  const status = currentStatusLine(visible, { awaiting });

  const winner = session.offers.find((o) => o.offerId === session.recommendedOfferId) ?? null;
  const failed = finished && session.status === "failed";
  const done = finished && !failed && !!winner && session.status !== "negotiating";
  const { intent } = session;

  useEffect(() => {
    if (finished) heading.current?.focus({ preventScroll: true });
  }, [finished]);

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <title>{finished ? "Negotiation complete" : "Agent D is negotiating"}</title>

      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <p className="v3-eyebrow">{live ? "Live negotiation" : "Negotiation replay"}</p>
          <h1 ref={heading} tabIndex={-1} className="v3-display mt-2 text-[clamp(2.1rem,1.4rem+3.2vw,3.75rem)] outline-none">
            {failed ? "No deal this time." : finished ? <>Agent D is <span className="v3-hl">done</span>.</> : <>Agent D is working on <span className="v3-hl">your deal</span>.</>}
          </h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.98rem] text-v3-ink2">
            <span className="font-bold text-v3-ink">{intent.productQuery}</span>
            <span aria-hidden>·</span>
            <span>up to {formatEur(intent.budgetCents)}</span>
            <span aria-hidden>·</span>
            <span>{PRIORITY_LABEL[intent.priority]}</span>
          </p>
        </div>
        {live ? <Chip tone="primary">Live AI agents · demo stores</Chip> : <Chip tone="accent">Rule-based simulation · replay</Chip>}
      </header>

      <div className="mt-5 space-y-3">
        {live ? (
          <>
            <Notice tone="info">{AI_DEMO_NOTICE}</Notice>
            {session.agentRun?.engine === "single_call_script" && (
              <Notice tone="warn">Test mode: a single AI call wrote the whole negotiation script and the server validated every step. These are not independent agents.</Notice>
            )}
          </>
        ) : (
          <Notice tone={session.fallbackReason ? "warn" : "info"}>
            {session.fallbackReason ? `Multi-agent AI negotiation wasn't used (${session.fallbackReason.replace(/_/g, " ")}). ` : ""}
            This is a replay of a rule-based simulation: the server computed all four offers when you started and this screen shows how they came about. It is not a live conversation with real stores.
          </Notice>
        )}
      </div>

      <div className="mt-6">
        <PhaseRail visible={visible} finished={finished} offersIn={offersIn} total={sellers.length} />
      </div>

      <div className="mt-6 space-y-6">
        <Stage
          sellers={sellers}
          director={agent.handle}
          status={status.text}
          indicator={agent.indicator}
          selectedId={selectedId}
          onSelect={setSelectedId}
          live={live}
          speed={live ? 1 : playback.speed}
        />

        {!live && (
          <ReplayControls
            paused={playback.paused}
            speed={playback.speed}
            finished={finished}
            onTogglePause={playback.togglePause}
            onSpeed={playback.setSpeed}
            onSkip={playback.skip}
            onReplay={() => {
              setSelectedId(null);
              playback.replay();
            }}
          />
        )}

        {done && winner && (
          <section aria-labelledby="result-title" className="v3-card v3-pop flex flex-wrap items-center gap-5 border-v3-success-line bg-v3-success-soft p-5 sm:p-6">
            <ProductImage src={offerImage(winner)} alt={offerName(winner)} className="size-20 bg-v3-surface" sizes="80px" />
            <div className="min-w-0 flex-1">
              <p id="result-title" className="flex items-center gap-1.5 text-sm font-extrabold text-v3-success">
                <IconCheck size={16} /> Agent D&apos;s recommendation is ready
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-2 font-v3-head text-xl font-extrabold">
                <StoreMark id={winner.sellerId} size={26} />
                <span>{SELLER_BRANDS[winner.sellerId].brand}</span>
                <span className="v3-num">· {formatEur(winner.finalPriceCents)}</span>
              </p>
              <p className="mt-1 text-sm text-v3-ink2">Nothing has been paid. Review the offers, then decide.</p>
            </div>
            <Link href={`/v3/deals/${session.sessionId}`} className={btn("primary", "lg", "w-full sm:w-auto")}>
              See Agent D&apos;s pick <IconArrow />
            </Link>
          </section>
        )}

        {failed && (
          <section className="v3-card border-v3-danger-line p-5">
            <p className="font-bold">The negotiation didn&apos;t produce an offer within your budget. Nothing was paid.</p>
            <Link href="/v3/brief" className={btn("primary", "md", "mt-4")}>
              Start a new mission
            </Link>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-start">
          <div className="min-w-0 space-y-6">
            <Conversation
              messages={conversation}
              sellers={sellers}
              selectedId={selectedId}
              onSelect={setSelectedId}
              live={live}
              awaiting={awaiting}
              agentDoing={stateLabel(visualState(agent.director))}
              timeline={<EventLog events={visible} live={live} title="Structured timeline" />}
            />
            <PriceTracks sellers={sellers} budgetCents={intent.budgetCents} />
            {!done && draft.lowest && (
              <p className="text-sm text-v3-ink2">
                Lowest price so far: <strong className="text-v3-ink">{draft.lowest.brand}</strong> at <span className="v3-num font-bold text-v3-ink">{formatEur(draft.lowest.cents)}</span>. This is arithmetic over recorded offers, not a recommendation yet.
              </p>
            )}
          </div>
          <div className="min-w-0 space-y-6">
            <ActivityPanel current={status.text} tone={status.tone} recent={activity} live={live} />
            <ReasoningPanel items={reasoning} facts={facts} live={live} />
            {selected && <StoreDetail s={selected} live={live} onClose={() => setSelectedId(null)} />}
          </div>
        </div>
      </div>
    </div>
  );
}
