"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/lib/api";
import { deriveDraft, deriveSellers } from "@/lib/negotiation-view";
import { offerImage, offerName } from "@/lib/offer-view";
import { duration, ease, spring } from "@/lib/motion";
import { prefersReducedMotion, usePageVisible } from "@/lib/use-motion-env";
import { AI_DEMO_NOTICE, formatEur } from "@/shared/format";
import { SELLER_BRANDS } from "@/shared/sellers";
import type { NegotiationSession, SellerId } from "@/shared/contracts/types";
import { Badge, Card, ErrorState, LoadingState, StatusBanner, arrowNudge, btnCompact, btnLarge, btnPrimary, btnSecondary } from "@/components/ui";
import { IconArrowRight } from "@/components/icons";
import { ProductImage } from "@/components/ProductImage";
import { SellerMark } from "@/components/SellerMark";
import { Stage } from "@/components/negotiation/Stage";
import { PriceBoard } from "@/components/negotiation/PriceBoard";
import { DraftSlip } from "@/components/negotiation/DraftSlip";
import { Timeline } from "@/components/negotiation/Timeline";
import { SellerDetail } from "@/components/negotiation/SellerDetail";

const PHASES = ["initialize", "discover", "offers", "negotiate", "evaluate", "complete"] as const;
const PHASE_LABEL: Record<(typeof PHASES)[number], string> = {
  initialize: "Understanding your request",
  discover: "Finding stores",
  offers: "Collecting offers",
  negotiate: "Negotiating",
  evaluate: "Evaluating offers",
  complete: "Complete",
};
const SPEEDS = [1, 2, 4] as const;
type Speed = (typeof SPEEDS)[number];
const PRIORITY_LABEL = { lowest_price: "Lowest price", fast_delivery: "Fast delivery", best_value: "Best value" } as const;

export default function NegotiationPage({ params }: PageProps<"/negotiation/[id]">) {
  const { id } = use(params);
  const { state, reload } = useSession(id);
  if (state.status === "loading") return <LoadingState label="Opening your negotiation…" />;
  if (state.status === "error") return <ErrorState message={state.error.message} onRetry={state.error.status === 0 ? reload : undefined} />;
  return <Playback session={state.data} />;
}

function Playback({ session }: { session: NegotiationSession }) {
  // Live = real multi-agent run: events are shown the moment the server persists them (the hook polls).
  const live = session.mode === "multi_agent";
  const events = session.events;
  const total = events.at(-1)?.atMs ?? 0;
  // Reduced motion is a design (SKILL §3): the replay opens already finished, with the full story and final state
  // on screen. "Replay" is still there for anyone who wants to watch it.
  const [elapsed, setElapsed] = useState(() => (!live && prefersReducedMotion() ? total : 0));
  const pageVisible = usePageVisible();
  const [speed, setSpeed] = useState<Speed>(2);
  const [paused, setPaused] = useState(false);
  const [selectedId, setSelectedId] = useState<SellerId | null>(null);
  const running = session.status === "negotiating";
  const finished = live ? !running : elapsed >= total;
  const resultRef = useRef<HTMLHeadingElement>(null);

  // Rule-based replay is purely visual: it only reveals already-validated events and never changes data.
  useEffect(() => {
    // The replay clock only stops for the user (Pause) or a hidden tab. It deliberately keeps running when the map
    // scrolls off screen: on a phone the timeline below narrates the same events.
    if (live || paused || finished || !pageVisible) return;
    const t = setInterval(() => setElapsed((e) => Math.min(total, e + 100 * speed)), 100);
    return () => clearInterval(t);
  }, [live, paused, finished, speed, total, pageVisible]);

  // Live clock anchored to the latest real event, so a marker travels the moment an event actually arrives.
  const latest = useRef(session);
  const anchor = useRef({ len: -1, atMs: 0, clientMs: 0 });
  useEffect(() => {
    latest.current = session;
  }, [session]);
  useEffect(() => {
    if (!live || !pageVisible) return;
    const t = setInterval(() => {
      const ev = latest.current.events;
      if (ev.length !== anchor.current.len) anchor.current = { len: ev.length, atMs: ev.at(-1)?.atMs ?? 0, clientMs: Date.now() };
      setElapsed(anchor.current.atMs + (Date.now() - anchor.current.clientMs));
    }, 100);
    return () => clearInterval(t);
  }, [live, pageVisible]);

  useEffect(() => {
    if (finished) resultRef.current?.focus({ preventScroll: true });
  }, [finished]);

  // Events are ordered by time, so "visible" is just a prefix. Keying on its length keeps the list stable between ticks.
  const visibleCount = live ? events.length : events.filter((e) => e.atMs <= elapsed).length;
  const visible = useMemo(() => events.slice(0, visibleCount), [events, visibleCount]);
  const phase = visible.at(-1)?.phase ?? "initialize";
  const phaseIdx = PHASES.indexOf(phase);
  const sellers = useMemo(() => deriveSellers(session, visible), [session, visible]);
  const selected = sellers.find((s) => s.id === selectedId) ?? null;
  const awaiting = useMemo(() => sellers.filter((s) => s.awaitingReply).map((s) => ({ id: s.id, brand: s.brand })), [sellers]);
  const offersIn = sellers.filter((s) => s.priceCents !== null).length;
  const draft = useMemo(() => deriveDraft(sellers, session.intent.budgetCents), [sellers, session.intent.budgetCents]);

  const winnerOffer = session.offers.find((o) => o.offerId === session.recommendedOfferId) ?? null;
  const failed = finished && session.status === "failed";
  const done = finished && session.status !== "failed" && !!winnerOffer;

  const { intent } = session;
  return (
    <div className="space-y-6">
      <title>Negotiation · AgentDeal</title>

      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 ref={resultRef} tabIndex={-1} className="font-display text-[clamp(2.25rem,1.6rem+2.8vw,3.5rem)] leading-[1.02] outline-none text-balance">
            {failed ? "No deal reached" : finished ? "Negotiation complete" : live ? "Your agent is negotiating" : "Replaying the negotiation"}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-2">
            <span className="font-medium text-ink">{intent.productQuery}</span>
            <span aria-hidden>·</span>
            <span>up to {formatEur(intent.budgetCents)}</span>
            <span aria-hidden>·</span>
            <span>{PRIORITY_LABEL[intent.priority]}</span>
          </p>
        </div>
        {live ? <Badge tone="primary">Live AI agents · demo stores</Badge> : <Badge tone="warning">Rule-based simulation</Badge>}
      </header>

      {live ? (
        <>
          <StatusBanner tone="info">{AI_DEMO_NOTICE}</StatusBanner>
          {session.agentRun?.engine === "single_call_script" && (
            <StatusBanner tone="warning">
              Test mode: a single AI call wrote the whole negotiation script and the server validated every step. These are not independent agents.
            </StatusBanner>
          )}
        </>
      ) : (
        <StatusBanner tone={session.fallbackReason ? "warning" : "info"}>
          {session.fallbackReason
            ? `Multi-agent AI negotiation wasn't used (${session.fallbackReason.replace(/_/g, " ")}). `
            : ""}
          Replay of a rule-based simulation. The server computed all four offers when you started; this screen shows how they came about. It is not a live conversation.
        </StatusBanner>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:items-start">
        <div className="space-y-4">
          {/* Progress */}
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <div className="min-w-0 basis-full sm:flex-1 sm:basis-0" role="group" aria-label="Negotiation progress">
              <p className="text-small">
                <span className="font-medium">{finished ? "Complete" : PHASE_LABEL[phase]}</span>
                <span className="text-ink-2">
                  {" "}
                  · {offersIn} of {sellers.length} offers received
                </span>
              </p>
              <ol className="mt-2 flex gap-1" aria-hidden>
                {PHASES.map((p, i) => (
                  <li key={p} className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                    <motion.span
                      className="block h-full w-full origin-left rounded-full bg-primary"
                      initial={false}
                      animate={{ scaleX: finished || i < phaseIdx ? 1 : i === phaseIdx ? 0.5 : 0 }}
                      transition={spring.soft}
                    />
                  </li>
                ))}
              </ol>
              <p className="sr-only" aria-live="polite">
                {finished ? "Negotiation complete." : `Phase: ${PHASE_LABEL[phase]}`}
              </p>
            </div>
            <ul className="flex items-center gap-4 text-caption text-ink-2" aria-label="Legend">
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-full bg-primary" /> Your agent asks
              </li>
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-full border-2 border-primary" /> Store offers
              </li>
            </ul>
          </div>

          <Stage
            sellers={sellers}
            events={visible}
            elapsed={elapsed}
            selectedId={selectedId}
            onSelect={setSelectedId}
            active={!finished}
            live={live}
          />

          {!live && (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Replay controls">
              <button className={`${btnSecondary} ${btnCompact}`} onClick={() => setPaused((p) => !p)} disabled={finished}>
                {paused ? "Resume" : "Pause"}
              </button>
              <button
                className={`${btnSecondary} ${btnCompact}`}
                onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
                aria-label={`Replay speed ${speed}×. Change speed`}
              >
                <span className="tabular">{speed}×</span>
              </button>
              <button className={`${btnSecondary} ${btnCompact}`} onClick={() => setElapsed(total)} disabled={finished}>
                Skip to result
              </button>
              <button
                className={`${btnSecondary} ${btnCompact}`}
                onClick={() => {
                  setElapsed(0);
                  setPaused(false);
                  setSelectedId(null);
                }}
              >
                Replay
              </button>
            </div>
          )}

          <PriceBoard sellers={sellers} budgetCents={intent.budgetCents} selectedId={selectedId} onSelect={setSelectedId} />

          <AnimatePresence>
            {done && winnerOffer && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={spring.soft}
                className="flex flex-wrap items-center gap-4 rounded-lg border border-success-line bg-success-soft p-4 sm:p-5"
              >
                <ProductImage src={offerImage(winnerOffer)} alt={offerName(winnerOffer)} className="size-16 bg-surface" sizes="64px" />
                <div className="min-w-0 flex-1">
                  <p className="text-small font-medium text-success">Best match for your priorities</p>
                  <p className="mt-0.5 flex items-center gap-2 text-h3 font-semibold">
                    <SellerMark id={winnerOffer.sellerId} size={24} />
                    <span className="truncate">{SELLER_BRANDS[winnerOffer.sellerId].brand}</span>
                    <span className="tabular">· {formatEur(winnerOffer.finalPriceCents)}</span>
                  </p>
                  <p className="mt-0.5 text-small text-ink-2">Nothing has been paid. Review the offers before deciding.</p>
                </div>
                <Link href={`/deals/${session.sessionId}`} className={`${btnPrimary} ${btnLarge} w-full sm:w-auto`}>
                  Review offers <IconArrowRight size={18} className={arrowNudge} />
                </Link>
              </motion.div>
            )}
          </AnimatePresence>

          {failed && (
            <Card className="space-y-3 border-danger-line p-5">
              <p className="text-body font-medium">The negotiation didn&apos;t produce an offer within your budget. Nothing was paid.</p>
              <Link href="/" className={btnPrimary}>
                Start a new request
              </Link>
            </Card>
          )}
        </div>

        <div className="space-y-6">
        <DraftSlip draft={draft} intent={session.intent} />
        <aside aria-label="Activity and store details" className="rounded-lg border border-line bg-surface p-4 sm:p-5">
          <AnimatePresence mode="wait" initial={false}>
            {selected ? (
              <motion.div
                key={`seller-${selected.id}`}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={ease(duration.state)}
              >
                <SellerDetail s={selected} live={live} onBack={() => setSelectedId(null)} />
              </motion.div>
            ) : (
              <motion.div key="timeline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={ease(duration.micro)}>
                <Timeline events={visible} live={live} awaiting={awaiting} />
                {sellers.some((s) => s.discovered) && <p className="mt-3 border-t border-line pt-3 text-caption text-ink-2">Select a store on the map to see its offer and history.</p>}
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </div>
      </div>
    </div>
  );
}
