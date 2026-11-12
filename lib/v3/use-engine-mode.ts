"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * Which engine this deployment runs, read from the public /api/config (never assumed): `multiAgent` is only true when the
 * server says so. Until the answer arrives `known` is false and screens describe the safe default (rule-based simulation).
 */
export function useEngineMode(): { multiAgent: boolean; known: boolean } {
  const [mode, setMode] = useState({ multiAgent: false, known: false });
  useEffect(() => {
    let alive = true;
    api<{ multiAgent: boolean }>("/api/config")
      .then((c) => alive && setMode({ multiAgent: !!c.multiAgent, known: true }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return mode;
}
