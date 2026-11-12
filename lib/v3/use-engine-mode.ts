"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface EngineMode {
  multiAgent: boolean;
  known: boolean;
  /** V5: can the user pick "AI Responses" right now? Read from the server, never assumed. */
  aiAvailable: boolean;
  aiReason: string | null;
  /** V5: are accounts (Supabase Auth) configured on this deployment? */
  accounts: boolean;
}

/**
 * Which engine this deployment runs, read from the public /api/config (never assumed): `multiAgent` is only true when the
 * server says so. Until the answer arrives `known` is false and screens describe the safe default (rule-based simulation).
 */
export function useEngineMode(): EngineMode {
  const [mode, setMode] = useState<EngineMode>({ multiAgent: false, known: false, aiAvailable: false, aiReason: null, accounts: false });
  useEffect(() => {
    let alive = true;
    api<{ multiAgent: boolean; aiResponses?: { available: boolean; reason: string | null }; accounts?: boolean }>("/api/config")
      .then(
        (c) =>
          alive &&
          setMode({ multiAgent: !!c.multiAgent, known: true, aiAvailable: !!c.aiResponses?.available, aiReason: c.aiResponses?.reason ?? null, accounts: !!c.accounts }),
      )
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return mode;
}
