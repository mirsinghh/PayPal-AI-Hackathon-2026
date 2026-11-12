"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SellerState } from "@/lib/negotiation-view";
import { formatEur } from "@/shared/format";
import { SELLER_BRANDS } from "@/shared/sellers";
import type { SellerId } from "@/shared/contracts/types";
import { ORIGIN_LABEL, poseForMessage, threadFor, type ChatMessage, type MessageOrigin } from "@/lib/v3/conversation";
import { AgentDPose } from "@/components/v3/mascot/AgentD";
import { Chip, StoreMark, TypingDots, type ChipTone } from "@/components/v3/ui";
import { IconAlert, IconShield } from "@/components/v3/icons";

const ORIGIN_TONE: Record<MessageOrigin, ChipTone> = { ai: "primary", rules: "accent", fallback: "warn", server: "neutral", system: "neutral" };

const clock = (atMs: number, live: boolean): string => {
  const s = atMs / 1000;
  return live ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

function OriginChip({ origin }: { origin: MessageOrigin }) {
  return (
    <Chip tone={ORIGIN_TONE[origin]} className="!py-0.5 !text-[0.68rem]">
      {ORIGIN_LABEL[origin]}
    </Chip>
  );
}

/** A validated price change. This card, not the prose next to it, is the financial fact. */
function PriceCard({ m }: { m: ChatMessage }) {
  const p = m.price!;
  const down = p.previousCents !== null && p.currentCents < p.previousCents;
  return (
    <div className={`mt-2.5 rounded-v3-md border p-3 ${down ? "border-v3-success-line bg-v3-success-soft" : "border-v3-line bg-v3-soft2"}`}>
      <p className="text-[0.68rem] font-extrabold uppercase tracking-wider text-v3-ink2">{p.previousCents === null ? "Opening offer" : p.held ? "Price kept" : "Offer updated"} · validated by the server</p>
      <p className="v3-num mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        {down && <span className="text-sm font-semibold text-v3-ink2 line-through">{formatEur(p.previousCents as number)}</span>}
        <span className="font-v3-head text-2xl font-extrabold leading-none">{formatEur(p.currentCents)}</span>
        {down && <span className="text-sm font-extrabold text-v3-success">−{formatEur((p.previousCents as number) - p.currentCents)}</span>}
      </p>
      {p.itemCents !== null && p.shippingCents !== null && (
        <p className="v3-num mt-1 text-xs text-v3-ink2">
          {formatEur(p.itemCents)} item + {p.shippingCents === 0 ? "free shipping" : `${formatEur(p.shippingCents)} shipping`}
        </p>
      )}
    </div>
  );
}

function Tech({ m, live }: { m: ChatMessage; live: boolean }) {
  const rows: [string, string][] = [
    ["Event", `${m.tech.type} · #${m.sequence}`],
    ["Time", clock(m.atMs, live)],
    ...(m.round !== null ? ([["Round", String(m.round)]] as [string, string][]) : []),
    ...(m.tech.source ? ([["Source", m.tech.source]] as [string, string][]) : []),
    ...(m.tech.model ? ([["Model", m.tech.model]] as [string, string][]) : []),
    ...(m.tech.latencyMs !== null ? ([["Latency", `${m.tech.latencyMs} ms`]] as [string, string][]) : []),
    ...(m.tech.reasons.length ? ([["Reasons", m.tech.reasons.join(", ")]] as [string, string][]) : []),
  ];
  return (
    <details className="mt-2 text-xs text-v3-ink2">
      <summary className="inline-flex min-h-8 cursor-pointer items-center rounded-md font-bold underline decoration-v3-line-strong underline-offset-2">Technical details</summary>
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

function Bubble({ m, live, showTo }: { m: ChatMessage; live: boolean; showTo: boolean }) {
  const brand = m.sellerId ? SELLER_BRANDS[m.sellerId].brand : null;
  const unrecorded = m.amounts.filter((a) => !a.recorded);

  // System lines: small, centred, never mistaken for speech.
  if (m.speaker === "system")
    return (
      <li className="flex flex-col items-center gap-1 py-1 text-center">
        <span className="v3-chip !text-[0.72rem]">
          {m.sellerId && <StoreMark id={m.sellerId} size={16} />}
          {m.text}
        </span>
        <span className="text-[0.66rem] font-bold uppercase tracking-wider text-v3-ink2">{ORIGIN_LABEL.system} · {clock(m.atMs, live)}</span>
      </li>
    );

  // Server verdicts, validation and fallbacks: a banner, clearly not a store or an agent talking.
  if (m.speaker === "server") {
    const warn = m.kind === "validation" || m.kind === "fallback";
    return (
      <li className={`mx-auto w-full max-w-[34rem] rounded-v3-md border px-3 py-2 ${warn ? "border-v3-warn-line bg-v3-warn-soft" : "border-v3-line bg-v3-soft2"}`}>
        <p className="flex flex-wrap items-center gap-2 text-xs font-extrabold">
          <span className={warn ? "text-v3-warn" : "text-v3-primary-ink"}>{warn ? <IconAlert size={14} /> : <IconShield size={14} />}</span>
          <OriginChip origin={m.origin} />
          {brand && <span className="text-v3-ink2">{brand}</span>}
          <span className="font-semibold text-v3-ink2">{clock(m.atMs, live)}</span>
        </p>
        <p className="mt-1 text-sm leading-snug text-pretty">{m.text}</p>
        {m.facts.length > 0 && <p className="mt-0.5 text-xs font-semibold text-v3-ink2">{m.facts.join(" · ")}</p>}
        <Tech m={m} live={live} />
      </li>
    );
  }

  const buyer = m.speaker === "buyer";
  return (
    <li className={`flex gap-2.5 ${buyer ? "flex-row-reverse" : ""}`}>
      <span aria-hidden className="mt-1 shrink-0">
        {buyer ? (
          <span className="grid size-9 place-items-center overflow-hidden rounded-[12px] bg-v3-soft">
            <AgentDPose sprite={poseForMessage(m)} size={34} />
          </span>
        ) : (
          <StoreMark id={m.sellerId as SellerId} size={36} />
        )}
      </span>
      <div className={`min-w-0 max-w-[88%] rounded-[18px] border px-3.5 py-3 ${buyer ? "rounded-tr-md border-v3-primary/25 bg-v3-soft" : "rounded-tl-md border-v3-line bg-v3-surface shadow-v3-card"}`}>
        <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-extrabold ${buyer ? "justify-end" : ""}`}>
          <span>{buyer ? (m.kind === "ask" && showTo && brand ? `Agent D → ${brand}` : "Agent D") : brand}</span>
          <OriginChip origin={m.origin} />
          <span className="font-semibold text-v3-ink2">{clock(m.atMs, live)}</span>
        </p>
        {m.text && (
          <p className="mt-1.5 text-[0.95rem] leading-snug text-pretty">
            {m.templated && <span className="sr-only">Template: </span>}
            {m.text}
          </p>
        )}
        {m.targetCents !== null && <p className="v3-num mt-1.5 text-xs font-bold text-v3-ink2">Target for the item: {formatEur(m.targetCents)}</p>}
        {m.price && <PriceCard m={m} />}
        {unrecorded.length > 0 && (
          <p className="mt-2">
            <Chip tone="warn" className="!whitespace-normal !text-[0.68rem]">
              {unrecorded.map((a) => formatEur(a.cents)).join(", ")} in this text is narrative, not a validated price
            </Chip>
          </p>
        )}
        <Tech m={m} live={live} />
      </div>
    </li>
  );
}

/**
 * The negotiation as a multi-agent chat: Agent D on one side, each store on the other, one thread per store plus a
 * global view. Every bubble is one persisted event, labelled by origin; price cards carry the validated money.
 * The structured timeline remains available as the secondary view.
 */
export function Conversation({
  messages,
  sellers,
  selectedId,
  onSelect,
  live,
  awaiting,
  agentDoing,
  timeline,
}: {
  messages: ChatMessage[];
  sellers: SellerState[];
  selectedId: SellerId | null;
  onSelect: (id: SellerId | null) => void;
  live: boolean;
  awaiting: { id: SellerId; brand: string }[];
  agentDoing: string;
  timeline: ReactNode;
}) {
  const [view, setView] = useState<"chat" | "timeline">("chat");
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const thread = threadFor(messages, selectedId);
  const typing = awaiting.filter((a) => !selectedId || a.id === selectedId);

  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight });
  }, [thread.length, typing.length, selectedId, view]);

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
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={`min-h-11 rounded-[10px] px-4 text-sm font-bold transition-colors duration-(--v3-d1) ${view === id ? "bg-v3-surface text-v3-ink shadow-v3-card" : "text-v3-ink2 hover:text-v3-ink"}`}
            >
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
        <section aria-labelledby="convo-title" className="v3-card overflow-hidden">
          <div className="border-b border-v3-line bg-v3-soft2/60 px-4 py-3">
            <h2 id="convo-title" className="font-v3-head text-lg font-extrabold">
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
                const count = threadFor(messages, s.id).length;
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
                    {s.priceCents !== null && <span className="v3-num hidden text-xs sm:inline">{formatEur(s.priceCents)}</span>}
                  </button>
                );
              })}
            </div>
            <p className="mt-2.5 text-xs text-v3-ink2">Messages are narrative evidence of the negotiation. The price cards are the validated source of truth: the server checks every price against each store&apos;s rules and your budget.</p>
          </div>

          <div
            ref={box}
            tabIndex={0}
            aria-label="Conversation, scrollable"
            onScroll={(e) => {
              const el = e.currentTarget;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
            }}
            className="max-h-[36rem] overflow-y-auto px-4 py-4"
          >
            {thread.length === 0 && typing.length === 0 ? (
              <p className="py-10 text-center text-sm text-v3-ink2">{selectedId ? `Nothing recorded with ${SELLER_BRANDS[selectedId].brand} yet.` : live ? "Waiting for the first agent to report…" : "Waiting for the first event…"}</p>
            ) : (
              <ol className="space-y-3">
                {thread.map((m) => (
                  <Bubble key={m.id} m={m} live={live} showTo={selectedId === null} />
                ))}
                {typing.map((t) => (
                  <li key={`typing-${t.id}`} className="flex items-center gap-2.5">
                    <StoreMark id={t.id} size={36} />
                    <p className="flex items-center gap-2 rounded-[18px] rounded-tl-md border border-v3-line bg-v3-surface px-3.5 py-2.5 text-sm font-semibold text-v3-ink2">
                      {t.brand} is replying <TypingDots label={`${t.brand} is replying`} />
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
