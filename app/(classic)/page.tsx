"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { api, ApiFailure } from "@/lib/api";
import { parseRequest } from "@/lib/request-parse";
import { AI_DEMO_NOTICE, eurosToCents, formatEur } from "@/shared/format";
import { PREFERENCES, PRIORITIES, SELLER_IDS, type Preference, type Priority } from "@/shared/contracts/types";
import { SELLER_BRANDS } from "@/shared/sellers";
import { EXAMPLE_REQUESTS } from "@/shared/products";
import { Badge, Spinner, StatusBanner, arrowNudge, btnLarge, btnPrimary } from "@/components/ui";
import { SampleStage } from "@/components/home/SampleStage";
import { DealSlip, LedgerRow } from "@/components/slip/Slip";
import { Reveal } from "@/components/Reveal";
import { Segmented } from "@/components/Segmented";
import { SplitHeading } from "@/components/SplitHeading";
import { IconArrowRight, IconCheck } from "@/components/icons";
import { SellerMark } from "@/components/SellerMark";

const PRIORITY_LABEL: Record<Priority, string> = {
  lowest_price: "Lowest price",
  fast_delivery: "Fast delivery",
  best_value: "Best value",
};
const PREF_LABEL: Record<Preference, string> = {
  warranty: "Warranty",
  fast_delivery: "Fast delivery",
  free_shipping: "Free shipping",
};

const STEPS = [
  { title: "Describe what you need", body: "Product, budget and what matters most. Plain language is fine." },
  { title: "Your agent negotiates", body: "It talks to four stores and you watch every message and offer as it happens." },
  { title: "You approve, then pay", body: "Review the recommended offer. Nothing is paid until you approve and confirm in PayPal." },
];

const centsToField = (c: number) => (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2));

export default function DiscoverPage() {
  const router = useRouter();
  const ids = { prompt: useId(), budget: useId() };
  const [prompt, setPrompt] = useState("");
  const [budgetInput, setBudgetInput] = useState<string | null>(null); // null = follow what the prompt says
  const [priority, setPriority] = useState<Priority>("best_value");
  const [prefs, setPrefs] = useState<Preference[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const inflight = useRef(false);
  const [multiAgent, setMultiAgent] = useState(false);
  useEffect(() => {
    api<{ multiAgent: boolean }>("/api/config")
      .then((c) => setMultiAgent(c.multiAgent))
      .catch(() => undefined);
  }, []);

  // What the agent will actually be told: derived live so the user can see (and fix) it before sending.
  const parsed = useMemo(() => parseRequest(prompt), [prompt]);
  const query = parsed.query || prompt.trim();
  const budgetField = budgetInput ?? (parsed.budgetCents !== null ? centsToField(parsed.budgetCents) : "");
  const budgetCents = budgetField ? eurosToCents(budgetField) : null;
  const ready = query.length >= 3 && budgetCents !== null && budgetCents >= 5_000 && budgetCents <= 1_000_000;

  function validate() {
    const e: Record<string, string> = {};
    if (query.length < 3) e.productQuery = "Tell your agent what to look for, e.g. “wireless headphones”.";
    else if (query.length > 120) e.productQuery = "Keep the description under 120 characters.";
    if (budgetCents === null || budgetCents < 5_000 || budgetCents > 1_000_000) e.budgetCents = "Enter a budget between €50 and €10,000.";
    return e;
  }

  async function submit() {
    if (inflight.current) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0 || budgetCents === null) return;
    inflight.current = true;
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await api<{ sessionId: string }>("/api/negotiations", {
        method: "POST",
        body: JSON.stringify({
          productQuery: query,
          budgetCents,
          currency: "EUR",
          priority,
          preferences: prefs,
          language: "en",
        }),
      });
      router.push(`/negotiation/${res.sessionId}`);
    } catch (err) {
      const f = err as ApiFailure;
      if (f.body?.fieldErrors) setErrors(f.body.fieldErrors);
      setServerError(
        f.body?.code === "SCENARIO_UNAVAILABLE"
          ? "We couldn't prepare a consistent demo scenario. Try adjusting your budget or product description."
          : f.message,
      );
      inflight.current = false;
      setSubmitting(false);
    }
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    void submit();
  }

  function onPromptKey(ev: KeyboardEvent<HTMLTextAreaElement>) {
    if (ev.key === "Enter" && !ev.shiftKey && !ev.nativeEvent.isComposing) {
      ev.preventDefault();
      void submit();
    }
  }

  const status = submitting
    ? "Briefing your agent…"
    : ready
      ? "Ready. Your agent has what it needs."
      : query.length < 3
        ? "Describe a product to begin."
        : "Add a budget to continue.";

  return (
    <div>
      {/* Hero: the promise on the left, the product working on the right (hero-motion layers A + C + D). */}
      <section aria-label="AgentDeal" className="grid gap-14 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center">
        <div>
          <div data-hero style={{ ["--h" as string]: 0 }}>
            <Badge tone="primary">{multiAgent ? "Live AI agents · demo stores" : "Rule-based demo · simulated stores"}</Badge>
          </div>
          <SplitHeading lines={["Your AI agent negotiates.", "You decide."]} italicFrom={1} className="mt-6 font-display text-display text-balance" />
          <p data-hero style={{ ["--h" as string]: 4 }} className="mt-6 max-w-lg text-[1.0625rem] leading-relaxed text-ink-2 text-pretty">
            Say what you want to buy. Your buyer agent negotiates with four stores for you and brings back one offer to approve.
          </p>
          <div data-hero style={{ ["--h" as string]: 5 }} className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
            <a href="#composer" className={`${btnPrimary} ${btnLarge}`}>
              Start your own negotiation <IconArrowRight size={18} className={arrowNudge} />
            </a>
            <a href="#how" className="text-small font-medium text-ink-2 underline decoration-line-strong underline-offset-4 transition-colors duration-(--d1) hover:text-ink">
              How it works
            </a>
          </div>
          <ul data-hero style={{ ["--h" as string]: 6 }} className="mt-9 hidden space-y-2 sm:block text-small text-ink-2">
            {["Nothing is paid until you approve the exact offer.", "Four fictional demo stores, no real affiliation.", "Payments run on PayPal Sandbox only."].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <span className="text-primary">
                  <IconCheck size={16} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <SampleStage />
      </section>

      {/* Your turn: the conversation, with the brief writing itself. */}
      <section id="composer" aria-labelledby="composer-title" className="mt-24 scroll-mt-24 border-t border-line pt-14">
        <p className="eyebrow">Your turn</p>
        <h2 id="composer-title" className="mt-3 max-w-xl font-display text-[clamp(2rem,1.5rem+2vw,3rem)] leading-[1.05]">
          Now brief <em>your</em> agent.
        </h2>

        <form onSubmit={onSubmit} noValidate aria-label="Shopping request" className="mt-10 grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-start">
          <div>
            {/* The user's turn of the conversation. */}
            <div className="rounded-xl border border-line-strong bg-surface shadow-xs transition-shadow duration-(--d2) focus-within:shadow-pop">
              <div className="flex items-center gap-2 px-5 pt-4">
                <span aria-hidden className="inline-flex size-5 items-center justify-center rounded-full bg-ink text-[0.625rem] font-medium text-white">
                  You
                </span>
                <label htmlFor={ids.prompt} className="eyebrow">
                  What are you looking for?
                </label>
              </div>
              <div className="px-5 pb-4 pt-2">
                <textarea
                  id={ids.prompt}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={onPromptKey}
                  rows={3}
                  maxLength={200}
                  placeholder={EXAMPLE_REQUESTS[0]}
                  aria-invalid={!!errors.productQuery}
                  aria-describedby={errors.productQuery ? `${ids.prompt}-err` : undefined}
                  className="block w-full resize-none bg-transparent text-[1.25rem] leading-7 text-ink placeholder:text-ink-2 focus:outline-none focus-visible:outline-none sm:text-[1.375rem]"
                />
                {errors.productQuery && (
                  <p id={`${ids.prompt}-err`} role="alert" className="mt-1 text-small text-danger">
                    {errors.productQuery}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2" aria-label="Example requests">
                  {EXAMPLE_REQUESTS.slice(1).map((ex) => (
                    <button
                      type="button"
                      key={ex}
                      onClick={() => {
                        setPrompt(ex);
                        setBudgetInput(null);
                      }}
                      className="min-h-9 rounded-md border border-line px-2.5 py-1 text-caption text-ink-2 transition-colors duration-(--d1) hover:border-line-strong hover:bg-subtle hover:text-ink"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-5 border-t border-line px-5 py-5 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
                <div>
                  <label htmlFor={ids.budget} className="mb-1.5 block text-small font-medium">
                    Max budget
                  </label>
                  <div className="relative">
                    <span aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-2">
                      €
                    </span>
                    <input
                      id={ids.budget}
                      inputMode="decimal"
                      autoComplete="off"
                      value={budgetField}
                      onChange={(e) => setBudgetInput(e.target.value)}
                      placeholder="300"
                      aria-invalid={!!errors.budgetCents}
                      aria-describedby={`${ids.budget}-hint`}
                      className="tabular min-h-11 w-full rounded-md border border-control bg-surface pl-7 pr-3 text-body placeholder:text-ink-2 hover:border-ink-2"
                    />
                  </div>
                  <p id={`${ids.budget}-hint`} role={errors.budgetCents ? "alert" : undefined} className={`mt-1.5 text-caption ${errors.budgetCents ? "text-danger" : "text-ink-2"}`}>
                    {errors.budgetCents ?? (budgetInput === null && parsed.budgetCents !== null ? "Taken from your request." : "€50 to €10,000.")}
                  </p>
                </div>

                <div className="space-y-4">
                  <Segmented
                    name="priority"
                    legend="What matters most"
                    fill
                    options={PRIORITIES.map((p) => ({ id: p, label: PRIORITY_LABEL[p] }))}
                    value={priority}
                    onChange={setPriority}
                  />
                  <fieldset>
                    <legend className="mb-1.5 text-small font-medium">
                      Preferences <span className="font-normal text-ink-2">(optional)</span>
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {PREFERENCES.map((p) => {
                        const on = prefs.includes(p);
                        return (
                          <button
                            type="button"
                            key={p}
                            aria-pressed={on}
                            onClick={() => setPrefs(on ? prefs.filter((x) => x !== p) : [...prefs, p])}
                            className={`inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 text-small transition-colors duration-(--d1) ${
                              on ? "border-primary bg-primary-soft font-medium text-primary" : "border-line-strong text-ink-2 hover:bg-subtle hover:text-ink"
                            }`}
                          >
                            {on && <IconCheck size={14} />}
                            {PREF_LABEL[p]}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                </div>
              </div>
            </div>
          </div>

          {/* The agent's turn: the brief fills in as the user types, then goes out as the first page of the deal. */}
          <div className="lg:sticky lg:top-24">
            <p className="eyebrow mb-3 flex items-center gap-2">
              <span aria-hidden className="inline-flex size-5 items-center justify-center rounded-full bg-primary text-white">
                <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <circle cx="10" cy="10" r="2.6" fill="currentColor" stroke="none" />
                  <path d="M3.5 4.5 8 8.4M16.5 4.5 12 8.4M3.5 15.5 8 11.6M16.5 15.5 12 11.6" />
                </svg>
              </span>
              Your agent
            </p>
            <p className="mb-4 font-display text-[1.75rem] leading-[1.1]">{ready ? "Here is what I will negotiate." : "Tell me what you need and I will write the brief."}</p>

            <DealSlip
              stage="brief"
              footer={
                <div className="space-y-3">
                  {serverError && <StatusBanner tone="danger">{serverError}</StatusBanner>}
                  <p aria-live="polite" className="text-caption text-ink-2">
                    {status}
                  </p>
                  <button type="submit" disabled={submitting} className={`${btnPrimary} ${btnLarge} w-full`}>
                    {submitting ? (
                      <>
                        <Spinner /> Starting…
                      </>
                    ) : (
                      <>
                        Start negotiation <IconArrowRight size={18} className={arrowNudge} />
                      </>
                    )}
                  </button>
                </div>
              }
            >
              <dl className="space-y-3">
                <BriefRow label="Looking for" value={query.length >= 3 ? query : null} />
                <BriefRow label="Budget" value={budgetCents !== null ? `up to ${formatEur(budgetCents)}` : null} />
                <BriefRow label="Priority" value={PRIORITY_LABEL[priority]} />
                <BriefRow label="Preferences" value={prefs.length ? prefs.map((p) => PREF_LABEL[p]).join(", ") : "None"} />
                <BriefRow label="Talking to" value="4 demo stores" />
              </dl>
            </DealSlip>
            <p className="mt-4 text-caption text-ink-2">
              {multiAgent
                ? AI_DEMO_NOTICE
                : "Rule-based demo: the four stores, their offers and terms are simulated. No real purchase happens, and payments use PayPal Sandbox."}
            </p>
          </div>
        </form>
      </section>

      {/* How it works, and an honest ledger of what is real and what is simulated. */}
      <section aria-labelledby="how" className="mt-24 grid gap-12 border-t border-line pt-14 lg:grid-cols-2 lg:gap-16">
        <div>
          <p className="eyebrow">How it works</p>
          <h2 id="how" className="mt-3 font-display text-[clamp(2rem,1.5rem+2vw,3rem)] leading-[1.05]">
            You set the brief. <em>Your agent</em> does the haggling.
          </h2>
          <ol className="mt-8 divide-y divide-line border-y border-line">
            {STEPS.map((st, i) => (
              <Reveal as="li" key={st.title} index={i} className="grid grid-cols-[2.25rem_1fr] gap-3 py-5">
                <span className="eyebrow pt-1 text-primary">0{i + 1}</span>
                <div>
                  <h3 className="text-h3 font-semibold">{st.title}</h3>
                  <p className="mt-1.5 text-small text-ink-2">{st.body}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>

        <Reveal>
          <p className="eyebrow">What is real, what is simulated</p>
          <h2 className="mt-3 font-display text-[clamp(2rem,1.5rem+2vw,3rem)] leading-[1.05]">
            Honest <em>by design.</em>
          </h2>
          <dl className="mt-8 divide-y divide-line border-y border-line">
            {TRANSPARENCY(multiAgent).map((r) => (
              <div key={r.k} className="grid grid-cols-[6.5rem_1fr] gap-3 py-4">
                <dt className={`eyebrow pt-1 ${r.real ? "text-success" : "text-ink-2"}`}>{r.real ? "Real" : "Simulated"}</dt>
                <dd>
                  <p className="text-small font-medium">{r.k}</p>
                  <p className="mt-1 text-small text-ink-2 text-pretty">{r.v}</p>
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </section>

      <section aria-labelledby="stores" className="mt-16">
        <h2 id="stores" className="eyebrow">
          The four demo stores
        </h2>
        <ul className="mt-5 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {SELLER_IDS.map((id, i) => {
            const b = SELLER_BRANDS[id];
            return (
              <Reveal as="li" key={id} index={i} className="bg-surface p-5">
                <SellerMark id={id} size={36} />
                <p className="mt-4 text-body font-medium">{b.brand}</p>
                <p className="mt-1 text-small text-ink-2">{b.pitch}</p>
              </Reveal>
            );
          })}
        </ul>
        <p className="mt-3 text-caption text-ink-2">Fictional merchants, not affiliated with any real company.</p>
      </section>
    </div>
  );
}

/** What a judge (or a customer) should be able to rely on, stated plainly. Matches the server code, not the marketing. */
function TRANSPARENCY(multiAgent: boolean): { k: string; v: string; real: boolean }[] {
  return [
    { real: true, k: "PayPal Sandbox payments", v: "Orders are created and captured through the PayPal API. The amount is set on the server from the offer you approved." },
    { real: true, k: "Your approval", v: "The server won't create an order until you approve the exact offer. Approval and PayPal authorization are separate steps." },
    { real: true, k: "Server-side price checks", v: "Every price is validated against the store's policy and your budget before it can be recommended or paid." },
    multiAgent
      ? { real: true, k: "AI agents", v: "The buyer and seller agents are real AI (Google Gemini). Their proposals are validated by the server, and a recorded fallback is shown if a call fails." }
      : { real: false, k: "The negotiation", v: "A deterministic rule engine plays the stores. The sample above is a recorded run of it, and the live screen replays it." },
    { real: false, k: "Stores, stock and delivery", v: "Four fictional merchants with demo inventory. Nothing is shipped, and no real purchase happens." },
  ];
}

/** One ruled line of the brief. Empty values stay quiet until the user provides them. */
function BriefRow({ label, value }: { label: string; value: string | null }) {
  return (
    <LedgerRow
      label={label}
      value={
        value === null ? (
          <span className="text-ink-2">…</span>
        ) : (
          // Re-mounted on change so the value swaps in with the shared CSS keyframe.
          <span key={value} className="swap-in inline-block max-w-[16rem] text-pretty">
            {value}
          </span>
        )
      }
    />
  );
}
