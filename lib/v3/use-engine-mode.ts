"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AiIssue } from "@/shared/contracts/types";

export interface EngineMode {
  multiAgent: boolean;
  known: boolean;
  /** V5: can the user pick "AI Agents" right now? Read from the server, never assumed. */
  aiAvailable: boolean;
  aiReason: string | null;
  /** Why AI is unavailable when it is a provider problem (limit, outage, credentials). `retryAfterMs` only if the provider said so. */
  aiIssue: AiIssue | null;
  /** Provider and models that "AI Agents" will use, e.g. { provider: "groq", buyer: "openai/gpt-oss-120b", seller: "openai/gpt-oss-20b" }. */
  ai: { provider: string; buyer: string | null; seller: string | null } | null;
  /** V5: are accounts (Supabase Auth) configured on this deployment? */
  accounts: boolean;
}

interface ConfigBody {
  multiAgent: boolean;
  provider?: string;
  models?: { buyer: string | null; seller: string | null };
  aiResponses?: { available: boolean; reason: string | null; issue?: AiIssue | null };
  accounts?: boolean;
}

const UNKNOWN: EngineMode = { multiAgent: false, known: false, aiAvailable: false, aiReason: null, aiIssue: null, ai: null, accounts: false };

/**
 * Which engine this deployment runs, read from the public /api/config (never assumed): `multiAgent` is only true when the
 * server says so. Until the answer arrives `known` is false and screens describe the safe default (rule-based simulation).
 * `refresh` asks again (the "Try AI again" button).
 */
export function useEngineMode(): EngineMode & { refresh: () => Promise<void> } {
  const [mode, setMode] = useState<EngineMode>(UNKNOWN);
  const apply = useCallback(
    (c: ConfigBody): EngineMode => ({
      multiAgent: !!c.multiAgent,
      known: true,
      aiAvailable: !!c.aiResponses?.available,
      aiReason: c.aiResponses?.reason ?? null,
      aiIssue: c.aiResponses?.issue ?? null,
      ai: c.provider ? { provider: c.provider, buyer: c.models?.buyer ?? null, seller: c.models?.seller ?? null } : null,
      accounts: !!c.accounts,
    }),
    [],
  );
  const refresh = useCallback(async () => {
    try {
      setMode(apply(await api<ConfigBody>("/api/config", { cache: "no-store" })));
    } catch {
      /* keep what we had */
    }
  }, [apply]);
  useEffect(() => {
    let alive = true;
    api<ConfigBody>("/api/config", { cache: "no-store" })
      .then((c) => alive && setMode(apply(c)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [apply]);
  return { ...mode, refresh };
}
