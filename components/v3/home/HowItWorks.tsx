"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, usePageVisible, useReducedMotionPref } from "@/lib/use-motion-env";
import { formatEur } from "@/shared/format";
import { SAMPLE_NEGOTIATION } from "@/shared/sample-negotiation";
import { SELLER_BRANDS } from "@/shared/sellers";
import { SELLER_IDS } from "@/shared/contracts/types";
import type { AgentDVisualState } from "@/lib/v3/mascot/manifest";
import { usePreloadAgentD } from "@/lib/v3/mascot/hooks";
import { AgentD } from "@/components/v3/mascot/AgentD";
import { Chip, StoreMark } from "@/components/v3/ui";
import { IconCheck, IconLock } from "@/components/v3/icons";

interface StepDef {
  title: string;
  body: string;
  state: AgentDVisualState;
}

const STEPS: StepDef[] = [
  { title: "Tell Agent D what you need", body: "Describe your purchase in plain words: the product, a budget and what matters most. Agent D reads it back so you can fix anything.", state: "thinking" },
  { title: "Agent D explores the offers", body: "It finds the four demo stores and collects each one's opening offer: price, shipping, delivery time and warranty.", state: "searching" },
  { title: "Agent D negotiates", body: "It counters store by store. Every reply, price change and refusal is recorded, so you can follow exactly what happened.", state: "counteroffer" },
  { title: "You review and decide", body: "Agent D recommends one eligible offer and explains why. You approve it, then pay with PayPal Sandbox. Nothing happens without you.", state: "success" },
];

const offer = SAMPLE_NEGOTIATION.offers[0];
const AUTO_MS = 5200;

/** The product in four moves. One Agent D animates at a time; the steps are real buttons you can also click. */
export function HowItWorks() {
  usePreloadAgentD(STEPS.map((s) => s.state));
  const root = useRef<HTMLElement>(null);
  const inView = useInView(root);
  const visible = usePageVisible();
  const reduce = useReducedMotionPref();
  const [active, setActive] = useState(0);
  const [manual, setManual] = useState(false); // once the visitor picks a step, stop auto-advancing

  useEffect(() => {
    if (manual || reduce || !inView || !visible) return;
    const t = window.setTimeout(() => setActive((a) => (a + 1) % STEPS.length), AUTO_MS);
    return () => window.clearTimeout(t);
  }, [active, manual, reduce, inView, visible]);

  const step = STEPS[active];
  return (
    <section ref={root} id="how" aria-labelledby="how-title" data-live={inView && visible} className="scroll-mt-24 border-y border-v3-line bg-v3-surface py-20">
      <div className="mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8">
        <p className="v3-eyebrow">How it works</p>
        <h2 id="how-title" className="v3-h2 mt-3 max-w-2xl text-[clamp(2rem,1.4rem+2.6vw,3.4rem)]">
          Four moves. <span className="v3-hl">You</span> hold the last one.
        </h2>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-stretch">
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <button
                  type="button"
                  aria-current={active === i ? "step" : undefined}
                  onClick={() => {
                    setActive(i);
                    setManual(true);
                  }}
                  className={`group flex w-full gap-4 rounded-v3-lg border p-4 text-left transition-[background-color,border-color,box-shadow] duration-(--v3-d2) sm:p-5 ${
                    active === i ? "border-v3-ink bg-v3-surface shadow-[4px_4px_0_var(--color-v3-ink)]" : "border-v3-line bg-v3-bg hover:border-v3-line-strong hover:bg-v3-soft2"
                  }`}
                >
                  <span aria-hidden className={`grid size-10 shrink-0 place-items-center rounded-[12px] font-v3-head text-lg font-extrabold ${active === i ? "bg-v3-primary text-white" : "bg-v3-soft text-v3-ink"}`}>
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-v3-head text-[1.2rem] font-extrabold leading-tight">{s.title}</span>
                    <span className={`mt-1.5 block text-[0.95rem] leading-snug text-v3-ink2 ${active === i ? "" : "hidden sm:block"}`}>{s.body}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>

          <div className="v3-card v3-scene-sky relative isolate flex min-h-[380px] flex-col overflow-clip p-5 sm:p-7" role="group" aria-label={`Step ${active + 1}: ${step.title}`}>
            <div aria-hidden className="v3-dots absolute inset-0 opacity-50" />
            <div className="relative flex flex-1 flex-col items-center justify-center gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex w-full flex-1 flex-col gap-3" key={active}>
                <StepVisual index={active} />
              </div>
              <div className="flex shrink-0 flex-col items-center">
                <AgentD state={step.state} runKey={active} size={170} label={`Agent D: ${step.title.toLowerCase()}`} />
                <span aria-hidden className="v3-shadow-blob -mt-3" />
              </div>
            </div>
            <Chip tone="neutral" className="relative mt-5 self-start !bg-v3-surface/95 !text-[0.72rem]">
              Illustration · based on a pre-recorded sample
            </Chip>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Mini interface for each step. Static example content, labelled as an illustration in the card. */
function StepVisual({ index }: { index: number }) {
  if (index === 0)
    return (
      <>
        <div className="v3-pop rounded-v3-md border border-v3-line bg-v3-surface p-4 shadow-v3-card">
          <p className="text-xs font-extrabold uppercase tracking-wider text-v3-primary-ink">Your mission</p>
          <p className="mt-1.5 text-[1.05rem] font-semibold">“{SAMPLE_NEGOTIATION.intent.productQuery} under {formatEur(SAMPLE_NEGOTIATION.intent.budgetCents)}”</p>
        </div>
        <div className="v3-rise flex flex-wrap gap-2" style={{ ["--i" as string]: 2 }}>
          <Chip tone="primary">Looking for · headphones</Chip>
          <Chip tone="primary">Budget · up to {formatEur(SAMPLE_NEGOTIATION.intent.budgetCents)}</Chip>
          <Chip tone="primary">Priority · best value</Chip>
        </div>
      </>
    );
  if (index === 1)
    return (
      <ul className="grid grid-cols-2 gap-2.5">
        {SELLER_IDS.map((id, n) => (
          <li key={id} className="v3-pop flex items-center gap-2.5 rounded-v3-md border border-v3-line bg-v3-surface p-2.5 shadow-v3-card" style={{ animationDelay: `${n * 260}ms` }}>
            <StoreMark id={id} size={32} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-extrabold">{SELLER_BRANDS[id].brand}</span>
              <span className="block text-xs text-v3-ink2">Store found</span>
            </span>
          </li>
        ))}
      </ul>
    );
  if (index === 2)
    return (
      <>
        <div className="v3-pop rounded-v3-md border border-v3-line bg-v3-surface p-4 shadow-v3-card">
          <p className="flex items-center gap-2 text-sm font-bold">
            <StoreMark id="nova" size={22} /> {SELLER_BRANDS.nova.brand}
          </p>
          <p className="v3-num mt-2 flex items-baseline gap-3 font-v3-head text-3xl font-extrabold">
            <span className="text-xl text-v3-ink2 line-through">{formatEur(offer.initialPriceCents)}</span>
            <span>{formatEur(offer.finalPriceCents)}</span>
          </p>
        </div>
        <p className="v3-rise rounded-v3-md bg-v3-accent-soft px-3 py-2 text-sm font-semibold text-v3-warn" style={{ ["--i" as string]: 2 }}>
          Counteroffer sent → a lower price came back.
        </p>
      </>
    );
  return (
    <div className="v3-pop rounded-v3-md border border-v3-line bg-v3-surface p-4 shadow-v3-card">
      <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-v3-success">
        <IconCheck size={14} /> Recommended
      </p>
      <p className="mt-1.5 flex items-center gap-2 font-v3-head text-lg font-extrabold">
        <StoreMark id="nova" size={24} /> {SELLER_BRANDS.nova.brand} · <span className="v3-num">{formatEur(offer.finalPriceCents)}</span>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="v3-btn v3-btn--primary v3-btn--sm pointer-events-none select-none" aria-hidden>
          Approve this offer
        </span>
        <Chip icon={<IconLock size={13} />}>PayPal Sandbox next</Chip>
      </div>
    </div>
  );
}
