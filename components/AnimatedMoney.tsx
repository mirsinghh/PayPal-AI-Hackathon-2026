"use client";

import { AnimatePresence, motion } from "motion/react";
import { formatEur } from "@/shared/format";
import { spring } from "@/lib/motion";

/**
 * Price that rolls when the underlying server value changes (a counter-offer arriving).
 * It renders the new value immediately; the animation is cosmetic and never delays the number.
 */
export function AnimatedMoney({ cents, className = "" }: { cents: number; className?: string }) {
  return (
    <span className={`tabular inline-grid ${className}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={cents}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={spring.snappy}
          className="col-start-1 row-start-1"
        >
          {formatEur(cents)}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
