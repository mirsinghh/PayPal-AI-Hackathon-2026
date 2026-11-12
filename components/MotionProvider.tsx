"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/** Honours the OS "reduce motion" setting for every Motion component (transforms and layout are disabled, fades stay). */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
