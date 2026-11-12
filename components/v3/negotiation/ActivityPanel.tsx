"use client";

import { memo, useEffect, useRef } from "react";
import { eventKind } from "@/lib/negotiation-view";
import type { ActivityLine, ActivityTone } from "@/lib/v3/activity";
import { sourceLabel } from "@/lib/v3/activity";
import { SELLER_BRANDS } from "@/shared/sellers";
import type { NegotiationEvent } from "@/shared/contracts/types";
import { AgentDPose } from "@/components/v3/mascot/AgentD";
import { Chip, StoreMark, type ChipTone } from "@/components/v3/ui";
import { IconAlert, IconCheck } from "@/components/v3/icons";

const TONE_CLS: Record<ActivityTone, string> = {
  neutral: "text-v3-ink",
  store: "text-v3-ink",
  good: "text-v3-success",
  notice: "text-v3-warn",
};

/**
 * Agent D's short phrases: one per recorded event, newest first. A reading aid on top of the persisted log below;
 * it never replaces it. `current` is also the polite live region announcing what just happened.
 */
export function ActivityPanel({ current, tone, recent, live }: { current: string; tone: ActivityTone; recent: ActivityLine[]; live: boolean }) {
  const last = recent.slice(-5, -1).reverse(); // the line currently shown is `current`; list what came before
  return (
    <section aria-labelledby="activity-title" className="v3-card p-5">
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid size-11 place-items-center overflow-hidden rounded-[14px] bg-v3-soft">
          <AgentDPose sprite="idle" size={40} />
        </span>
        <div className="min-w-0">
          <h2 id="activity-title" className="font-v3-head text-lg font-extrabold leading-tight">
            Agent D&apos;s activity
          </h2>
          <p className="text-xs font-semibold text-v3-ink2">{live ? "Live: events appear as the server records them" : "Replay of recorded events"}</p>
        </div>
      </div>
      <p role="status" className={`mt-4 text-[1.05rem] font-bold leading-snug ${TONE_CLS[tone]}`}>
        {current}
      </p>
      {last.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-v3-line pt-3">
          {last.map((l) => (
            <li key={l.eventId} className={`flex gap-2 text-sm leading-snug ${l.tone === "notice" ? "text-v3-warn" : "text-v3-ink2"}`}>
              <span aria-hidden className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-current opacity-60" />
              <span>{l.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const formatClock = (atMs: number, live: boolean): string => {
  const s = atMs / 1000;
  return live ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

function Badge({ e }: { e: NegotiationEvent }) {
  const src = sourceLabel(e);
  const chips: { tone: ChipTone; text: string }[] = [];
  if (src === "AI reply") chips.push({ tone: "primary", text: "AI reply" });
  if (src === "Rules fallback") chips.push({ tone: "warn", text: "Rules fallback" });
  if (e.type === "AGENT_FALLBACK") chips.push({ tone: "warn", text: "AI fallback · not a store decision" });
  if (e.type === "OFFER_REJECTED_BY_SERVER") chips.push({ tone: "warn", text: "Server validation · not a store decision" });
  if (e.type === "SELLER_REJECTED") chips.push({ tone: "warn", text: "Set aside by the server's checks" });
  return (
    <>
      {chips.map((c) => (
        <Chip key={c.text} tone={c.tone} className="!text-[0.7rem] !py-0.5">
          {c.text}
        </Chip>
      ))}
    </>
  );
}

/** The persisted negotiation feed, verbatim (`feedText`). This is the record; Agent D's phrases are only a summary of it. */
export const EventLog = memo(function EventLog({ events, live, title = "Negotiation log" }: { events: readonly NegotiationEvent[]; live: boolean; title?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight });
  }, [events.length]);

  return (
    <section aria-labelledby="log-title" className="v3-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="log-title" className="font-v3-head text-lg font-extrabold">
          {title}
        </h2>
        <p className="v3-num text-xs font-semibold text-v3-ink2">
          {events.length} event{events.length === 1 ? "" : "s"}
        </p>
      </div>
      <p className="mt-0.5 text-xs text-v3-ink2">Exactly what the backend recorded.</p>
      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        tabIndex={0}
        aria-label="Negotiation log, scrollable"
        className="mt-3 max-h-[24rem] overflow-y-auto pr-1 lg:max-h-[30rem]"
      >
        {events.length === 0 ? (
          <p className="py-6 text-sm text-v3-ink2">{live ? "Waiting for the first agent to report…" : "Waiting for the first event…"}</p>
        ) : (
          <ol className="space-y-1">
            {events.map((e) => {
              const kind = eventKind(e);
              return (
                <li key={e.eventId} className={`flex gap-3 rounded-v3-md px-2 py-2.5 ${kind === "decision" ? "bg-v3-success-soft" : kind === "warning" ? "bg-v3-warn-soft" : ""}`}>
                  <span className="mt-0.5">
                    {e.sellerId && kind !== "decision" ? (
                      <StoreMark id={e.sellerId} size={26} />
                    ) : kind === "decision" ? (
                      <span aria-hidden className="grid size-[26px] place-items-center rounded-[8px] bg-v3-success text-white">
                        <IconCheck size={15} />
                      </span>
                    ) : kind === "warning" ? (
                      <span aria-hidden className="grid size-[26px] place-items-center rounded-[8px] bg-v3-warn-soft text-v3-warn">
                        <IconAlert size={15} />
                      </span>
                    ) : (
                      <span aria-hidden className="grid size-[26px] place-items-center overflow-hidden rounded-[8px] bg-v3-soft">
                        <AgentDPose sprite="idle" size={24} />
                      </span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.92rem] leading-snug text-pretty">{e.feedText}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-v3-ink2">
                      <span className="v3-num font-semibold">{formatClock(e.atMs, live)}</span>
                      {e.sellerId && <span>{SELLER_BRANDS[e.sellerId].brand}</span>}
                      <Badge e={e} />
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
});
