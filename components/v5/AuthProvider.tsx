"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface SessionUser {
  id: string;
  email: string;
  createdAt: string | null;
}

interface AuthState {
  /** "loading" until the first /api/auth/me answer. */
  status: "loading" | "ready";
  user: SessionUser | null;
  /** Are accounts configured on this deployment? */
  accounts: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>({ status: "loading", user: null, accounts: false, refresh: async () => {}, signOut: async () => {} });

export const useAuth = () => useContext(Ctx);

/**
 * Who is signed in, asked from the server (which verifies the httpOnly cookie with Supabase). The browser never holds
 * a token it could read, and nothing here is trusted by the backend: every API call re-verifies the cookie.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: "loading" | "ready"; user: SessionUser | null; accounts: boolean }>({ status: "loading", user: null, accounts: false });

  const refresh = useCallback(
    () =>
      fetch("/api/auth/me", { cache: "no-store" })
        .then((res) => res.json() as Promise<{ available: boolean; user: SessionUser | null }>)
        .then((body) => setState({ status: "ready", user: body.user, accounts: !!body.available }))
        .catch(() => setState((s) => ({ ...s, status: "ready" }))),
    [],
  );

  useEffect(() => {
    // Initial check, then again on window focus: keeps the session alive and notices a sign-out from another tab.
    const check = () => {
      void refresh();
    };
    check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setState((s) => ({ ...s, user: null }));
    }
  }, []);

  const value = useMemo<AuthState>(() => ({ ...state, refresh, signOut }), [state, refresh, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
