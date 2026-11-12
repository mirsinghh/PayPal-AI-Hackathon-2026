"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SellerState } from "@/lib/negotiation-view";
import { formatEur } from "@/shared/format";
import { SELLER_BRANDS } from "@/shared/sellers";
import type { SellerId } from "@/shared/contracts/types";
import { ORIGIN_LABEL, poseForMessage, type MessageOrigin } from "@/lib/v3/conversation";
import { FILTER_LABEL, filterMessages, groupMessages, type ConversationFilter, type V4Message } from "@/lib/v4/conversation";
import { AGENT_D_PERSONA, SELLER_PERSONA } from "@/lib/v4/personas";
import { AgentDPose } from "@/components/v3/mascot/AgentD";
import { Chip, StoreMark, TypingDots } from "@/components/v3/ui";
import { IconAlert, IconCheck, IconShield } from "@/components/v3/icons";

const ORIGIN_DOT: Record<MessageOrigin, string> = { ai: "bg-v3-primary", rules: "bg-v3-accent", fallback: "bg-v3-warn", server: "bg-v3-ink2", system: "bg-v3-line-strong" };

const clock = (atMs: number, live: boolean): string => {
  const s = atMs / 1000;
  return live ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

/** A quiet, always-present origin label: a coloured dot and words. Never colour alone. */
function Origin({ m }: { m: V4Message }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.7rem] font-bold text-v3-ink2" title={m.scripted ? "A scripted, in-character line from the rule-based simulation. No AI model wrote it." : undefined}>
      <span aria-hidden className={`size-1.5 rounded-full ${ORIGIN_DOT[m.origin]}`} />
      {ORIGIN_LABEL[m.origin]}
      {m.scripted && <span className="font-semibold">· scripted line</span>}
    </span>
  );
}

function PriceUpdate({ m }: { m: V4Message }) {
  const p = m.price!;
  const down = p.previousCents !== null && p.currentCents < p.previousCents;
  return (
    <div className={`v4-rise mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-v3-md border px-3 py-2.5 ${down ? "border-v3-success-line bg-v3-success-soft" : "border-v3-line bg-v3-soft2"}`}>
      <div>
        <p className="text-[0.66rem] font-extrabold uppercase tracking-wider text-v3-ink2">{p.previousCents === null ? "Opening offer" : p.held ? "Price kept" : "Offer updated"}</p>
        <p className="v3-num flex items-baseline gap-2.5">
          {down && <span className="text-sm font-semibold text-v3-ink2 line-through">{formatEur(p.previousCents as number)}</span>}
          <span className="font-v3-head text-[1.6rem] font-extrabold leading-none">{formatEur(p.currentCents)}</span>
        </p>
      </div>
      {down && (
        <span className="v3-flash v3-num rounded-full bg-v3-success px-2.5 py-1 text-xs font-extrabold text-white">
          <span className="sr-only">Price drop of </span>−{formatEur((p.previousCents as number) - p.currentCents)}
        </span>
      )}
      <p className="v3-num ml-auto text-xs text-v3-ink2">
        {p.itemCents !== null && p.shippingCents !== null ? `${formatEur(p.itemCents)} item + ${p.shippingCents === 0 ? "free shipping" : `${formatEur(p.shippingCents)} shipping`}` : "validated by the server"}
      </p>
    </div>
  );
}

function Tech({ m, live }: { m: V4Message; live: boolean }) {
  const rows: [string, string][] = [
    ["Event", `${m.tech.type} · #${m.sequence}`],
    ["Time", clock(m.atMs, live)],
    ...(m.round !== null ? ([["Round", String(m.round)]] as [string, string][]) : []),
    ["Origin", m.scripted ? "Rule engine · scripted line" : (m.tech.source ?? "rule engine / server")],
    ...(m.tech.model ? ([["Model", m.tech.model]] as [string, string][]) : []),
    ...(m.tech.latencyMs !== null ? ([["Latency", `${m.tech.latencyMs} ms`]] as [string, string][]) : []),
    ...(m.tech.reasons.length ? ([["Reasons", m.tech.reasons.join(", ")]] as [string, string][]) : []),
  ];
  return (
    <details className="mt-2 text-xs text-v3-ink2">
      <summary className="inline-flex min-h-8 cursor-pointer items-center rounded-md font-bold underline decoration-v3-line-strong underline-offset-2">Details</summary>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-v3-md bg-v3-soft2 p-2">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt>{k}</dt>
            <dd className="break-all font-semibold text-v3-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function Bubble({ m, live, showTo, highlight }: { m: V4Message; live: boolean; showTo: boolean; highlight: boolean }) {
  const brand = m.sellerId ? SELLER_BRANDS[m.sellerId].brand : null;
  const unrecorded = m.amounts.filter((a) => !a.recorded);

  if (m.speaker === "system")
    return (
      <li className="v4-rise flex flex-col items-center gap-1 py-0.5 text-center">
        <span className="v3-chip !whitespace-normal !text-center !text-[0.72rem]">
          {m.sellerId && <StoreMark id={m.sellerId} size={16} />}
          {m.text}
        </span>
        <span className="text-[0.64rem] font-bold uppercase tracking-wider text-v3-ink2">{clock(m.atMs, live)}</span>
      </li>
    );

  // The server speaking about the negotiation: a banner, never a character's line.
  if (m.speaker === "server") {
    const warn = m.kind === "validation" || m.kind === "fallback";
    return (
      <li className={`v4-rise mx-auto w-full max-w-[36rem] rounded-v3-md border px-3 py-2 ${warn ? "border-v3-warn-line bg-v3-warn-soft" : "border-v3-line bg-v3-soft2"}`}>
        <p className="flex flex-wrap items-center gap-2 text-xs font-extrabold">
          <span className={warn ? "text-v3-warn" : "text-v3-primary-ink"}>{warn ? <IconAlert size={14} /> : <IconShield size={14} />}</span>
          <Origin m={m} />
          {brand && <span className="text-v3-ink2">· {brand}</span>}
          <span className="font-semibold text-v3-ink2">{clock(m.atMs, live)}</span>
        </p>
        <p className="mt-1 text-sm leading-snug text-pretty">{m.text}</p>
        {m.facts.length > 0 && <p className="mt-0.5 text-xs font-semibold text-v3-ink2">{m.facts.join(" · ")}</p>}
        <Tech m={m} live={live} />
      </li>
    );
  }

  const buyer = m.speaker === "buyer";
  const persona = m.sellerId ? SELLER_PERSONA[m.sellerId] : null;
  return (
    <li id={`msg-${m.eventId}`} className={`v4-rise flex gap-2.5 ${buyer ? "flex-row-reverse" : ""}`}>
      <span aria-hidden className="mt-1 shrink-0">
        {buyer ? (
          <span className="grid size-10 place-items-center overflow-hidden rounded-[13px] bg-v3-soft ring-1 ring-v3-primary/25">
            <AgentDPose sprite={poseForMessage(m)} size={38} />
          </span>
        ) : (
          <StoreMark id={m.sellerId as SellerId} size={40} />
        )}
      </span>
      <div
        className={`min-w-0 max-w-[90%] rounded-[18px] border px-3.5 py-3 ${highlight ? "ring-2 ring-v3-primary/40" : ""} ${buyer ? "rounded-tr-md border-v3-primary/25 bg-v3-soft" : "rounded-tl-md border-v3-line bg-v3-surface shadow-v3-card"}`}
        style={!buyer && m.sellerId ? { borderLeft: `4px solid ${SELLER_BRANDS[m.sellerId].color}` } : undefined}
      >
        <p className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs ${buyer ? "justify-end" : ""}`}>
          <span className="font-extrabold">{buyer ? (m.kind === "ask" && showTo && brand ? `Agent D → ${brand}` : "Agent D") : brand}</span>
          <span className="font-semibold text-v3-ink2">{buyer ? AGENT_D_PERSONA.title : persona?.title}</span>
          <span className="font-semibold text-v3-ink2">· {clock(m.atMs, live)}</span>
        </p>
        {m.text && (
          <p className="mt-1.5 text-[0.95rem] leading-snug text-pretty">
            {m.scripted && <span className="sr-only">Scripted line: </span>}
            {m.text}
          </p>
        )}
        {m.targetCents !== null && <p className="v3-num mt-1.5 text-xs font-bold text-v3-ink2">Target for the item: {formatEur(m.targetCents)}</p>}
        {m.kind === "ask" && <p className="mt-2"><Chip tone="primary" className="!py-0.5 !text-[0.68rem]">Counteroffer</Chip></p>}
        {m.outcome === "held" && (
          <p className="mt-2">
            <Chip tone="neutral" className="!py-0.5 !text-[0.68rem]">The store held its price</Chip>
          </p>
        )}
        {m.outcome === "improved" && (
          <p className="mt-2">
            <Chip tone="success" icon={<IconCheck size={12} />} className="!py-0.5 !text-[0.68rem]">Improved offer</Chip>
          </p>
        )}
        {m.price && <PriceUpdate m={m} />}
        {unrecorded.length > 0 && (
          <p className="mt-2">
            <Chip tone="warn" className="!whitespace-normal !text-[0.68rem]">
              {unrecorded.map((a) => formatEur(a.cents)).join(", ")} in this text is narrative, not a validated price
            </Chip>
          </p>
        )}
        <p className="mt-2">
          <Origin m={m} />
        </p>
        <Tech m={m} live={live} />
      </div>
    </li>
  );
}

/**
 * The negotiation as a conversation between Agent D and four characters. One bubble = one persisted event, grouped by
 * round. Store threads, a chronological view and focused lenses (offer changes, server checks, result) are all here;
 * the structured timeline stays one click away.
 */
export function V4Conversation({
  messages,
  sellers,
  selectedId,
  onSelect,
  live,
  awaiting,
  agentDoing,
  timeline,
  focusEventId,
}: {
  messages: V4Message[];
  sellers: SellerState[];
  selectedId: SellerId | null;
  onSelect: (id: SellerId | null) => void;
  live: boolean;
  awaiting: { id: SellerId; brand: string }[];
  agentDoing: string;
  timeline: ReactNode;
  /** Event to highlight (set when the Decision Lab sends you here). */
  focusEventId?: string | null;
}) {
  const [view, setView] = useState<"chat" | "timeline">("chat");
  const [filter, setFilter] = useState<ConversationFilter>("chat");
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const shown = filterMessages(messages, filter, selectedId);
  const groups = groupMessages(shown);
  const typing = filter === "chat" ? awaiting.filter((a) => !selectedId || a.id === selectedId) : [];

  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight });
  }, [shown.length, typing.length, selectedId, view, filter]);

  useEffect(() => {
    if (!focusEventId) return;
    document.getElementById(`msg-${focusEventId}`)?.scrollIntoView({ block: "center" });
  }, [focusEventId, view, selectedId, filter]);

  const tab = (active: boolean) => `min-h-11 rounded-[10px] px-4 text-sm font-bold transition-colors duration-(--v3-d1) ${active ? "bg-v3-surface text-v3-ink shadow-v3-card" : "text-v3-ink2 hover:text-v3-ink"}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Negotiation view" className="inline-flex gap-1 rounded-v3-md bg-v3-sunken p-1">
          {(
            [
              ["chat", "Conversation"],
              ["timeline", "Timeline"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} className={tab(view === id)}>
              {label}
            </button>
          ))}
        </div>
        <p className="text-sm font-semibold text-v3-ink2">
          Agent D is <strong className="text-v3-ink">{agentDoing.toLowerCase()}</strong>
        </p>
      </div>

      {view === "timeline" ? (
        timeline
      ) : (
        <section aria-labelledby="v4-convo-title" className="v3-card overflow-hidden">
          <div className="border-b border-v3-line bg-v3-soft2/60 px-4 py-3">
            <h2 id="v4-convo-title" className="font-v3-head text-lg font-extrabold">
              Agent D and the four stores
            </h2>
            <div role="group" aria-label="Choose a conversation" className="mt-2.5 flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={selectedId === null}
                onClick={() => onSelect(null)}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-bold transition-colors duration-(--v3-d1) ${selectedId === null ? "border-v3-ink bg-v3-ink text-white" : "border-v3-line-strong bg-v3-surface text-v3-ink2 hover:text-v3-ink"}`}
              >
                All stores <span className="v3-num text-xs opacity-80">{messages.length}</span>
              </button>
              {sellers.map((s) => {
                const count = messages.filter((m) => m.sellerId === s.id).length;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={selectedId === s.id}
                    onClick={() => onSelect(selectedId === s.id ? null : s.id)}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-bold transition-colors duration-(--v3-d1) ${selectedId === s.id ? "border-v3-ink bg-v3-ink text-white" : "border-v3-line-strong bg-v3-surface text-v3-ink2 hover:text-v3-ink"}`}
                  >
                    <StoreMark id={s.id} size={22} muted={count === 0} />
                    {s.brand}
                    <span className="v3-num text-xs opacity-80">{count}</span>
                  </button>
                );
              })}
            </div>
            <div role="group" aria-label="What to show" className="mt-2.5 inline-flex flex-wrap gap-1 rounded-v3-md bg-v3-sunken p-1">
              {(Object.keys(FILTER_LABEL) as ConversationFilter[]).map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`${tab(filter === f)} !min-h-9 !px-3 !text-[0.8rem]`}>
                  {FILTER_LABEL[f]}
                </button>
              ))}
            </div>
          </div>

          <div
            ref={box}
            tabIndex={0}
            aria-label="Conversation, scrollable"
            onScroll={(e) => {
              const el = e.currentTarget;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
            }}
            className="max-h-[38rem] overflow-y-auto px-4 pb-4"
          >
            {groups.length === 0 && typing.length === 0 ? (
              <p className="py-10 text-center text-sm text-v3-ink2">
                {filter !== "chat" ? "Nothing of this kind has been recorded yet." : selectedId ? `Nothing recorded with ${SELLER_BRANDS[selectedId].brand} yet.` : live ? "Waiting for the first agent to report…" : "Waiting for the first event…"}
              </p>
            ) : (
              <>
                {groups.map((g) => (
                  <div key={g.key}>
                    <h3 className="sticky top-0 z-10 -mx-4 mb-2 mt-3 flex items-center gap-3 bg-v3-surface/95 px-4 py-2 text-[0.68rem] font-extrabold uppercase tracking-wider text-v3-ink2 backdrop-blur">
                      <span>{g.label}</span>
                      <span aria-hidden className="h-px flex-1 bg-v3-line" />
                    </h3>
                    <ol className="space-y-3">
                      {g.messages.map((m) => (
                        <Bubble key={m.id} m={m} live={live} showTo={selectedId === null} highlight={focusEventId === m.eventId} />
                      ))}
                    </ol>
                  </div>
                ))}
                {typing.length > 0 && (
                  <ol className="mt-3 space-y-3">
                    {typing.map((t) => (
                      <li key={`typing-${t.id}`} className="flex items-center gap-2.5">
                        <StoreMark id={t.id} size={40} />
                        <p className="flex items-center gap-2 rounded-[18px] rounded-tl-md border border-v3-line bg-v3-surface px-3.5 py-2.5 text-sm font-semibold text-v3-ink2">
                          {t.brand} is replying <TypingDots label={`${t.brand} is replying`} />
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </div>
          <p className="border-t border-v3-line px-4 py-2.5 text-xs text-v3-ink2">
            Messages are narrative evidence. The price cards are validated by the server against each store&apos;s rules and your budget.{live ? "" : " In this replay the lines are scripted from validated data; no AI wrote them."}
          </p>
        </section>
      )}
    </div>
  );
}
