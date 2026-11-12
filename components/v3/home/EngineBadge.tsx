"use client";

import { useEngineMode } from "@/lib/v3/use-engine-mode";
import { Chip } from "@/components/v3/ui";

/** Honest label for the engine that is actually running here. */
export function EngineBadge() {
  const { multiAgent, known } = useEngineMode();
  if (!known) return <Chip tone="neutral">Demo stores · PayPal Sandbox</Chip>;
  return multiAgent ? <Chip tone="primary">Live AI agents · demo stores</Chip> : <Chip tone="accent">Rule-based demo · simulated stores</Chip>;
}
