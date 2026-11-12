"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AutoBuyStatus } from "./autobuy";

/**
 * Whether Agent Auto-Buy is really available, read from the server (which asks PayPal). Until the answer arrives
 * `known` is false and Auto-Buy is not offered: it is never assumed.
 */
export function useAutoBuyStatus(): { status: AutoBuyStatus | null; known: boolean; refresh: () => Promise<void> } {
  const [status, setStatus] = useState<AutoBuyStatus | null>(null);
  const [known, setKnown] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setStatus(await api<AutoBuyStatus>("/api/auto-buy/status", { cache: "no-store" }));
    } catch {
      setStatus(null);
    }
    setKnown(true);
  }, []);
  useEffect(() => {
    let alive = true;
    api<AutoBuyStatus>("/api/auto-buy/status", { cache: "no-store" })
      .then((s) => alive && setStatus(s))
      .catch(() => undefined)
      .finally(() => alive && setKnown(true));
    return () => {
      alive = false;
    };
  }, []);
  return { status, known, refresh };
}
