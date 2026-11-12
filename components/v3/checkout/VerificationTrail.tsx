import type { TrailState, TrailStep } from "@/lib/v3/trail";
import { IconAlert, IconCheck } from "@/components/v3/icons";

const STATE_LABEL: Record<TrailState, string> = { done: "done", current: "in progress", todo: "not started", warn: "needs attention" };

/**
 * Negotiation finished -> approved by you -> PayPal payment -> capture confirmed. Each step reports only what the
 * server has recorded, as text first (the dot and the colour only reinforce it).
 */
export function VerificationTrail({ steps }: { steps: TrailStep[] }) {
  return (
    <section aria-labelledby="trail-title" className="v3-card p-5">
      <h2 id="trail-title" className="font-v3-head text-lg font-extrabold">
        Verified path
      </h2>
      <ol className="mt-4 space-y-0">
        {steps.map((s, i) => (
          <li key={s.id} className="relative flex gap-3 pb-5 last:pb-0" aria-current={s.state === "current" ? "step" : undefined}>
            {i < steps.length - 1 && <span aria-hidden className={`absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-0.5 ${s.state === "done" ? "bg-v3-success" : "bg-v3-line-strong"}`} />}
            <span
              aria-hidden
              className={`relative grid size-7 shrink-0 place-items-center rounded-full border-2 text-xs font-extrabold ${
                s.state === "done"
                  ? "border-v3-success bg-v3-success text-white"
                  : s.state === "warn"
                    ? "border-v3-warn bg-v3-warn-soft text-v3-warn"
                    : s.state === "current"
                      ? "border-v3-primary bg-v3-soft text-v3-primary-ink"
                      : "border-v3-line-strong bg-v3-surface text-v3-ink2"
              }`}
            >
              {s.state === "done" ? <IconCheck size={14} /> : s.state === "warn" ? <IconAlert size={14} /> : i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[0.95rem] font-extrabold leading-tight">
                {s.title} <span className="sr-only">: {STATE_LABEL[s.state]}</span>
              </p>
              <p className={`mt-0.5 text-sm leading-snug ${s.state === "warn" ? "font-semibold text-v3-warn" : "text-v3-ink2"}`}>{s.detail}</p>
              {s.evidence.length > 0 && (
                <dl className="mt-2 space-y-1 rounded-v3-md bg-v3-soft2 p-2.5 text-xs">
                  {s.evidence.map((e) => (
                    <div key={e.label} className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-3">
                      <dt className="text-v3-ink2">{e.label}</dt>
                      <dd className="break-all font-semibold sm:text-right">{e.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
