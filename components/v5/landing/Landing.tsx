import { BaseLink } from "@/components/v3/BaseLink";
import { AgentDPose } from "@/components/v3/mascot/AgentD";
import { HeroScene } from "@/components/v3/home/HeroScene";
import { Chip, btn } from "@/components/v3/ui";
import { BRAND } from "@/shared/brand";
import { IconArrow, IconBolt, IconCheck, IconLock, IconPlay, IconShield, IconTag, IconUser } from "@/components/v3/icons";

/* ---------- Hero ---------- */

const PROMISES = [
  "Nothing is paid until you approve the exact offer.",
  "Four fictional demo stores: no real merchants, no real purchase.",
  "Offers are compared only among those simulated stores, not the whole market.",
  "Payments run on PayPal Sandbox only.",
];

export function V5Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-clip">
      <div aria-hidden className="v3-dots pointer-events-none absolute inset-x-0 top-0 h-[560px] opacity-40 [mask-image:linear-gradient(to_bottom,#000,transparent)]" />
      <div className="relative mx-auto grid w-full max-w-[1240px] gap-12 px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center lg:gap-10 lg:px-8 lg:pb-24 lg:pt-16">
        <div>
          <div className="v3-rise flex flex-wrap gap-2" style={{ ["--i" as string]: 0 }}>
            <Chip tone="primary">AI negotiation agents</Chip>
            <Chip tone="neutral">Demo stores · PayPal Sandbox</Chip>
          </div>
          <h1 id="hero-title" className="v3-display v3-rise mt-5 text-[clamp(2.9rem,1.9rem+5vw,5.4rem)]" style={{ ["--i" as string]: 1 }}>
            Agent D, it always gets you the <span className="v3-hl">best deal.</span>
          </h1>
          <p className="v3-rise mt-6 max-w-[36rem] text-[1.125rem] leading-relaxed text-v3-ink2 text-pretty" style={{ ["--i" as string]: 2 }}>
            Describe what you want to buy. <strong className="text-v3-ink">Agent D</strong> analyses your request, negotiates with four demo-store agents that each play by their own commercial rules, and brings back competing offers to compare. You decide, then pay with PayPal Sandbox.
          </p>
          <p className="v3-rise mt-3 max-w-[36rem] text-sm text-v3-ink2" style={{ ["--i" as string]: 2 }}>
            {BRAND.scope}
          </p>
          <div className="v3-rise mt-8 flex flex-wrap items-center gap-x-4 gap-y-3" style={{ ["--i" as string]: 3 }}>
            <BaseLink to="/brief" className={btn("primary", "lg")}>
              Start Negotiating <IconArrow size={20} />
            </BaseLink>
            <a href="#how" className={btn("secondary", "lg")}>
              <IconPlay size={16} /> See How It Works
            </a>
          </div>
          <ul className="v3-rise mt-8 space-y-2.5 text-[0.95rem] font-semibold text-v3-ink2" style={{ ["--i" as string]: 4 }}>
            {PROMISES.map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-v3-soft text-v3-primary-ink">
                  <IconCheck size={13} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="v3-rise" style={{ ["--i" as string]: 2 }}>
          <HeroScene />
        </div>
      </div>
    </section>
  );
}

/* ---------- How it works ---------- */

const STEPS = [
  { title: "Describe what you want", body: "A sentence and a budget: “wireless headphones under €300”. Add what matters most and any preferences." },
  { title: "Agent D analyses your request", body: "It reads back what it understood, checks the budget and prepares the mission. Nothing is sent to a store yet." },
  { title: "Store agents negotiate", body: "Four demo stores, each with its own strategy and price floor, answer and counter. The server checks every price." },
  { title: "You compare the offers", body: "Prices, delivery, warranty and savings side by side, with a recommendation and the reasons behind it." },
  { title: "You choose and pay", body: "Approve one exact offer, then complete a PayPal Sandbox checkout. Your result lands in your history." },
];

export function V5HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-24 border-y border-v3-line bg-v3-surface py-20">
      <div className="mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8">
        <p className="v3-eyebrow">How it works</p>
        <h2 id="how-title" className="v3-h2 mt-3 max-w-2xl text-[clamp(2rem,1.4rem+2.6vw,3.4rem)]">
          Five steps. <span className="v3-hl">You</span> hold the last one.
        </h2>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="v3-card relative flex flex-col p-5">
              <span aria-hidden className="grid size-10 place-items-center rounded-[12px] bg-v3-primary font-v3-head text-lg font-extrabold text-white">
                {i + 1}
              </span>
              <h3 className="mt-4 font-v3-head text-[1.15rem] font-extrabold leading-tight">{s.title}</h3>
              <p className="mt-2 text-[0.93rem] leading-snug text-v3-ink2">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------- Server vs AI responses ---------- */

const MODES = [
  {
    name: "Server Responses",
    tag: "Deterministic",
    tone: "accent" as const,
    points: ["Replies come from the backend's commercial rules.", "Instant, repeatable, no AI model involved.", "Every store keeps its price floor, discount limit and terms."],
  },
  {
    name: "AI Responses",
    tag: "Real AI models",
    tone: "primary" as const,
    points: ["Each store is its own AI agent with its own strategy and memory.", "Agents can argue, counter and refuse. The server rejects anything outside the store's rules.", "If the AI is unavailable, the screen says so and labels any backup server reply."],
  },
];

export function V5Modes() {
  return (
    <section id="modes" aria-labelledby="modes-title" className="mx-auto w-full max-w-[1240px] scroll-mt-24 px-4 py-20 sm:px-6 lg:px-8">
      <p className="v3-eyebrow">Your choice</p>
      <h2 id="modes-title" className="v3-h2 mt-3 max-w-3xl text-[clamp(2rem,1.4rem+2.6vw,3.4rem)]">
        Two ways for the stores to <span className="v3-hl">reply.</span>
      </h2>
      <p className="mt-4 max-w-2xl text-v3-ink2">You pick before each negotiation and it stays fixed for that run. It only changes who writes the stores&apos; replies: your request analysis works the same either way.</p>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {MODES.map((m) => (
          <article key={m.name} className="v3-card p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-v3-head text-2xl font-extrabold">{m.name}</h3>
              <Chip tone={m.tone}>{m.tag}</Chip>
            </div>
            <ul className="mt-4 space-y-2.5 text-[0.97rem] text-v3-ink2">
              {m.points.map((p) => (
                <li key={p} className="flex items-start gap-2.5">
                  <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-v3-soft text-v3-primary-ink">
                    <IconCheck size={12} />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ---------- Benefits ---------- */

const BENEFITS = [
  { icon: <IconTag size={22} />, title: "Compare offers", body: "Four competing offers side by side instead of tab after tab." },
  { icon: <IconBolt size={22} />, title: "Save time", body: "Agent D does the back-and-forth. You read the result." },
  { icon: <IconShield size={22} />, title: "Explore commercial terms", body: "Price, shipping, delivery and warranty, each checked against the store's rules." },
  { icon: <IconUser size={22} />, title: "Decide with information", body: "Every reply and counteroffer is recorded, and the recommendation comes with its reasons." },
  { icon: <IconLock size={22} />, title: "Pay with PayPal", body: "A PayPal Sandbox checkout for the exact offer you approved." },
];

export function V5Benefits() {
  return (
    <section aria-labelledby="benefits-title" className="mx-auto w-full max-w-[1240px] px-4 pb-4 pt-20 sm:px-6 lg:px-8">
      <p className="v3-eyebrow">Why Agent D</p>
      <h2 id="benefits-title" className="v3-h2 mt-3 max-w-3xl text-[clamp(2rem,1.4rem+2.6vw,3.4rem)]">
        Better-informed deals, <span className="v3-hl">less work.</span>
      </h2>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {BENEFITS.map((b) => (
          <li key={b.title} className="v3-card p-5">
            <span aria-hidden className="grid size-11 place-items-center rounded-[14px] bg-v3-soft text-v3-primary-ink">
              {b.icon}
            </span>
            <h3 className="mt-4 font-v3-head text-lg font-extrabold leading-tight">{b.title}</h3>
            <p className="mt-2 text-[0.93rem] leading-snug text-v3-ink2">{b.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- Final call to action ---------- */

export function V5FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8">
      <div className="relative overflow-clip rounded-v3-xl bg-v3-ink p-8 text-white sm:p-12">
        <div aria-hidden className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(#fff 1.2px, transparent 1.4px)", backgroundSize: "22px 22px" }} />
        <div className="relative flex flex-wrap items-center justify-between gap-8">
          <div className="max-w-xl">
            <h2 id="cta-title" className="v3-display text-[clamp(2.2rem,1.5rem+3vw,3.8rem)] text-white">
              Start your own <span className="text-v3-accent">negotiation.</span>
            </h2>
            <p className="mt-4 text-lg text-white/80">It takes a sentence and a budget. You approve before anything is paid.</p>
            <BaseLink to="/brief" className="v3-btn v3-btn--lg mt-7 bg-v3-accent text-v3-ink shadow-[0_3px_0_#d98a1f] hover:-translate-y-px active:translate-y-0.5 active:shadow-[0_1px_0_#d98a1f]">
              Start Negotiating <IconArrow size={20} />
            </BaseLink>
          </div>
          <span aria-hidden className="hidden rounded-[28px] bg-white/10 p-3 sm:block">
            <AgentDPose sprite="jump" size={180} />
          </span>
        </div>
      </div>
    </section>
  );
}
