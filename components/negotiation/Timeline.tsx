"use client";

import { AnimatePresence, motion } from "motion/react";
import { memo, useEffect, useRef } from "react";
import { eventKind } from "@/lib/negotiation-view";
import { spring } from "@/lib/motion";
import { SELLER_BRANDS } from "@/shared/sellers";
import type { NegotiationEvent, SellerId } from "@/shared/contracts/types";
import { BuyerMark, SellerMark } from "@/components/SellerMark";
import { IconAlert, IconCheck } from "@/components/icons";
import { TypingDots } from "@/components/ui";

function SourceTag({ payload }: { payload: Record<string, unknown> }) {
  const src = payload.source;
  if (src === "gemini" || src === "groq")
    return <span className="rounded-sm border border-primary/25 bg-primary-soft px-1 text-caption font-medium text-primary">AI reply</span>;
  if (src === "rules_fallback")
    return <span className="rounded-sm border border-warning-line bg-warning-soft px-1 text-caption font-medium text-warning">Rules fallback</span>;
  return null;
}

/** "Buyer agent → Zefiro Express": the direction of the message that the graph animates. */
export function directionOf(e: NegotiationEvent): string | null {
  const brand = e.sellerId ? SELLER_BRANDS[e.sellerId].brand : null;
  if (!brand) return null;
  switch (e.type) {
    case "BUYER_MESSAGE":
      return `Buyer agent → ${brand}`;
    case "OFFER_RECEIVED":
    case "COUNTEROFFER_RECEIVED":
      return `${brand} → Buyer agent`;
    case "SELLER_DISCOVERED":
      return `${brand} joined`;
    default:
      return null;
  }
}

export function formatClock(atMs: number, live: boolean): string {
  const s = atMs / 1000;
  return live ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function Actor({ e }: { e: NegotiationEvent }) {
  const kind = eventKind(e);
  if (e.sellerId && kind !== "decision") return <SellerMark id={e.sellerId} size={24} />;
  if (kind === "buyer") return <BuyerMark size={24} />;
  if (kind === "decision")
    return (
      <span aria-hidden className="inline-flex size-6 items-center justify-center rounded-md bg-success text-white">
        <IconCheck size={14} />
      </span>
    );
  if (kind === "warning")
    return (
      <span aria-hidden className="inline-flex size-6 items-center justify-center rounded-md bg-warning-soft text-warning">
        <IconAlert size={14} />
      </span>
    );
  return <span aria-hidden className="inline-flex size-6 items-center justify-center rounded-md bg-subtle" />;
}

const NONE: { id: SellerId; brand: string }[] = [];

/** Plain-language narration of everything the backend has recorded so far. Newest at the bottom, kept in view. */
export const Timeline = memo(function Timeline({
  events,
  live,
  awaiting = NONE,
}: {
  events: NegotiationEvent[];
  live: boolean;
  /** Stores a live agent has asked and that have not replied yet (recorded state; always empty in the simulation). */
  awaiting?: { id: SellerId; brand: string }[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [events.length, awaiting.length]);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-h3 font-semibold">What&apos;s happening</h2>
        <p className="tabular text-caption text-ink-2">
          {events.length} event{events.length === 1 ? "" : "s"}
        </p>
      </div>
      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        className="mt-3 max-h-[22rem] overflow-y-auto pr-1 [mask-image:linear-gradient(to_bottom,transparent_0,#000_14px)] lg:max-h-[34rem]"
      >
        {events.length === 0 ? (
          <p className="py-6 text-small text-ink-2">{live ? "Waiting for the first agent to report…" : "Waiting for the first event…"}</p>
        ) : (
          <ol role="log" aria-label="Negotiation activity" aria-live="polite" className="space-y-1 pt-3">
            <AnimatePresence initial={false}>
              {events.map((e) => {
                const dir = directionOf(e);
                const kind = eventKind(e);
                return (
                  <motion.li
                    key={e.eventId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={spring.soft}
                    className={`flex gap-3 rounded-md px-2 py-2.5 ${kind === "decision" ? "bg-success-soft" : kind === "warning" ? "bg-warning-soft" : ""}`}
                  >
                    <Actor e={e} />
                    <div className="min-w-0 flex-1">
                      <p className="text-small text-ink text-pretty">{e.feedText}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-ink-2">
                        <span className="tabular">{formatClock(e.atMs, live)}</span>
                        {dir && <span>{dir}</span>}
                        {live && <SourceTag payload={e.payload} />}
                      </p>
                    </div>
                  </motion.li>
                );
              })}
              {awaiting.map((a) => (
                <motion.li
                  key={`await-${a.id}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={spring.soft}
                  className="flex items-center gap-3 rounded-md px-2 py-2.5"
                >
                  <SellerMark id={a.id} size={24} />
                  <p className="flex items-center gap-2 text-small text-ink-2">
                    {a.brand} is replying <TypingDots label="Waiting for a reply" />
                  </p>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
      </div>
    </div>
  );
});
