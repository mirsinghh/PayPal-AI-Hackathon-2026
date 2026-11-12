"use client";

import { useId } from "react";
import type { CheckoutMode } from "@/shared/contracts/types";
import { CHECKOUT_LABEL, CHECKOUT_TAGLINE } from "@/lib/v5/autobuy";

/**
 * Segmented pill switch: [ Manual Checkout | Agent Auto-Buy ].
 * Same pattern as the response-mode switch (native radios: arrow keys, screen readers, a dot besides colour).
 * Agent Auto-Buy is selectable ONLY when the server confirmed it can really charge a saved PayPal method; otherwise it
 * stays visible but disabled, with the real reason, so it is never advertised as something it cannot do.
 */
export function CheckoutModeSwitch({
  value,
  onChange,
  autoAvailable,
  autoChecking,
  autoReason,
  disabled = false,
}: {
  value: CheckoutMode;
  onChange: (m: CheckoutMode) => void;
  autoAvailable: boolean;
  autoChecking: boolean;
  autoReason?: string | null;
  disabled?: boolean;
}) {
  const uid = useId();
  const options: CheckoutMode[] = ["manual", "auto_buy"];
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-1.5 flex w-full items-center justify-between gap-2 text-sm font-extrabold">
        How should Agent D check out?
        <span className="text-xs font-semibold text-v3-ink2">Fixed once you start</span>
      </legend>
      <div className="grid grid-cols-2 gap-1 rounded-full bg-v3-sunken p-1" data-testid="checkout-mode-switch">
        {options.map((m) => {
          const off = m === "auto_buy" && !autoAvailable;
          const on = value === m;
          return (
            <label key={m} className="relative min-w-0">
              <input
                type="radio"
                name={`${uid}-checkout`}
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
                {CHECKOUT_LABEL[m]}
              </span>
            </label>
          );
        })}
      </div>
      <dl className="mt-2.5 space-y-1.5 text-[0.82rem] leading-snug text-v3-ink2">
        {options.map((m) => (
          <div key={m} id={`${uid}-${m}`} className={value === m ? "text-v3-ink" : ""}>
            <dt className="inline font-bold">{CHECKOUT_LABEL[m]}: </dt>
            <dd className="inline">
              {CHECKOUT_TAGLINE[m]}
              {m === "auto_buy" && !autoAvailable && (
                <span className="font-semibold text-v3-warn"> {autoChecking ? "Checking availability…" : `Unavailable right now${autoReason ? `: ${autoReason}` : ""}.`}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </fieldset>
  );
}
