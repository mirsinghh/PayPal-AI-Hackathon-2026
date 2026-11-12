import { BaseLink } from "@/components/v3/BaseLink";
import { btn } from "@/components/v3/ui";
import { IconArrow, IconCheck, IconPlay } from "@/components/v3/icons";
import { EngineBadge } from "./EngineBadge";
import { HeroScene } from "./HeroScene";

const PROMISES = ["Nothing is paid until you approve the exact offer.", "Four fictional demo stores, no real affiliation.", "Payments run on PayPal Sandbox only."];

/** Asymmetric hero: the promise on the left, Agent D at work on the right. */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-clip">
      <div aria-hidden className="v3-dots pointer-events-none absolute inset-x-0 top-0 h-[560px] opacity-40 [mask-image:linear-gradient(to_bottom,#000,transparent)]" />
      <div className="relative mx-auto grid w-full max-w-[1240px] gap-12 px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center lg:gap-10 lg:px-8 lg:pb-24 lg:pt-16">
        <div>
          <div className="v3-rise" style={{ ["--i" as string]: 0 }}>
            <EngineBadge />
          </div>
          <h1 id="hero-title" className="v3-display v3-rise mt-5 text-[clamp(2.9rem,1.9rem+5vw,5.6rem)]" style={{ ["--i" as string]: 1 }}>
            Agent D finds your next <span className="v3-hl">great deal.</span>
          </h1>
          <p className="v3-rise mt-6 max-w-[34rem] text-[1.125rem] leading-relaxed text-v3-ink2 text-pretty" style={{ ["--i" as string]: 2 }}>
            Tell Agent D what you want to buy. It explores four stores, negotiates for you and brings back one recommended offer. <strong className="text-v3-ink">Your AI agent negotiates. You decide.</strong>
          </p>
          <div className="v3-rise mt-8 flex flex-wrap items-center gap-x-4 gap-y-3" style={{ ["--i" as string]: 3 }}>
            <BaseLink to="/brief" className={btn("primary", "lg")}>
              Start negotiating <IconArrow size={20} />
            </BaseLink>
            <a href="#demo" className={btn("secondary", "lg")}>
              <IconPlay size={16} /> Watch Agent D in action
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
