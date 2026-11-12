"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { api, ApiFailure } from "@/lib/api";
import { PREFERENCES, PRIORITIES, type Preference, type Priority, type ResponseMode } from "@/shared/contracts/types";
import { AI_DEMO_NOTICE } from "@/shared/format";
import { EXAMPLE_REQUESTS } from "@/shared/products";
import { PREF_LABEL, PRIORITY_LABEL, deriveMission, readBack, toIntent } from "@/lib/v3/brief";
import { useAppBase } from "@/lib/v3/base";
import { useEngineMode } from "@/lib/v3/use-engine-mode";
import { rememberNegotiation } from "@/lib/v3/history";
import { useAgentDirector, usePreloadAgentD } from "@/lib/v3/mascot/hooks";
import { AgentDActor } from "@/components/v3/mascot/AgentD";
import { Chip, Notice, Spinner, btn } from "@/components/v3/ui";
import { IconArrow, IconCheck } from "@/components/v3/icons";
import { ResponseModeSwitch } from "@/components/v5/ResponseModeSwitch";

/**
 * "Tell Agent D": the same extraction as the classic brief, presented as handing a mission to your agent.
 * Agent D listens while you type (a thinking reaction per burst), reads back only what it understood, and the mission
 * card stays fully editable. Nothing here changes what is sent: POST /api/negotiations with the same intent contract.
 */
export function BriefExperience() {
  usePreloadAgentD(["idle", "thinking", "surprised"]);
  const router = useRouter();
  const base = useAppBase();
  const ids = { prompt: useId(), query: useId(), budget: useId() };
  const { aiAvailable, aiReason } = useEngineMode();
  // The user picks who writes the stores' replies before starting. Server Responses is the safe default.
  const [responseMode, setResponseMode] = useState<ResponseMode>("server");
  const effectiveMode: ResponseMode = responseMode === "ai" && !aiAvailable ? "server" : responseMode;
  const agent = useAgentDirector("idle");

  const [prompt, setPrompt] = useState("");
  const [queryOverride, setQueryOverride] = useState<string | null>(null);
  const [budgetOverride, setBudgetOverride] = useState<string | null>(null);
  const [priority, setPriority] = useState<Priority>("best_value");
  const [prefs, setPrefs] = useState<Preference[]>([]);
  const [touched, setTouched] = useState(false); // show validation only after a first attempt
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const inflight = useRef(false);
  const lastListen = useRef(0);

  const mission = useMemo(() => deriveMission({ prompt, queryOverride, budgetOverride, priority, preferences: prefs }), [prompt, queryOverride, budgetOverride, priority, prefs]);
  const errors = { ...(touched ? mission.errors : {}), ...fieldErrors };

  /** Agent D leans in while the user types: one short thinking reaction per burst, never one per keystroke. */
  function listen() {
    const now = Date.now();
    if (now - lastListen.current < 900) return;
    lastListen.current = now;
    agent.react({ key: `listen:${now}`, state: "thinking", cycles: 2 });
  }

  async function submit() {
    if (inflight.current) return;
    setTouched(true);
    setFieldErrors({});
    if (!mission.ready) {
      agent.react({ key: `invalid:${Date.now()}`, state: "surprised" });
      return;
    }
    inflight.current = true;
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await api<{ sessionId: string }>("/api/negotiations", { method: "POST", body: JSON.stringify({ ...toIntent(mission, priority, prefs), responseMode: effectiveMode }) });
      // Local demo history (this browser only): the id, the request and the budget. No payment or secret data.
      rememberNegotiation({ sessionId: res.sessionId, createdAt: new Date().toISOString(), query: mission.query, budgetCents: mission.budgetCents as number });
      router.push(`${base}/negotiation/${res.sessionId}`);
    } catch (err) {
      const f = err as ApiFailure;
      if (f.body?.fieldErrors) setFieldErrors(f.body.fieldErrors);
      setServerError(
        f.body?.code === "SCENARIO_UNAVAILABLE" ? "We couldn't prepare a consistent demo scenario. Try adjusting your budget or product description." : f.message,
      );
      agent.react({ key: `error:${Date.now()}`, state: "surprised" });
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

  const status = submitting ? "Sending Agent D on the mission…" : mission.ready ? "Mission ready. Agent D has what it needs." : mission.query.length < 3 ? "Describe a product to begin." : "Add a budget to continue.";

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <title>Tell Agent D</title>
      <form onSubmit={onSubmit} noValidate aria-label="Your mission for Agent D" className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start lg:gap-14">
        {/* Left: the conversation. */}
        <div>
          <div className="flex items-end gap-4 sm:gap-6">
            <div className="flex shrink-0 flex-col items-center">
              <AgentDActor director={agent.handle} size={150} label="Agent D, listening" priority />
              <span aria-hidden className="v3-shadow-blob -mt-3" />
            </div>
            <div className="min-w-0 pb-6">
              <p className="v3-eyebrow">Tell Agent D</p>
              <h1 className="v3-display mt-2 text-[clamp(2.2rem,1.4rem+3.6vw,4.2rem)]">
                What are we <span className="v3-hl">hunting</span> for today?
              </h1>
            </div>
          </div>

          {/* Your turn */}
          <div className="mt-6 rounded-v3-xl border-2 border-v3-ink bg-v3-surface shadow-[5px_5px_0_var(--color-v3-ink)] transition-shadow duration-(--v3-d2) focus-within:shadow-[5px_5px_0_var(--color-v3-primary)]">
            <div className="flex items-center gap-2.5 px-5 pt-4">
              <span aria-hidden className="grid size-6 place-items-center rounded-full bg-v3-ink text-[0.65rem] font-extrabold text-white">
                You
              </span>
              <label htmlFor={ids.prompt} className="text-sm font-extrabold">
                Describe it in your own words
              </label>
            </div>
            <div className="px-5 pb-4 pt-2">
              <textarea
                id={ids.prompt}
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setFieldErrors({});
                  listen();
                }}
                onKeyDown={onPromptKey}
                rows={3}
                maxLength={200}
                placeholder={EXAMPLE_REQUESTS[0]}
                aria-invalid={!!errors.productQuery}
                aria-describedby={errors.productQuery ? `${ids.prompt}-err` : `${ids.prompt}-hint`}
                className="block w-full resize-none bg-transparent text-[1.3rem] font-medium leading-snug text-v3-ink placeholder:text-v3-ink2 placeholder:opacity-70 focus:outline-none focus-visible:outline-none sm:text-[1.5rem]"
              />
              <p id={`${ids.prompt}-hint`} className="mt-1 text-xs text-v3-ink2">
                Press Enter to start, Shift+Enter for a new line.
              </p>
              {errors.productQuery && (
                <p id={`${ids.prompt}-err`} role="alert" className="mt-1 text-sm font-semibold text-v3-danger">
                  {errors.productQuery}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Example missions">
                {EXAMPLE_REQUESTS.slice(1).map((ex) => (
                  <button
                    type="button"
                    key={ex}
                    onClick={() => {
                      setPrompt(ex);
                      setQueryOverride(null);
                      setBudgetOverride(null);
                      setFieldErrors({});
                      agent.react({ key: `example:${Date.now()}`, state: "thinking", cycles: 2 });
                    }}
                    className="min-h-11 rounded-full border border-v3-line-strong bg-v3-bg px-3.5 py-1.5 text-sm font-semibold text-v3-ink2 transition-colors duration-(--v3-d1) hover:border-v3-control hover:bg-v3-soft2 hover:text-v3-ink"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Agent D's turn: reads back only what it understood. */}
          <div className="mt-5 flex items-start gap-3">
            <span aria-hidden className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-v3-primary text-[0.65rem] font-extrabold text-white">
              D
            </span>
            <p role="status" aria-live="polite" className="v3-bubble !shadow-none">
              {readBack(mission)}
            </p>
          </div>
        </div>

        {/* Right: the mission card, always editable. */}
        <aside aria-labelledby="mission-title" className="lg:sticky lg:top-24">
          <div className="v3-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-dashed border-v3-line-strong bg-v3-soft2 px-5 py-4">
              <h2 id="mission-title" className="font-v3-head text-xl font-extrabold">
                Your mission
              </h2>
              <Chip tone={mission.ready ? "success" : "neutral"} icon={mission.ready ? <IconCheck size={13} /> : undefined}>
                {mission.ready ? "Ready" : "Draft"}
              </Chip>
            </div>

            <div className="space-y-5 p-5">
              <div>
                <label htmlFor={ids.query} className="mb-1.5 flex items-center justify-between text-sm font-extrabold">
                  Looking for
                  {mission.queryFromPrompt && mission.query.length >= 3 && <span className="text-xs font-semibold text-v3-ink2">from your sentence</span>}
                </label>
                <input
                  id={ids.query}
                  className="v3-input"
                  value={mission.query}
                  onChange={(e) => setQueryOverride(e.target.value === "" ? null : e.target.value)}
                  placeholder="e.g. Running shoes"
                  maxLength={120}
                  aria-invalid={!!errors.productQuery}
                  autoComplete="off"
                />
              </div>

              <div>
                <label htmlFor={ids.budget} className="mb-1.5 flex items-center justify-between text-sm font-extrabold">
                  Maximum budget
                  {mission.budgetFromPrompt && mission.budgetCents !== null && <span className="text-xs font-semibold text-v3-ink2">from your sentence</span>}
                </label>
                <div className="relative">
                  <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-v3-ink2">
                    €
                  </span>
                  <input
                    id={ids.budget}
                    inputMode="decimal"
                    autoComplete="off"
                    className="v3-input v3-input--prefix v3-num"
                    value={mission.budgetField}
                    onChange={(e) => {
                      setBudgetOverride(e.target.value);
                      setFieldErrors({});
                    }}
                    placeholder="300"
                    aria-invalid={!!errors.budgetCents}
                    aria-describedby={`${ids.budget}-hint`}
                  />
                </div>
                <p id={`${ids.budget}-hint`} role={errors.budgetCents ? "alert" : undefined} className={`mt-1.5 text-xs ${errors.budgetCents ? "font-semibold text-v3-danger" : "text-v3-ink2"}`}>
                  {errors.budgetCents ?? "Between €50 and €10,000. Agent D will never go over it."}
                </p>
              </div>

              <fieldset>
                <legend className="mb-1.5 text-sm font-extrabold">What matters most</legend>
                <div className="grid grid-cols-3 gap-1.5 rounded-v3-md bg-v3-sunken p-1">
                  {PRIORITIES.map((p) => (
                    <label key={p} className="relative">
                      <input type="radio" name="priority" value={p} checked={priority === p} onChange={() => setPriority(p)} className="peer sr-only" />
                      <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-[10px] px-2 text-center text-[0.82rem] font-bold leading-tight text-v3-ink2 transition-colors duration-(--v3-d1) peer-checked:bg-v3-surface peer-checked:text-v3-ink peer-checked:shadow-v3-card peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-v3-primary">
                        {PRIORITY_LABEL[p]}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-1.5 text-sm font-extrabold">
                  Preferences <span className="font-semibold text-v3-ink2">(optional)</span>
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
                        className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-bold transition-colors duration-(--v3-d1) ${
                          on ? "border-v3-primary bg-v3-soft text-v3-ink" : "border-v3-line-strong bg-v3-surface text-v3-ink2 hover:bg-v3-soft2 hover:text-v3-ink"
                        }`}
                      >
                        {on && <IconCheck size={14} />}
                        {PREF_LABEL[p]}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="border-t border-dashed border-v3-line-strong pt-5">
                <ResponseModeSwitch value={effectiveMode} onChange={setResponseMode} aiAvailable={aiAvailable} aiReason={aiReason} disabled={submitting} />
              </div>

              <p className="border-t border-dashed border-v3-line-strong pt-4 text-sm text-v3-ink2">
                Agent D will talk to <strong className="text-v3-ink">4 demo stores</strong>.
              </p>
            </div>

            <div className="space-y-3 border-t border-v3-line bg-v3-soft2/60 p-5">
              {serverError && <Notice tone="danger">{serverError}</Notice>}
              <p aria-live="polite" className="text-sm font-semibold text-v3-ink2">
                {status}
              </p>
              <button type="submit" disabled={submitting} className={btn("primary", "lg", "w-full")}>
                {submitting ? (
                  <>
                    <Spinner /> Starting…
                  </>
                ) : (
                  <>
                    Start negotiating <IconArrow size={20} />
                  </>
                )}
              </button>
            </div>
          </div>
          <p className="mt-4 text-xs text-v3-ink2">
            {effectiveMode === "ai" ? AI_DEMO_NOTICE : "Rule-based demo: the four stores, their offers and terms are simulated. No real purchase happens, and payments use PayPal Sandbox."}
          </p>
        </aside>
      </form>
    </div>
  );
}
