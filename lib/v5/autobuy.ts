import type { CheckoutMode, MandateStatus, PublicMandate } from "@/shared/contracts/types";

/** Wording and pure view-models for Agent Auto-Buy. No fetching and no React here, so every rule is unit-testable. */

export const CHECKOUT_LABEL: Record<CheckoutMode, string> = { manual: "Manual Checkout", auto_buy: "Agent Auto-Buy" };

export const CHECKOUT_TAGLINE: Record<CheckoutMode, string> = {
  manual: "You review the deal and approve the payment.",
  auto_buy: "Set your limits. Agent D negotiates and purchases automatically when authorised.",
};

/** What /api/auto-buy/status says. Auto-Buy is selectable only when `available` is true. */
export interface AutoBuyStatus {
  accounts: boolean;
  signedIn: boolean;
  available: boolean;
  blocker: string | null;
  reason: string | null;
  paymentMethod: { methodId: string; status: string; payerEmail: string | null; createdAt: string; verifiedAt: string | null } | null;
}

/** The ordered stages shown while Agent D buys. The first three already happened in the negotiation room. */
export const RUN_STEPS = [
  { id: "searching", label: "Searching offers" },
  { id: "negotiating", label: "Negotiating" },
  { id: "evaluating", label: "Evaluating" },
  { id: "mandate", label: "Checking purchase mandate" },
  { id: "preparing", label: "Preparing payment" },
  { id: "processing", label: "Processing PayPal Sandbox payment" },
  { id: "confirmed", label: "Capture confirmed" },
] as const;
export type RunStepId = (typeof RUN_STEPS)[number]["id"];
export type StepState = "done" | "active" | "pending" | "failed";

export interface RunSnapshot {
  /** "countdown": waiting to start; "running": request in flight; "settled": the server gave a final or paused answer. */
  phase: "countdown" | "running" | "settled";
  /** What the server last recorded (mandate evidence while running, the execute result when settled). */
  mandateStatus: MandateStatus | null;
  paymentStatus: string | null;
  outcome: string | null;
}

/**
 * Which stage each step is in. A step is "done" only because the server recorded it:
 *  - preparing starts when the mandate was claimed (`executing`) and a payment attempt exists;
 *  - confirmed only when the payment record itself is `completed` (verified capture).
 */
export function stepStates(s: RunSnapshot): Record<RunStepId, StepState> {
  const out: Record<RunStepId, StepState> = { searching: "done", negotiating: "done", evaluating: "done", mandate: "pending", preparing: "pending", processing: "pending", confirmed: "pending" };
  const verified = s.paymentStatus === "completed" && (s.mandateStatus === "executed" || s.outcome === "completed");
  if (verified) return { ...out, mandate: "done", preparing: "done", processing: "done", confirmed: "done" };

  if (s.phase === "countdown") return out;
  if (s.phase === "running") {
    if (s.mandateStatus === "executing" || s.mandateStatus === "pending_reconciliation") {
      const processing = s.paymentStatus === "approval_pending" || s.paymentStatus === "capturing" || s.paymentStatus === "unknown_pending_reconciliation";
      return { ...out, mandate: "done", preparing: processing ? "done" : "active", processing: processing ? "active" : "pending" };
    }
    return { ...out, mandate: "active" };
  }

  // Settled without a verified capture: show exactly where it stopped.
  switch (s.outcome) {
    case "waiting":
    case "in_progress":
      return { ...out, mandate: "active" };
    case "blocked":
    case "expired":
    case "cancelled":
      return { ...out, mandate: "failed" };
    case "failed":
      // PayPal refused before anything was captured: mandate passed, payment did not.
      return { ...out, mandate: "done", preparing: "done", processing: "failed" };
    case "uncertain":
      return { ...out, mandate: "done", preparing: "done", processing: "active" };
    default:
      return out;
  }
}

export interface OutcomeNotice {
  tone: "success" | "info" | "warn" | "danger";
  title: string;
  text: string;
}

/** Plain-language result. It never says "paid" for anything but a verified capture. */
export function outcomeNotice(outcome: string | null, message: string | null, code: string | null): OutcomeNotice | null {
  switch (outcome) {
    case "completed":
      return { tone: "success", title: "Purchase confirmed", text: "PayPal Sandbox captured exactly the amount of the offer, and the server verified it." };
    case "blocked":
      return { tone: "warn", title: "Agent D did not buy", text: `${message ?? "The offer did not satisfy your authorisation."} Nothing was charged.${code ? ` (${code.toLowerCase().replace(/_/g, " ")})` : ""}` };
    case "failed":
      return { tone: "danger", title: "The payment did not go through", text: message ?? "PayPal did not complete the payment. Nothing was charged." };
    case "uncertain":
      return { tone: "warn", title: "Waiting for PayPal to confirm", text: message ?? "PayPal has not confirmed the result yet, so this is not a confirmed payment." };
    case "cancelled":
      return { tone: "info", title: "Authorisation cancelled", text: message ?? "You cancelled this authorisation, so Agent D did not buy anything." };
    case "expired":
      return { tone: "warn", title: "Authorisation expired", text: message ?? "The authorisation expired before the purchase. Nothing was charged." };
    case "waiting":
      return { tone: "info", title: "Waiting for the negotiation", text: message ?? "The negotiation has not finished yet." };
    case "in_progress":
      return { tone: "info", title: "Purchase in progress", text: message ?? "Agent D is already processing this purchase." };
    default:
      return null;
  }
}

export const MANDATE_STATUS_LABEL: Record<MandateStatus, string> = {
  active: "Authorised · waiting to buy",
  executing: "Buying…",
  executed: "Purchase confirmed",
  pending_reconciliation: "Waiting for PayPal to confirm",
  cancelled: "Cancelled by you",
  expired: "Expired",
  blocked: "Not bought · limits not met",
  failed: "Payment failed",
};

export const CONDITION_LABEL: Record<string, string> = { warranty: "Warranty", fast_delivery: "Fast delivery (3 days or less)", free_shipping: "Free shipping" };

/** The lines of the authorisation block, from the mandate (stored) or the draft brief (before it exists). */
export function mandateLines(m: { productQuery: string; budgetCents: number; requiredConditions: readonly string[]; paymentMethodLabel: string; expiresInMinutes?: number }, fmt: (cents: number) => string): { k: string; v: string }[] {
  return [
    { k: "Buy", v: m.productQuery },
    { k: "Maximum budget", v: `${fmt(m.budgetCents)} (EUR)` },
    { k: "Required conditions", v: m.requiredConditions.length ? m.requiredConditions.map((c) => CONDITION_LABEL[c] ?? c).join(", ") : "None beyond your budget" },
    { k: "Purchases allowed", v: "One" },
    { k: "Paid with", v: m.paymentMethodLabel },
    { k: "Valid for", v: m.expiresInMinutes ? `${m.expiresInMinutes} minutes` : "30 minutes, or until it is used or cancelled" },
  ];
}

export const isTerminal = (s: MandateStatus): boolean => !["active", "executing", "pending_reconciliation"].includes(s);

export function publicMandateLabel(m: Pick<PublicMandate, "status">): string {
  return MANDATE_STATUS_LABEL[m.status];
}
