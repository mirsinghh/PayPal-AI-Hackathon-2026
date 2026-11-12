"use client";
import { useEffect, useState } from "react";
import type { ApiError, NegotiationSession } from "@/shared/contracts/types";

export type SessionWithPayment = NegotiationSession & {
  payment: { orderId: string | null; captureId: string | null; status: string; amountCents: number; currency: string } | null;
};

export class ApiFailure extends Error {
  constructor(
    public status: number,
    public body: ApiError | null,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  } catch {
    throw new ApiFailure(0, null, "We couldn't reach the server. Check your connection.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiFailure(res.status, body, body?.message ?? "Something went wrong.");
  return body as T;
}

/** Loads a session; while a live multi-agent run is still negotiating it polls the persisted events. */
export function useSession(id: string) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; error: ApiFailure } | { status: "ready"; data: SessionWithPayment }
  >({ status: "loading" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      api<SessionWithPayment>(`/api/negotiations/${encodeURIComponent(id)}`)
        .then((data) => {
          if (!alive) return;
          setState({ status: "ready", data });
          if (data.status === "negotiating") timer = setTimeout(load, 1000);
        })
        .catch((error: ApiFailure) => alive && setState({ status: "error", error }));
    load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [id, nonce]);

  return { state, reload: () => (setState({ status: "loading" }), setNonce((n) => n + 1)) };
}
