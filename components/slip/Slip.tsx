"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { spring } from "@/lib/motion";

/**
 * The deal document. One paper-like object carries the purchase through the whole product:
 * a Brief (home) becomes a Deal slip (review, approved) and finally a Receipt (paid).
 * Same typography, same ruled rows, so the user always recognises "the thing I am buying".
 */
export type SlipStage = "brief" | "drafting" | "ready" | "proposed" | "approved" | "paid";

const TITLE: Record<SlipStage, string> = {
  brief: "Brief",
  drafting: "Deal slip · draft",
  ready: "Deal slip · ready",
  proposed: "Deal slip",
  approved: "Deal slip",
  paid: "Receipt",
};
const STAMP: Record<SlipStage, { text: string; cls: string } | null> = {
  brief: null,
  drafting: { text: "Filling in as stores reply", cls: "border-line-strong text-ink-2" },
  ready: { text: "Ready for your review", cls: "border-primary text-primary" },
  proposed: { text: "Awaiting your approval", cls: "border-line-strong text-ink-2" },
  approved: { text: "Approved by you", cls: "border-primary text-primary" },
  paid: { text: "Paid · Sandbox", cls: "border-success text-success" },
};

export function DealSlip({
  stage,
  reference,
  children,
  footer,
  className = "",
}: {
  stage: SlipStage;
  /** Short document reference, e.g. AD-7F3K2C. Derived from the session id, never an invented order number. */
  reference?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const stamp = STAMP[stage];
  return (
    <article className={`slip relative rounded-lg border border-line-strong bg-surface shadow-xs ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-dashed border-line-strong px-5 py-3">
        <p className="eyebrow">{TITLE[stage]}</p>
        {reference && <p className="eyebrow tabular">{reference}</p>}
      </header>
      <div className="px-5 py-5">{children}</div>
      {(footer || stamp) && (
        <footer className="slip-tear relative px-5 pb-5 pt-5">
          {stamp && (
            <motion.p
              key={stage}
              initial={reduce ? false : { scale: 1.25, opacity: 0, rotate: -6 }}
              animate={{ scale: 1, opacity: 1, rotate: -2 }}
              transition={spring.pop}
              className={`eyebrow mb-4 inline-block rounded-sm border-2 px-2 py-1.5 font-medium ${stamp.cls}`}
            >
              {stamp.text}
            </motion.p>
          )}
          {footer}
        </footer>
      )}
    </article>
  );
}

/** Label ........ value, with a dotted leader (the ledger look). Label and value stay real text for assistive tech. */
export function LedgerRow({ label, value, muted = false }: { label: ReactNode; value: ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 text-small">
      <dt className="shrink-0 text-ink-2">{label}</dt>
      <span aria-hidden className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-line-strong" />
      <dd className={`tabular text-right ${muted ? "text-ink-2" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

/** The amount, set large in the editorial serif. */
export function SlipTotal({ label = "Total", children }: { label?: string; children: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 border-t border-line-strong pt-4">
      <p className="eyebrow pb-2">{label}</p>
      <p className="tabular font-display text-figure">{children}</p>
    </div>
  );
}

/**
 * A row that fills itself in (hero-motion §6.7): a shimmering placeholder until the event that produces the value has
 * happened, then the value swaps in. A changed value re-mounts by key, so it swaps with the same keyframe. Never
 * pre-fill: the causal order (event, then field) is the point.
 */
export function SlotRow({ label, value, muted = false }: { label: ReactNode; value: ReactNode | null; muted?: boolean }) {
  return (
    <LedgerRow
      label={label}
      muted={muted}
      value={
        value === null ? (
          <span role="img" aria-label="Waiting" className="skeleton slot-sk" />
        ) : (
          <span key={typeof value === "string" || typeof value === "number" ? String(value) : undefined} className="swap-in inline-block">
            {value}
          </span>
        )
      }
    />
  );
}
