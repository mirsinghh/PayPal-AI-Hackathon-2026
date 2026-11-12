"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { api, ApiFailure } from "@/lib/api";
import { Notice, Spinner, btn } from "@/components/v3/ui";
import { useAuth } from "./AuthProvider";

/** Only same-site paths are honoured after signing in (no open redirects). */
export const safeNext = (n: string | null): string => (n && /^\/(?!\/)[A-Za-z0-9_\-./?=&]*$/.test(n) && !n.includes("//") && !n.startsWith("/api") ? n : "/profile");

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh, accounts, status } = useAuth();
  const ids = { email: useId(), password: useId() };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const signup = mode === "signup";
  const next = safeNext(params.get("next"));

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await api<{ signedIn?: boolean; needsEmailConfirmation?: boolean }>(`/api/auth/${signup ? "signup" : "login"}`, { method: "POST", body: JSON.stringify({ email, password }) });
      if (signup && res.needsEmailConfirmation) {
        setConfirm(true);
        setBusy(false);
        return;
      }
      await refresh();
      router.push(next);
      router.refresh();
    } catch (e) {
      const f = e as ApiFailure;
      setFieldErrors(f.body?.fieldErrors ?? {});
      setError(f.body?.fieldErrors ? null : f.message);
      setBusy(false);
    }
  }

  if (status === "ready" && !accounts)
    return (
      <Shell title="Accounts are not enabled here">
        <Notice tone="info">This deployment runs without accounts. You can still negotiate and pay with PayPal Sandbox; your activity is kept in this browser only.</Notice>
        <Link href="/brief" className={btn("primary", "lg", "mt-5 w-full")}>
          Start negotiating
        </Link>
      </Shell>
    );

  if (confirm)
    return (
      <Shell title="Check your inbox">
        <Notice tone="success">Your account was created. Confirm your email address from the message we sent, then sign in.</Notice>
        <Link href="/login" className={btn("primary", "lg", "mt-5 w-full")}>
          Go to sign in
        </Link>
      </Shell>
    );

  return (
    <Shell title={signup ? "Create your account" : "Welcome back"}>
      <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label={signup ? "Create account" : "Sign in"}>
        <div>
          <label htmlFor={ids.email} className="mb-1.5 block text-sm font-extrabold">
            Email
          </label>
          <input id={ids.email} type="email" autoComplete="email" inputMode="email" required className="v3-input" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!fieldErrors.email} />
          {fieldErrors.email && (
            <p role="alert" className="mt-1.5 text-sm font-semibold text-v3-danger">
              {fieldErrors.email}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={ids.password} className="mb-1.5 block text-sm font-extrabold">
            Password
          </label>
          <input
            id={ids.password}
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            required
            className="v3-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!fieldErrors.password}
            aria-describedby={`${ids.password}-hint`}
          />
          <p id={`${ids.password}-hint`} role={fieldErrors.password ? "alert" : undefined} className={`mt-1.5 text-xs ${fieldErrors.password ? "font-semibold text-v3-danger" : "text-v3-ink2"}`}>
            {fieldErrors.password ?? (signup ? "At least 8 characters." : "Your password is checked by Supabase Auth and never stored by AgentDeal.")}
          </p>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        <button type="submit" disabled={busy} className={btn("primary", "lg", "w-full")}>
          {busy ? (
            <>
              <Spinner /> {signup ? "Creating…" : "Signing in…"}
            </>
          ) : signup ? (
            "Create account"
          ) : (
            "Sign in"
          )}
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-v3-ink2">
        {signup ? "Already have an account?" : "New to AgentDeal?"}{" "}
        <Link href={`/${signup ? "login" : "signup"}${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-bold text-v3-primary-ink underline underline-offset-4">
          {signup ? "Sign in" : "Create an account"}
        </Link>
      </p>
      <p className="mt-4 text-center text-xs text-v3-ink2">Use a test email for this demo. Payments use PayPal Sandbox only.</p>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-14 sm:py-20">
      <title>{title}</title>
      <div className="v3-card p-6 sm:p-8">
        <p className="v3-eyebrow">AgentDeal account</p>
        <h1 className="v3-h2 mb-6 mt-2 text-[2rem]">{title}</h1>
        {children}
      </div>
    </div>
  );
}
