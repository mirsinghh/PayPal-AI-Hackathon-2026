import Link from "next/link";
import { SELLER_BRANDS } from "@/shared/sellers";
import { SELLER_IDS } from "@/shared/contracts/types";
import { AgentDPose } from "@/components/v3/mascot/AgentD";
import { Chip, StoreMark, btn } from "@/components/v3/ui";
import { IconArrow, IconBolt, IconCheck, IconLock, IconShield, IconTag, IconUser } from "@/components/v3/icons";
import { TransparencyLedger } from "./TransparencyLedger";

const BENEFITS = [
  { icon: <IconUser size={22} />, title: "You stay in charge", body: "Agent D recommends. Only you approve, and only the exact offer shown to you." },
  { icon: <IconTag size={22} />, title: "Four stores, one agent", body: "One brief, four different strategies: price fighter, fast delivery, premium and hard negotiator." },
  { icon: <IconShield size={22} />, title: "Checked by the server", body: "Every price is validated against store policy and your budget before it can be recommended or paid." },
  { icon: <IconBolt size={22} />, title: "Follow every move", body: "Each reply, counteroffer and refusal is recorded. Agent D’s reactions follow those records, not the other way round." },
];

export function Benefits() {
  return (
    <section aria-labelledby="benefits-title" className="mx-auto w-full max-w-[1240px] px-4 pb-4 sm:px-6 lg:px-8">
      <h2 id="benefits-title" className="sr-only">
        Why Agent D
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {BENEFITS.map((b, i) => (
          <li key={b.title} className="v3-card v3-rise p-6" style={{ ["--i" as string]: i }}>
            <span aria-hidden className="grid size-11 place-items-center rounded-[14px] bg-v3-soft text-v3-primary-ink">
              {b.icon}
            </span>
            <h3 className="mt-4 font-v3-head text-xl font-extrabold leading-tight">{b.title}</h3>
            <p className="mt-2 text-[0.95rem] leading-snug text-v3-ink2">{b.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

const APPROVAL = [
  { pose: "success" as const, tag: "1 · Recommendation", title: "Agent D proposes one offer", body: "The server picked it from the eligible offers. Celebrating is just Agent D being happy; it authorises nothing.", who: "Agent D" },
  { pose: "accept" as const, tag: "2 · Your approval", title: "You approve that exact offer", body: "A deliberate click on the recommended, eligible, unexpired offer. Without it no payment order can be created.", who: "You" },
  { pose: "payment_approved" as const, tag: "3 · Your payment", title: "You pay in PayPal Sandbox", body: "The amount comes from the approved offer on the server. Agent D celebrates only after the payment is verified as completed.", who: "You + PayPal" },
];

export function ApprovalSection() {
  return (
    <section id="approval" aria-labelledby="approval-title" className="mx-auto w-full max-w-[1240px] scroll-mt-24 px-4 py-20 sm:px-6 lg:px-8">
      <p className="v3-eyebrow">Human approval</p>
      <h2 id="approval-title" className="v3-h2 mt-3 max-w-3xl text-[clamp(2rem,1.4rem+2.6vw,3.4rem)]">
        Three separate steps. <span className="v3-hl">Never one</span> click for all.
      </h2>
      <ol className="mt-10 grid gap-5 md:grid-cols-3">
        {APPROVAL.map((a, i) => (
          <li key={a.tag} className="v3-card relative flex flex-col p-6">
            <div className="flex items-center justify-between">
              <Chip tone="primary">{a.tag}</Chip>
              <span aria-hidden className="grid size-14 place-items-center overflow-hidden rounded-[16px] bg-v3-soft2">
                <AgentDPose sprite={a.pose} size={52} />
              </span>
            </div>
            <h3 className="mt-5 font-v3-head text-xl font-extrabold leading-tight">{a.title}</h3>
            <p className="mt-2 flex-1 text-[0.95rem] leading-snug text-v3-ink2">{a.body}</p>
            <p className="mt-4 flex items-center gap-2 text-sm font-bold">
              <span aria-hidden className="grid size-5 place-items-center rounded-full bg-v3-success text-white">
                <IconCheck size={12} />
              </span>
              Decided by: {a.who}
            </p>
            {i < APPROVAL.length - 1 && <span aria-hidden className="absolute -right-3 top-1/2 hidden size-6 -translate-y-1/2 place-items-center rounded-full bg-v3-ink text-white md:grid"><IconArrow size={13} /></span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function PayPalSection() {
  return (
    <section id="paypal" aria-labelledby="paypal-title" className="mx-auto w-full max-w-[1240px] scroll-mt-24 px-4 sm:px-6 lg:px-8">
      <div className="v3-tint grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="v3-eyebrow">PayPal Sandbox</p>
          <h2 id="paypal-title" className="v3-h2 mt-3 text-[clamp(1.9rem,1.4rem+2vw,2.9rem)]">
            Real PayPal checkout. <span className="v3-hl">Fake money.</span>
          </h2>
          <p className="mt-4 max-w-xl text-v3-ink2">
            Orders are created and captured through the PayPal API in Sandbox. The amount is set by the server from the offer you approved, never by the browser, and a payment that cannot be confirmed is shown as unconfirmed, not as paid.
          </p>
        </div>
        <ul className="space-y-3 text-[0.95rem] font-semibold">
          {["Use a PayPal Sandbox personal account, never your real one.", "Capture is idempotent: refreshing or retrying cannot charge twice.", "If PayPal does not answer, Agent D waits. It only celebrates a verified payment."].map((t) => (
            <li key={t} className="flex items-start gap-3 rounded-v3-md bg-v3-surface p-3.5 shadow-v3-card">
              <span aria-hidden className="mt-0.5 text-v3-primary-ink">
                <IconLock size={18} />
              </span>
              {t}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Transparency() {
  return (
    <section aria-labelledby="real-title" className="mx-auto w-full max-w-[1240px] px-4 py-20 sm:px-6 lg:px-8">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="v3-eyebrow">Honest by design</p>
          <h2 id="real-title" className="v3-h2 mt-3 text-[clamp(1.9rem,1.4rem+2vw,2.9rem)]">
            What is <span className="v3-hl">real</span>, what is simulated.
          </h2>
          <ul aria-label="The four demo stores" className="mt-8 grid grid-cols-2 gap-3">
            {SELLER_IDS.map((id) => (
              <li key={id} className="flex items-center gap-2.5 rounded-v3-md border border-v3-line bg-v3-surface p-2.5">
                <StoreMark id={id} size={30} />
                <span className="min-w-0 truncate text-sm font-bold">{SELLER_BRANDS[id].brand}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-v3-ink2">Fictional merchants, not affiliated with any real company.</p>
        </div>
        <TransparencyLedger />
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8">
      <div className="relative overflow-clip rounded-v3-xl bg-v3-ink p-8 text-white sm:p-12">
        <div aria-hidden className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(#fff 1.2px, transparent 1.4px)", backgroundSize: "22px 22px" }} />
        <div className="relative flex flex-wrap items-center justify-between gap-8">
          <div className="max-w-xl">
            <h2 id="cta-title" className="v3-display text-[clamp(2.2rem,1.5rem+3vw,3.8rem)] text-white">
              Send Agent D on a <span className="text-v3-accent">mission.</span>
            </h2>
            <p className="mt-4 text-lg text-white/80">Takes a sentence and a budget. You approve before anything is paid.</p>
            <Link href="/v3/brief" className="v3-btn v3-btn--lg mt-7 bg-v3-accent text-v3-ink shadow-[0_3px_0_#d98a1f] hover:-translate-y-px active:translate-y-0.5 active:shadow-[0_1px_0_#d98a1f]">
              Start negotiating <IconArrow size={20} />
            </Link>
          </div>
          <span aria-hidden className="hidden rounded-[28px] bg-white/10 p-3 sm:block">
            <AgentDPose sprite="jump" size={180} />
          </span>
        </div>
      </div>
      <p className="mt-4 text-center text-sm text-v3-ink2">
        Prefer the original interface?{" "}
        <Link href="/" prefetch={false} className={`${btn("ghost", "sm")} !min-h-0 !px-1 underline`}>
          Open the classic version
        </Link>
      </p>
    </section>
  );
}
