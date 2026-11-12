"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { api, type ApiFailure } from "@/lib/api";
import { MANDATE_AUTHORIZATION_TEXT } from "@/shared/contracts/types";
import { formatEur } from "@/shared/format";
import { mandateLines, type AutoBuyStatus } from "@/lib/v5/autobuy";
import { Chip, Notice, Spinner, btn } from "@/components/v3/ui";
import { IconCheck, IconLock } from "@/components/v3/icons";

/**
 * The Auto-Buy gate and the purchase mandate, in the order the user must satisfy them:
 *   1. signed in to AgentDeal  2. PayPal authorised (PayPal's own consent page)  3. this mandate, confirmed in words.
 * Logging in to AgentDeal never replaces PayPal's authorisation, and the toggle alone is never consent: the checkbox
 * with the exact sentence is. The server re-checks all three; nothing here is trusted.
 */
export function MandatePanel({
  status,
  mission,
  consent,
  onConsent,
  onBeforeLeave,
  onChanged,
  banner,
}: {
  status: AutoBuyStatus;
  mission: { query: string; budgetCents: number | null; conditions: readonly string[] };
  consent: boolean;
  onConsent: (v: boolean) => void;
  /** Called right before the page leaves (login / PayPal) so the brief can be restored on return. */
  onBeforeLeave: () => void;
  /** Re-read the status (after revoking). */
  onChanged: () => void;
  banner: { tone: "success" | "warn" | "danger" | "info"; text: string } | null;
}) {
  const uid = useId();
  const [busy, setBusy] = useState<null | "authorize" | "revoke">(null);
  const [error, setError] = useState<string | null>(null);

  async function authorize() {
    if (busy) return;
    setBusy("authorize");
    setError(null);
    try {
      onBeforeLeave();
      const r = await api<{ alreadyAuthorized: boolean; approveUrl?: string }>("/api/auto-buy/payment-method", { method: "POST" });
      if (r.alreadyAuthorized) {
        onChanged();
        setBusy(null);
        return;
      }
      // PayPal's own page: the buyer logs in and consents THERE. We never see their PayPal credentials.
      if (r.approveUrl) window.location.assign(r.approveUrl);
    } catch (e) {
      setError((e as ApiFailure).message || "Something went wrong.");
      setBusy(null);
    }
  }

  async function revoke() {
    if (busy) return;
    setBusy("revoke");
    setError(null);
    try {
      await api("/api/auto-buy/payment-method", { method: "DELETE" });
      onConsent(false);
      onChanged();
    } catch (e) {
      setError((e as ApiFailure).message || "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const method = status.paymentMethod?.status === "active" ? status.paymentMethod : null;
  const lines = mandateLines(
    { productQuery: mission.query || "What you describe above", budgetCents: mission.budgetCents ?? 0, requiredConditions: mission.conditions, paymentMethodLabel: method?.payerEmail ? `PayPal Sandbox · ${method.payerEmail}` : "PayPal Sandbox", expiresInMinutes: 30 },
    formatEur,
  );
  if (mission.budgetCents === null) lines[1] = { k: "Maximum budget", v: "Set your budget above" };

  return (
    <section aria-labelledby={`${uid}-t`} className="space-y-3 rounded-v3-md border border-v3-line-strong bg-v3-soft2/50 p-4" data-testid="mandate-panel">
      <div className="flex items-center justify-between gap-2">
        <h3 id={`${uid}-t`} className="text-sm font-extrabold">
          Agent Auto-Buy · your authorisation
        </h3>
        <Chip tone="accent">PayPal Sandbox</Chip>
      </div>

      {banner && <Notice tone={banner.tone}>{banner.text}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}

      {!status.signedIn ? (
        <div className="space-y-3">
          <p className="text-sm text-v3-ink2">
            <strong className="text-v3-ink">Step 1 of 3 · Sign in.</strong> Agent Auto-Buy spends on your behalf, so it only works with your Agent D account. Your authorisation is tied to it.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/login?next=/brief" onClick={onBeforeLeave} className={btn("primary", "md")}>
              Sign in to continue
            </Link>
            <Link href="/signup?next=/brief" onClick={onBeforeLeave} className={btn("secondary", "md")}>
              Create an account
            </Link>
          </div>
        </div>
      ) : !method ? (
        <div className="space-y-3">
          <p className="text-sm text-v3-ink2">
            <strong className="text-v3-ink">Step 2 of 3 · Authorise PayPal.</strong> PayPal will ask you, on its own page, to let Agent D charge this PayPal Sandbox account later within the limits you set. Signing in to Agent D does not replace this step. Agent D never sees or stores your PayPal password.
          </p>
          <button type="button" onClick={authorize} disabled={busy !== null} className={btn("primary", "md")}>
            {busy === "authorize" ? (
              <>
                <Spinner /> Opening PayPal…
              </>
            ) : (
              "Authorise PayPal for Agent D"
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Chip tone="success" icon={<IconCheck size={13} />}>
              PayPal authorised
            </Chip>
            <span className="text-v3-ink2">{method.payerEmail ?? "PayPal Sandbox account"}</span>
            <button type="button" onClick={revoke} disabled={busy !== null} className="font-bold text-v3-ink2 underline underline-offset-2 hover:text-v3-ink">
              {busy === "revoke" ? "Revoking…" : "Revoke"}
            </button>
          </p>

          <div>
            <p className="text-sm font-extrabold">Step 3 of 3 · Purchase mandate</p>
            <dl className="mt-2 divide-y divide-dashed divide-v3-line-strong rounded-v3-md border border-v3-line bg-v3-surface px-3 text-[0.85rem]">
              {lines.map((l) => (
                <div key={l.k} className="flex justify-between gap-4 py-2">
                  <dt className="shrink-0 text-v3-ink2">{l.k}</dt>
                  <dd className="min-w-0 text-right font-bold">{l.v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-v3-ink2">Agent D will never go over this budget, never buy an offer that is not eligible or expired, and can buy only once. You can cancel before it buys.</p>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-v3-md border-2 border-v3-ink bg-v3-surface p-3">
            <input type="checkbox" checked={consent} onChange={(e) => onConsent(e.target.checked)} className="mt-1 size-5 shrink-0 accent-[var(--color-v3-primary)]" />
            <span className="text-[0.9rem] font-bold leading-snug">{MANDATE_AUTHORIZATION_TEXT}</span>
          </label>
          <p className="flex items-start gap-2 text-xs text-v3-ink2">
            <IconLock size={14} className="mt-0.5 shrink-0" />
            Sandbox only: no real money moves and the four stores are simulated.
          </p>
        </div>
      )}
    </section>
  );
}
