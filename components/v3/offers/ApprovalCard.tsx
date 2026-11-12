"use client";

import { BaseLink } from "@/components/v3/BaseLink";
import { formatEur } from "@/shared/format";
import { SELLER_BRANDS } from "@/shared/sellers";
import { offerName, slipRef } from "@/lib/offer-view";
import type { Offer } from "@/shared/contracts/types";
import { Chip, Notice, Spinner, StoreMark, btn } from "@/components/v3/ui";
import { IconArrow, IconCheck, IconLock } from "@/components/v3/icons";

export type ApprovalState = "ready" | "approving" | "approved";

/**
 * The approval step. It is deliberately its own card with its own button: recommendation, approval and payment are
 * three separate things. Approving moves no money; after it the user chooses to continue to PayPal Sandbox.
 */
export function ApprovalCard({
  sessionId,
  offer,
  state,
  expired,
  paid,
  error,
  live,
  onApprove,
  redirecting = false,
  onStay,
}: {
  sessionId: string;
  offer: Offer;
  state: ApprovalState;
  expired: boolean;
  paid: boolean;
  error: string | null;
  live: boolean;
  onApprove: () => void;
  /** True while Agent D is about to open the checkout automatically (after a server-confirmed approval). */
  redirecting?: boolean;
  onStay?: () => void;
}) {
  const brand = SELLER_BRANDS[offer.sellerId].brand;
  return (
    <section aria-labelledby="approve-title" className="v3-card overflow-hidden border-2 !border-v3-ink shadow-[6px_6px_0_var(--color-v3-ink)]">
      <div className="flex items-center justify-between gap-3 border-b border-dashed border-v3-line-strong bg-v3-soft2 px-5 py-3.5">
        <h2 id="approve-title" className="font-v3-head text-lg font-extrabold">
          Your decision
        </h2>
        <span className="v3-num text-xs font-bold text-v3-ink2">{slipRef(sessionId)}</span>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <StoreMark id={offer.sellerId} size={40} />
          <div className="min-w-0">
            <p className="truncate font-extrabold">{offerName(offer)}</p>
            <p className="text-sm text-v3-ink2">
              {brand} · {live ? "demo store" : "simulated seller"}
            </p>
          </div>
        </div>
        <p className="v3-num font-v3-head text-[2.6rem] font-extrabold leading-none">{formatEur(offer.finalPriceCents)}</p>

        {paid ? (
          <>
            <Notice tone="success">This offer is already paid (Sandbox). Nothing more to do.</Notice>
            <BaseLink to={`/checkout/${sessionId}`} className={btn("secondary", "lg", "w-full")}>
              View the receipt
            </BaseLink>
          </>
        ) : expired ? (
          <Notice tone="warn">This demo offer has expired. Start a new mission to get a fresh one.</Notice>
        ) : state === "approved" ? (
          <>
            <Notice tone="success" title="Approved. You haven’t paid yet.">
              You approved exactly this offer. Next you authorise the payment in PayPal Sandbox; AgentDeal can’t charge you without that second step.
            </Notice>
            {redirecting && (
              <p role="status" className="flex items-center gap-2 rounded-v3-md bg-v3-soft px-3 py-2 text-sm font-bold">
                <Spinner size={16} /> Agent D is preparing your checkout and will open it in a moment…
              </p>
            )}
            <BaseLink to={`/checkout/${sessionId}`} className={btn("primary", "lg", "w-full")}>
              {redirecting ? "Go to checkout now" : "Continue to PayPal payment"} <IconArrow size={20} />
            </BaseLink>
            {redirecting && onStay && (
              <button type="button" onClick={onStay} className={btn("ghost", "sm", "w-full")}>
                Stay on this page
              </button>
            )}
          </>
        ) : (
          <>
            <p className="text-sm leading-snug text-v3-ink2">
              Approving confirms <strong className="text-v3-ink">this exact offer</strong> from {brand}. It does not charge you: you pay in the next step.
            </p>
            {error && <Notice tone="danger">{error}</Notice>}
            <button type="button" onClick={onApprove} disabled={state === "approving"} className={btn("primary", "lg", "w-full")}>
              {state === "approving" ? (
                <>
                  <Spinner /> Approving…
                </>
              ) : (
                <>
                  <IconCheck size={20} /> Approve this offer
                </>
              )}
            </button>
          </>
        )}

        <p className="flex items-start gap-2 border-t border-dashed border-v3-line-strong pt-4 text-xs text-v3-ink2">
          <IconLock size={14} className="mt-0.5 shrink-0" />
          <span>
            Test transaction. Sandbox only moves fake money and nothing will be shipped. <Chip tone="neutral" className="!py-0 !text-[0.68rem]">Step 2 of 3</Chip>
          </span>
        </p>
      </div>
    </section>
  );
}
