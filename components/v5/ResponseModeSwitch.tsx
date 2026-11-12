"use client";

import { useId } from "react";
import type { ResponseMode } from "@/shared/contracts/types";
import { MODE_LABEL, MODE_TAGLINE, fallbackReasonLabel, willUseText } from "@/lib/v5/response-mode";

/**
 * Segmented pill switch: [ Server Responses | AI Responses ].
 * Native radios keep it a real radio group (arrow keys, screen readers, form semantics); the selected pill is
 * unmistakable by colour, weight and a dot, never by colour alone. It only chooses who writes the stores' replies;
 * the request analysis is configured separately and is not affected.
 */
export function ResponseModeSwitch({
  value,
  onChange,
  aiAvailable,
  aiReason,
  ai = null,
  disabled = false,
}: {
  value: ResponseMode;
  onChange: (m: ResponseMode) => void;
  aiAvailable: boolean;
  aiReason?: string | null;
  /** Provider and models "AI Agents" will use (from /api/config). */
  ai?: { provider: string; buyer: string | null; seller: string | null } | null;
  disabled?: boolean;
}) {
  const uid = useId();
  const options: ResponseMode[] = ["server", "ai"];
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-1.5 flex w-full items-center justify-between gap-2 text-sm font-extrabold">
        How should the stores reply?
        <span className="text-xs font-semibold text-v3-ink2">Fixed once you start</span>
      </legend>
      <div className="grid grid-cols-2 gap-1 rounded-full bg-v3-sunken p-1" data-testid="response-mode-switch">
        {options.map((m) => {
          const off = m === "ai" && !aiAvailable;
          const on = value === m;
          return (
            <label key={m} className="relative min-w-0">
              <input
                type="radio"
                name={`${uid}-mode`}
                value={m}
                checked={on}
                disabled={off}
                onChange={() => onChange(m)}
                className="peer sr-only"
                aria-describedby={`${uid}-${m}`}
              />
              <span
                className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full px-3 text-center text-[0.85rem] font-bold leading-tight transition-colors duration-(--v3-d1) peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-v3-primary peer-disabled:cursor-not-allowed peer-disabled:opacity-55 ${
                  on ? "bg-v3-primary text-white shadow-v3-card" : "text-v3-ink2 hover:bg-v3-surface hover:text-v3-ink"
                }`}
              >
                <span aria-hidden className={`size-2 shrink-0 rounded-full ${on ? "bg-white" : "border border-v3-line-strong"}`} />
                {MODE_LABEL[m]}
              </span>
            </label>
          );
        })}
      </div>
      <dl className="mt-2.5 space-y-1.5 text-[0.82rem] leading-snug text-v3-ink2">
        {options.map((m) => (
          <div key={m} id={`${uid}-${m}`} className={value === m ? "text-v3-ink" : ""}>
            <dt className="inline font-bold">{MODE_LABEL[m]}: </dt>
            <dd className="inline">
              {MODE_TAGLINE[m]}
              {m === "ai" && !aiAvailable && <span className="font-semibold text-v3-warn"> Unavailable right now ({fallbackReasonLabel(aiReason)}).</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p data-testid="mode-will-use" className="mt-2 text-sm font-bold">
        {willUseText(value, ai, aiAvailable)}
      </p>
      <p className="mt-2 text-xs text-v3-ink2">This only changes how the stores reply. Your request analysis works the same in both modes.</p>
    </fieldset>
  );
}
