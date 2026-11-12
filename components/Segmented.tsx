"use client";

import { LayoutGroup, motion } from "motion/react";
import { useId } from "react";
import { spring } from "@/lib/motion";

/**
 * Radio group rendered as a segmented control with one pill that slides to the selected option
 * (SKILL §2.6). Native radios stay in the DOM (visually hidden), so keyboard, arrows and screen readers
 * behave exactly as a normal radio group; focus-visible shows on the option just like hover would.
 */
export function Segmented<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  fill = false,
  hideLegend = false,
}: {
  name: string;
  legend: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  /** Stretch to equal columns (mobile forms). */
  fill?: boolean;
  hideLegend?: boolean;
}) {
  const uid = useId();
  return (
    <fieldset>
      <legend className={hideLegend ? "sr-only" : "mb-1.5 text-small font-medium"}>{legend}</legend>
      <LayoutGroup id={uid}>
        <div className={`gap-1 rounded-md bg-subtle p-1 ${fill ? "grid w-full grid-cols-3 sm:inline-flex sm:w-auto" : "inline-flex"}`}>
          {options.map((o) => {
            const on = value === o.id;
            return (
              <label
                key={o.id}
                className={`relative flex min-h-11 cursor-pointer items-center justify-center rounded-[5px] px-2 text-center text-small leading-tight transition-colors duration-(--d1) ease-out-soft has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus sm:min-h-10 sm:px-4 ${
                  on ? "font-medium text-ink" : "text-ink-2 hover:text-ink"
                }`}
              >
                {on && <motion.span layoutId="segment-pill" transition={spring.snappy} className="absolute inset-0 rounded-[5px] bg-surface shadow-xs" />}
                <input type="radio" name={name} checked={on} onChange={() => onChange(o.id)} className="sr-only" />
                <span className="relative">{o.label}</span>
              </label>
            );
          })}
        </div>
      </LayoutGroup>
    </fieldset>
  );
}
