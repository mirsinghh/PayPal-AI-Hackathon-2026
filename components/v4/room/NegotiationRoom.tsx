"use client";

import { BaseLink } from "@/components/v3/BaseLink";
import { modeBanner, modeChip } from "@/lib/v5/response-mode";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, useSession } from "@/lib/api";
import { useAppBase } from "@/lib/v3/base";
import { AiUnavailableNotice, isTemporaryAiReason } from "@/components/v5/AiNotice";
import { AUTO_FALLBACK_TEXT } from "@/server/ai/limits";
import { turnSplit } from "@/lib/v5/response-mode";
import { deriveDraft, deriveSellers, type SellerState } from "@/lib/negotiation-view";
import { deliveryLabel, offerImage, offerName, warrantyLabel } from "@/lib/offer-view";
import { AI_DEMO_NOTICE, formatEur } from "@/shared/format";
import { SELLER_BRANDS } from "@/shared/sellers";
import type { NegotiationSession, SellerId } from "@/shared/contracts/types";
import { currentStatusLine, deriveActivity } from "@/lib/v3/activity";
import { tradeoffFacts } from "@/lib/v3/reasoning";
import { usePlayback } from "@/lib/v3/use-playback";
import { useAgentChoreography, usePreloadAgentD } from "@/lib/v3/mascot/hooks";
import { positionOf, visualState } from "@/lib/v3/mascot/director";
import { stateLabel } from "@/lib/v3/mascot/manifest";
import type { Indicator } from "@/lib/v3/mascot/event-map";
import { WALK_MS } from "@/lib/v3/mascot/event-map";
import { isSellerId, stallPresentation } from "@/lib/v3/stage";
import { buildV4Conversation, type V4Message } from "@/lib/v4/conversation";
import { buildLab, type EventRef } from "@/lib/v4/lab";
import { AGENT_D_PERSONA, SELLER_PERSONA } from "@/lib/v4/personas";
import { engineHonesty } from "@/lib/v4/provider";
import { RunSummary } from "@/components/v4/room/RunSummary";
import { Chip, ErrorScreen, LoadingScreen, Notice, ProductImage, StoreMark, TypingDots, btn } from "@/components/v3/ui";
import { IconAlert, IconArrow, IconCheck, IconPackage, IconShield, IconTruck } from "@/components/v3/icons";
import { AgentD, type DirectorHandle } from "@/components/v3/mascot/AgentD";
import { PhaseRail } from "@/components/v3/negotiation/PhaseRail";
import { ActivityPanel, EventLog } from "@/components/v3/negotiation/ActivityPanel";
import { ReplayControls } from "@/components/v3/negotiation/ReplayControls";
import { StoreDetail } from "@/components/v3/negotiation/StoreDetail";
import { V4Conversation } from "@/components/v4/chat/V4Conversation";
import { DecisionLab } from "@/components/v4/lab/DecisionLab";
import { AutoBuyChip, AutoBuyRun } from "@/components/v5/autobuy/AutoBuyRun";

const PRIORITY_LABEL = { lowest_price: "Lowest price", fast_delivery: "Fast delivery", best_value: "Best value" } as const;
const ENGINE_STATES = ["thinking", "searching", "running", "offer_received", "counteroffer", "negotiating", "discount", "success", "reject", "idle"] as const;

export function NegotiationRoom({ id }: { id: string }) {
  usePreloadAgentD(ENGINE_STATES);
  const { state, reload } = useSession(id);
  if (state.status === "loading")
    return (
      <LoadingScreen label="Agent D is opening the negotiation room…">
        <AgentD state="thinking" size={132} label={null} priority />
      </LoadingScreen>
    );
  if (state.status === "error")
    return (
      <ErrorScreen message={state.error.message} onRetry={state.error.status === 0 ? reload : undefined}>
        <AgentD state="surprised" size={120} label={null} />
      </ErrorScreen>
    );
  return <Room session={state.data} />;
}

/* ---------- Agent D in the room ---------- */

/**
 * Agent D does not travel across the room: it turns its attention to whoever it is dealing with. The director still
 * plans a "running" reaction between stores; here that beat is shown as scanning (the pack's `search`), so Agent D
 * never runs on the spot. Cadence follows the replay speed, as in V3.
 */
function RoomAgent({ director, size, speed }: { director: DirectorHandle; size: number | string; speed: number }) {
  const { state, done } = director;
  const active = state.active;
  const vs = visualState(state);
  return (
    <AgentD
      state={vs === "running" ? "searching" : vs}
      size={size}
      speed={speed}
      label={null}
      runKey={`${state.run}:${active?.key ?? "base"}`}
      cycles={active ? active.cycles : "infinite"}
      onComplete={active ? () => done(active.key) : undefined}
    />
  );
}

function Room({ session }: { session: NegotiationSession }) {
  const playback = usePlayback(session);
  const { live, visible, finished } = playback;
  const [selectedId, setSelectedId] = useState<SellerId | null>(null);
  const [tab, setTab] = useState<"chat" | "lab">("chat");
  const [focus, setFocus] = useState<{ eventId: string; n: number } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const sellers = useMemo(() => deriveSellers(session, visible), [session, visible]);
  const awaiting = useMemo(() => sellers.filter((s) => s.awaitingReply).map((s) => ({ id: s.id, brand: s.brand })), [sellers]);
  const draft = useMemo(() => deriveDraft(sellers, session.intent.budgetCents), [sellers, session.intent.budgetCents]);
  const offersIn = sellers.filter((s) => s.priceCents !== null).length;

  const agent = useAgentChoreography(visible);
  const activity = useMemo(() => deriveActivity(visible), [visible]);
  const messages = useMemo(
    () => buildV4Conversation(visible, { budgetCents: session.intent.budgetCents, query: session.intent.productQuery, priority: session.intent.priority, preferences: session.intent.preferences, offers: session.offers }),
    [visible, session.intent, session.offers],
  );
  const facts = useMemo(() => tradeoffFacts(sellers), [sellers]);
  const status = currentStatusLine(visible, { awaiting });

  const winner = session.offers.find((o) => o.offerId === session.recommendedOfferId) ?? null;
  const failed = finished && session.status === "failed";
  const done = finished && !failed && !!winner && session.status !== "negotiating";
  const lab = useMemo(() => (done ? buildLab(session) : null), [done, session]);
  const { intent } = session;
  const banner = modeBanner(session);
  const chip = modeChip(session);
  // AI problems: while a live run is switching to rules, one line; once finished, the full notice (what happened, when to retry, what to do).
  const router = useRouter();
  const base = useAppBase();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const switching = live && !finished && visible.some((e) => e.type === "AGENT_FALLBACK");
  const wroteByRules = (turnSplit(session)?.rules ?? 0) > 0;
  const startedOnRules = session.responseMode === "ai" && session.mode !== "multi_agent" && isTemporaryAiReason(session.fallbackReason);
  const aiNotice = finished && session.responseMode === "ai" && (wroteByRules || startedOnRules || session.agentRun?.recoveredWithRules === true);
  const aiIssue = session.agentRun?.aiIssue ?? session.fallbackIssue ?? null;
  async function tryAiAgain() {
    if (retrying) return;
    setRetrying(true);
    setRetryError(null);
    try {
      // A fresh negotiation with the same request, on AI Agents. The finished one is never modified or re-run.
      const res = await api<{ sessionId: string }>("/api/negotiations", { method: "POST", body: JSON.stringify({ ...session.intent, responseMode: "ai" }) });
      router.push(`${base}/negotiation/${res.sessionId}`);
    } catch (e) {
      setRetryError((e as Error).message || "We couldn't start a new negotiation.");
      setRetrying(false);
    }
  }
  const honesty = useMemo(() => engineHonesty(visible, session.agentRun?.provider ?? (session.agentRun?.model ? "gemini" : null)), [visible, session.agentRun]);

  // Who the room is about right now: the store Agent D is dealing with (the director's spot), unless you picked one.
  const spot = positionOf(agent.director);
  const lastSeller = [...visible].reverse().find((e) => e.sellerId)?.sellerId ?? null;
  const active: SellerId | null = isSellerId(spot) ? spot : lastSeller;
  const focusId = done && winner ? winner.sellerId : (selectedId ?? active);
  const focusSeller = sellers.find((s) => s.id === focusId) ?? null;
  const selected = sellers.find((s) => s.id === selectedId) ?? null;

  useEffect(() => {
    if (finished) heading.current?.focus({ preventScroll: true });
  }, [finished]);

  function showEvent(ref: EventRef) {
    setTab("chat");
    setSelectedId(ref.sellerId);
    setFocus((f) => ({ eventId: ref.eventId, n: (f?.n ?? 0) + 1 }));
    document.getElementById("room-tabs")?.scrollIntoView({ block: "start" });
  }

  const order = done && winner ? [...sellers].sort((a, b) => Number(b.winner) - Number(a.winner) || Number(a.status === "set_aside") - Number(b.status === "set_aside")) : sellers;

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <title>{finished ? "Negotiation complete" : "Agent D is negotiating"}</title>

      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <p className="v3-eyebrow">{live ? "The Negotiation Room · live" : "The Negotiation Room · replay"}</p>
          <h1 ref={heading} tabIndex={-1} className="v3-display mt-2 text-[clamp(2rem,1.3rem+3vw,3.4rem)] outline-none">
            {failed ? "No deal this time." : finished ? <>Agent D has <span className="v3-hl">a pick</span>.</> : <>Agent D is <span className="v3-hl">at the table</span>.</>}
          </h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.98rem] text-v3-ink2">
            <span className="font-bold text-v3-ink">{intent.productQuery}</span>
            <span aria-hidden>·</span>
            <span>up to {formatEur(intent.budgetCents)}</span>
            <span aria-hidden>·</span>
            <span>{PRIORITY_LABEL[intent.priority]}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {session.checkoutMode === "auto_buy" && <AutoBuyChip />}
          {chip && <Chip tone={chip.tone}>{chip.text}</Chip>}
          {live ? <Chip tone={honesty.level === "all_ai" || honesty.level === "mixed" ? "primary" : "warn"}>{honesty.label}</Chip> : <Chip tone="accent">Rule-based simulation · replay</Chip>}
        </div>
      </header>

      <div className="mt-5 space-y-3">
        {banner && <Notice tone={banner.tone}>{banner.text}</Notice>}
        {switching && <Notice tone="warn">{AUTO_FALLBACK_TEXT}</Notice>}
        {aiNotice && (
          <AiUnavailableNotice issue={aiIssue} reason={session.fallbackReason} onTryAgain={session.checkoutMode === "auto_buy" ? undefined : () => void tryAiAgain()} trying={retrying} />
        )}
        {retryError && <Notice tone="danger">{retryError}</Notice>}
        {live ? (
          <>
            <Notice tone="info">{AI_DEMO_NOTICE}</Notice>
            {finished && (honesty.level === "mostly_rules" || honesty.level === "no_ai") && (
              <Notice tone="warn">Most turns of this run were written by the rules engine because the AI provider was unavailable (rate limit or errors). Each message is labelled with who really wrote it.</Notice>
            )}
            {session.agentRun?.engine === "single_call_script" && <Notice tone="warn">Test mode: a single AI call wrote the whole negotiation script and the server validated every step. These are not independent agents.</Notice>}
          </>
        ) : (
          <Notice tone={session.fallbackReason && !banner ? "warn" : "info"}>
            {session.fallbackReason && !banner ? `Multi-agent AI negotiation wasn't used (${session.fallbackReason.replace(/_/g, " ")}). ` : ""}
            This is a replay of a rule-based simulation: the server computed all four offers when you started. The characters&apos; lines are scripted from validated data; no AI wrote them, and the stores are not real.
          </Notice>
        )}
      </div>

      <div className="mt-6">
        <PhaseRail visible={visible} finished={finished} offersIn={offersIn} total={sellers.length} />
      </div>

      {/* 1. The four offers at a glance. */}
      <section aria-label="The four offers" className="mt-6">
        <ul className="v4-strip">
          {order.map((s) => (
            <OfferTile key={s.id} s={s} active={focusId === s.id} pinned={selectedId === s.id} done={done} onSelect={(id) => setSelectedId(selectedId === id ? null : id)} />
          ))}
        </ul>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          {/* 2. The table: Agent D and the store it is dealing with. */}
          <RoomStage
            seller={focusSeller}
            director={agent.handle}
            directorState={visualState(agent.director)}
            status={status.text}
            indicator={agent.indicator}
            messages={messages}
            live={live}
            speed={live ? 1 : playback.speed}
            done={done}
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
                setTab("chat");
                playback.replay();
              }}
            />
          )}

          {/* Agent Auto-Buy: the pre-authorised purchase runs here. Manual Checkout keeps the review card below, unchanged. */}
          {done && winner && session.checkoutMode === "auto_buy" && <AutoBuyRun session={session} />}

          {done && winner && session.checkoutMode !== "auto_buy" && (
            <section aria-labelledby="v4-result" className="v3-card v3-pop flex flex-wrap items-center gap-5 border-v3-success-line bg-v3-success-soft p-5 sm:p-6">
              <ProductImage src={offerImage(winner)} alt={offerName(winner)} className="size-20 bg-v3-surface" sizes="80px" />
              <div className="min-w-0 flex-1">
                <p id="v4-result" className="flex items-center gap-1.5 text-sm font-extrabold text-v3-success">
                  <IconCheck size={16} /> Agent D&apos;s recommendation is ready
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 font-v3-head text-xl font-extrabold">
                  <StoreMark id={winner.sellerId} size={26} />
                  <span>{SELLER_BRANDS[winner.sellerId].brand}</span>
                  <span className="v3-num">· {formatEur(winner.finalPriceCents)}</span>
                </p>
                <p className="mt-1 text-sm text-v3-ink2">Nothing has been paid. See why in the Decision Lab, then review and decide.</p>
              </div>
              <div className="flex w-full flex-wrap gap-2.5 sm:w-auto">
                <button
                  type="button"
                  className={btn("secondary", "lg", "w-full sm:w-auto")}
                  onClick={() => {
                    setTab("lab");
                    document.getElementById("room-tabs")?.scrollIntoView({ block: "start" });
                  }}
                >
                  Open Decision Lab
                </button>
                <BaseLink to={`/deals/${session.sessionId}`} className={btn("primary", "lg", "w-full sm:w-auto")}>
                  Review the offers <IconArrow />
                </BaseLink>
              </div>
            </section>
          )}

          {failed && (
            <section className="v3-card border-v3-danger-line p-5">
              <p className="font-bold">The negotiation didn&apos;t produce an offer within your budget. Nothing was paid.</p>
              <BaseLink to="/brief" className={btn("primary", "md", "mt-4")}>
                Start a new mission
              </BaseLink>
            </section>
          )}

          {/* 3. Conversation, Decision Lab. */}
          <div id="room-tabs" className="scroll-mt-24 space-y-4">
            <div role="group" aria-label="Room sections" className="inline-flex gap-1 rounded-v3-md bg-v3-sunken p-1">
              {(
                [
                  ["chat", "Conversation"],
                  ["lab", "Decision Lab"],
                ] as const
              ).map(([t, label]) => (
                <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)} className={`min-h-11 rounded-[10px] px-4 text-sm font-bold transition-colors duration-(--v3-d1) ${tab === t ? "bg-v3-surface text-v3-ink shadow-v3-card" : "text-v3-ink2 hover:text-v3-ink"}`}>
                  {label}
                </button>
              ))}
            </div>

            {tab === "chat" ? (
              <V4Conversation
                key={focus?.n ?? 0}
                messages={messages}
                sellers={sellers}
                selectedId={selectedId}
                onSelect={setSelectedId}
                live={live}
                awaiting={awaiting}
                agentDoing={stateLabel(visualState(agent.director))}
                timeline={<EventLog events={visible} live={live} title="Structured timeline" />}
                focusEventId={focus?.eventId ?? null}
              />
            ) : lab ? (
              <DecisionLab lab={lab} budgetCents={intent.budgetCents} offers={session.offers} onShowEvent={showEvent} />
            ) : (
              <section aria-labelledby="lab-wait" className="v3-card p-5 sm:p-6">
                <p className="v3-eyebrow">Decision Lab</p>
                <h2 id="lab-wait" className="v3-h2 mt-1 text-[1.5rem]">
                  Opens when Agent D has decided
                </h2>
                <p className="mt-2 text-sm text-v3-ink2">The Lab explains the recommendation with the server&apos;s final scores, so it only appears once the negotiation is complete. Meanwhile, here is what Agent D is weighing, computed from the offers received so far:</p>
                {facts.length > 0 ? (
                  <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm marker:text-v3-primary">
                    {facts.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-v3-ink2">Nothing to compare yet.</p>
                )}
              </section>
            )}
          </div>
        </div>

        {/* Side: progress, best offers, details. */}
        <div className="min-w-0 space-y-6">
          <ActivityPanel current={status.text} tone={status.tone} recent={activity} live={live} />
          <RunSummary session={session} />
          <Leaderboard sellers={sellers} budgetCents={intent.budgetCents} draftLowest={draft.lowest} done={done} />
          {selected && <StoreDetail s={selected} live={live} onClose={() => setSelectedId(null)} />}
        </div>
      </div>
    </div>
  );
}

/* ---------- The four offers, compact ---------- */

function OfferTile({ s, active, pinned, done, onSelect }: { s: SellerState; active: boolean; pinned: boolean; done: boolean; onSelect: (id: SellerId) => void }) {
  const p = stallPresentation(s);
  const dropped = s.previousCents !== null && s.priceCents !== null && s.priceCents < s.previousCents;
  const o = s.offer;
  const out = done && !s.winner;
  return (
    <li className="min-w-0">
      <button
        type="button"
        aria-pressed={pinned}
        onClick={() => onSelect(s.id)}
        data-active={active}
        style={{ ["--spot" as string]: SELLER_BRANDS[s.id].color }}
        className={`v4-spot v3-card relative block h-full w-full cursor-pointer p-3.5 text-left ${s.winner ? "border-v3-success bg-v3-success-soft" : ""} ${out ? "opacity-80" : ""}`}
      >
        <span className="flex items-center gap-2.5">
          <StoreMark id={s.id} size={38} muted={s.status === "waiting" || s.status === "set_aside"} />
          <span className="min-w-0">
            <span className="block truncate font-v3-head text-[1.02rem] font-bold leading-tight">{s.brand}</span>
            <span className="block truncate text-xs font-semibold text-v3-ink2">{SELLER_PERSONA[s.id].title}</span>
          </span>
        </span>
        <span className="mt-3 flex min-h-[2.6rem] flex-wrap items-baseline gap-x-2">
          {s.priceCents !== null ? (
            <>
              <span key={s.priceCents} className={`v3-num inline-block font-v3-head text-[1.55rem] font-extrabold leading-none ${dropped ? "v3-flash" : "v3-pop"}`}>
                {formatEur(s.priceCents)}
              </span>
              {dropped && <span className="v3-num text-xs font-semibold text-v3-ink2 line-through">{formatEur(s.previousCents as number)}</span>}
            </>
          ) : (
            <span className="text-sm font-semibold text-v3-ink2">
              <span aria-hidden>—</span> <span className="sr-only">No offer yet. </span>
              {s.status === "waiting" ? "Not found yet" : "No price yet"}
            </span>
          )}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          <Chip tone={s.winner ? "success" : p.tone}>{s.winner ? "Best match" : p.label}</Chip>
          {s.awaitingReply && <TypingDots label={`${s.brand} is replying`} />}
          {s.rejectedReason && <Chip tone="warn">Set aside by the server</Chip>}
        </span>
        {o && (
          <span className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 border-t border-v3-line pt-2.5 text-xs font-semibold text-v3-ink2">
            <span className="inline-flex items-center gap-1"><IconTruck size={13} /> {deliveryLabel(o.deliveryDays)}</span>
            <span className="inline-flex items-center gap-1"><IconShield size={13} /> {warrantyLabel(o.warrantyMonths)}</span>
            <span className="inline-flex items-center gap-1"><IconPackage size={13} /> {(o.catalog ? o.catalog.shippingCents === 0 : o.freeShipping) ? "Free ship." : "Paid ship."}</span>
          </span>
        )}
        {s.score !== null && <span className="mt-2 block text-xs font-bold text-v3-ink2">Score {s.score}/100</span>}
      </button>
    </li>
  );
}

/* ---------- The table: Agent D and the store in focus ---------- */

function lastWhere(messages: V4Message[], pred: (m: V4Message) => boolean): V4Message | null {
  for (let i = messages.length - 1; i >= 0; i--) if (pred(messages[i])) return messages[i];
  return null;
}

function RoomStage({
  seller,
  director,
  directorState,
  status,
  indicator,
  messages,
  live,
  speed,
  done,
}: {
  seller: SellerState | null;
  director: DirectorHandle;
  directorState: string;
  status: string;
  indicator: Indicator | null;
  messages: V4Message[];
  live: boolean;
  speed: number;
  done: boolean;
}) {
  const pace = Math.max(speed, 1);
  const id = seller?.id ?? null;
  const mine = id ? messages.filter((m) => m.sellerId === id) : [];
  const ask = lastWhere(mine, (m) => m.speaker === "buyer" && m.kind === "ask");
  const reply = lastWhere(mine, (m) => m.speaker === "seller");
  const latest = mine.at(-1) ?? null;
  const notice = id ? lastWhere(mine, (m) => m.speaker === "server" && (m.kind === "validation" || m.kind === "fallback" || (m.kind === "verdict" && m.facts.includes("Not a decision by the store")))) : null;
  const askIsNewest = !!ask && (!reply || ask.sequence > reply.sequence);
  const flowing = !!seller && (seller.awaitingReply || askIsNewest) && !done;
  const buyerSays = ask?.text ?? (done ? "I have what I need. Let's look at the numbers together." : status);
  const sellerSays = reply?.text ?? null;
  const showNotice = notice && latest && notice.sequence >= (reply?.sequence ?? -1);

  return (
    <section aria-label="The negotiation table" className="v4-room v3-card relative overflow-hidden p-4 sm:p-6">
      <div aria-hidden className="v3-dots pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative grid items-start gap-x-4 gap-y-4 md:grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)]">
        {/* Agent D */}
        <div className="flex min-w-0 flex-col items-center gap-2 md:items-stretch">
          <div className="flex items-end gap-3 md:flex-col md:items-center md:gap-1" style={{ ["--v3-walk" as string]: `${WALK_MS / pace}ms` }}>
            <div className="flex flex-col items-center">
              <RoomAgent director={director} size="clamp(112px, 16vw, 168px)" speed={pace} />
              <span aria-hidden className="v3-shadow-blob -mt-2" />
            </div>
            <div className="min-w-0 md:text-center">
              <p className="font-v3-head text-lg font-extrabold leading-tight">Agent D</p>
              <p className="text-xs font-semibold text-v3-ink2">{AGENT_D_PERSONA.title} · {stateLabel(directorState as Parameters<typeof stateLabel>[0]).toLowerCase()}</p>
            </div>
          </div>
          <p key={ask?.eventId ?? "status"} className={`v4-rise w-full rounded-[18px] rounded-tl-md border px-3.5 py-3 text-[0.95rem] leading-snug text-pretty ${askIsNewest ? "border-v3-primary/40 bg-v3-soft" : "border-v3-line bg-v3-surface/90"}`} role="status">
            <span className="mb-1 block text-[0.66rem] font-extrabold uppercase tracking-wider text-v3-ink2">{ask ? `Agent D → ${seller?.brand}` : "Agent D"}</span>
            {buyerSays}
            {ask && (
              <span className="mt-1.5 block text-[0.66rem] font-bold text-v3-ink2">
                {ask.authorLabel ?? (ask.origin === "ai" ? "AI agent message" : ask.origin === "fallback" ? "Rules fallback" : "Rule-based simulation")}
                {ask.scripted ? " · scripted line" : ""}
              </span>
            )}
          </p>
        </div>

        {/* The line between them */}
        <div aria-hidden className="flex items-center justify-center md:h-full md:pt-24">
          <div className="v4-link w-16 md:w-full" data-flow={flowing} />
        </div>

        {/* The store in focus */}
        <div className="min-w-0">
          {seller ? (
            <>
              <div data-active className="v4-spot v3-card flex flex-wrap items-center gap-x-3 gap-y-2 p-3.5" style={{ ["--spot" as string]: SELLER_BRANDS[seller.id].color }}>
                <StoreMark id={seller.id} size={52} muted={seller.status === "waiting"} />
                <div className="min-w-[8rem] flex-1">
                  <p className="font-v3-head text-lg font-extrabold leading-tight text-balance">{seller.brand}</p>
                  <p className="text-xs font-semibold text-v3-ink2">{SELLER_PERSONA[seller.id].title}</p>
                </div>
                {seller.priceCents !== null && (
                  <p key={seller.priceCents} className="v3-num v3-pop text-right font-v3-head text-2xl font-extrabold leading-none">
                    {formatEur(seller.priceCents)}
                    {seller.previousCents !== null && seller.previousCents > seller.priceCents && <span className="mt-1 block text-xs font-semibold text-v3-ink2 line-through">{formatEur(seller.previousCents)}</span>}
                  </p>
                )}
              </div>
              <div className="mt-3">
                {sellerSays ? (
                  <p key={reply?.eventId} className={`v4-rise rounded-[18px] rounded-tr-md border px-3.5 py-3 text-[0.95rem] leading-snug text-pretty ${!askIsNewest ? "border-v3-line-strong bg-v3-surface shadow-v3-card" : "border-v3-line bg-v3-surface/90"}`} style={{ borderLeft: `4px solid ${SELLER_BRANDS[seller.id].color}` }}>
                    <span className="mb-1 block text-[0.66rem] font-extrabold uppercase tracking-wider text-v3-ink2">
                      {seller.brand}
                      {reply?.outcome === "held" ? " · held its price" : reply?.outcome === "improved" ? " · improved its offer" : ""}
                    </span>
                    {sellerSays}
                    <span className="mt-1.5 block text-[0.66rem] font-bold text-v3-ink2">
                      {reply?.authorLabel ?? (reply?.origin === "ai" ? "AI agent message" : reply?.origin === "fallback" ? "Rules fallback" : "Rule-based simulation")}
                      {reply?.scripted ? " · scripted line" : ""}
                    </span>
                  </p>
                ) : seller.awaitingReply ? (
                  <p className="flex items-center gap-2 rounded-[18px] border border-v3-line bg-v3-surface/90 px-3.5 py-3 text-sm font-semibold text-v3-ink2">
                    {seller.brand} is replying <TypingDots label={`${seller.brand} is replying`} />
                  </p>
                ) : (
                  <p className="rounded-[18px] border border-dashed border-v3-line-strong px-3.5 py-3 text-sm text-v3-ink2">{seller.status === "waiting" ? "Agent D hasn't found this store yet." : `${seller.brand} hasn't said anything yet.`}</p>
                )}
              </div>
            </>
          ) : (
            <p className="rounded-[18px] border border-dashed border-v3-line-strong px-3.5 py-6 text-center text-sm text-v3-ink2">Agent D is reading your mission and looking for stores…</p>
          )}
        </div>
      </div>

      {/* A server verdict is shown apart from the store: it is never the store's decision. */}
      {(showNotice || indicator) && (
        <div role="status" className="v4-rise relative mt-4 flex flex-wrap items-center gap-2 rounded-v3-md border border-v3-warn-line bg-v3-warn-soft px-3 py-2 text-sm">
          <span className="text-v3-warn"><IconAlert size={16} /></span>
          <strong>{showNotice ? "Server check" : indicator?.label}</strong>
          <span className="text-v3-ink2">{showNotice ? `${notice!.text} Not a decision by the store.` : "Not a decision by the store."}</span>
        </div>
      )}
      <p className="relative mt-3 text-center text-xs text-v3-ink2">
        {live ? "Live: lines appear as the agents' replies are recorded." : "Replay: lines are scripted from the validated offers."} Prices on the cards are the ones the server validated.
      </p>
    </section>
  );
}

/* ---------- Best offers ---------- */

function Leaderboard({ sellers, budgetCents, draftLowest, done }: { sellers: SellerState[]; budgetCents: number; draftLowest: { brand: string; cents: number } | null; done: boolean }) {
  const priced = sellers.filter((s) => s.priceCents !== null).sort((a, b) => (a.priceCents as number) - (b.priceCents as number));
  return (
    <section aria-labelledby="best-title" className="v3-card p-5">
      <h2 id="best-title" className="font-v3-head text-lg font-extrabold">
        Best offers so far
      </h2>
      {priced.length === 0 ? (
        <p className="mt-2 text-sm text-v3-ink2">No offers received yet.</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {priced.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2.5 text-sm">
              <span aria-hidden className="grid size-6 place-items-center rounded-full bg-v3-soft text-xs font-extrabold text-v3-primary-ink">{i + 1}</span>
              <StoreMark id={s.id} size={22} />
              <span className="min-w-0 flex-1 truncate font-bold">{s.brand}</span>
              <span className="v3-num font-extrabold">{formatEur(s.priceCents as number)}</span>
              {(s.priceCents as number) > budgetCents && <span className="sr-only">over budget</span>}
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-xs text-v3-ink2">
        {done ? "Ordered by price only. The recommendation weighs delivery and warranty too: see the Decision Lab." : draftLowest ? `Lowest so far: ${draftLowest.brand} at ${formatEur(draftLowest.cents)}. This is arithmetic over recorded offers, not a recommendation yet.` : "Ordered by price. Not a recommendation."}
      </p>
    </section>
  );
}
