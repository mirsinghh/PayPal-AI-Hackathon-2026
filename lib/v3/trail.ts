import { formatEur } from "@/shared/format";
import type { Offer } from "@/shared/contracts/types";

/**
 * The verifiable path of one purchase: negotiation finished -> you approved -> PayPal payment -> capture confirmed.
 * Each step says exactly what the server has recorded; a later step is never "done" because an earlier one was.
 * A payment is only confirmed when the server's record says `completed`, and the confirmed amount is compared with
 * the approved offer so a mismatch is shown instead of hidden.
 */
export type TrailState = "done" | "current" | "todo" | "warn";

export interface TrailStep {
  id: "negotiation" | "approval" | "payment" | "capture";
  title: string;
  detail: string;
  state: TrailState;
  evidence: { label: string; value: string }[];
}

/** The checkout phases that matter to the trail (a subset of the checkout state machine). */
export type TrailPhase = "loading_sdk" | "ready" | "preparing" | "waiting" | "confirming" | "completed" | "cancelled" | "unconfirmed" | "error" | "unavailable";

export interface TrailInput {
  negotiationFinished: boolean;
  engine: "rules" | "ai";
  approvedAt: string | null;
  offer: Offer | null;
  phase: TrailPhase | null;
  payment: { status: string; orderId: string | null; captureId: string | null; amountCents: number } | null;
  /** The PayPal order Agent D prepared before you authorised anything (amount as the server created it). */
  prepared?: { orderId: string; amountCents: number } | null;
}

const time = (iso: string): string => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export function buildTrail(i: TrailInput): TrailStep[] {
  const approved = !!i.offer && !!i.approvedAt;
  const paid = i.phase === "completed" && i.payment?.status === "completed";
  const mismatch = paid && !!i.offer && i.payment!.amountCents !== i.offer.finalPriceCents;

  const negotiation: TrailStep = {
    id: "negotiation",
    title: "Negotiation finished",
    detail: i.negotiationFinished ? "Agent D recommended one eligible offer. Nothing was paid." : "Agent D is still negotiating.",
    state: i.negotiationFinished ? "done" : "current",
    evidence: [{ label: "Engine", value: i.engine === "ai" ? "Live AI agents" : "Rule-based simulation" }],
  };

  const approval: TrailStep = {
    id: "approval",
    title: "You approved this offer",
    detail: approved ? `Approved by you at ${time(i.approvedAt as string)}. The server charges only this exact offer.` : "Waiting for your explicit approval.",
    state: approved ? "done" : i.negotiationFinished ? "current" : "todo",
    evidence: approved && i.offer ? [{ label: "Approved amount", value: formatEur(i.offer.finalPriceCents) }] : [],
  };

  let payState: TrailState = "todo";
  let payDetail = "Available after you approve.";
  if (approved) {
    switch (i.phase) {
      case "completed":
        payState = "done";
        payDetail = "Authorised in PayPal Sandbox.";
        break;
      case "unconfirmed":
        payState = "warn";
        payDetail = "PayPal has not confirmed the result yet. Check the status before trying again.";
        break;
      case "error":
      case "unavailable":
        payState = "warn";
        payDetail = "The payment could not be completed. You have not been charged.";
        break;
      case "cancelled":
        payState = "current";
        payDetail = "Cancelled in PayPal. You have not been charged.";
        break;
      case "waiting":
        payState = "current";
        payDetail = "PayPal window open: waiting for your authorisation.";
        break;
      case "confirming":
        payState = "current";
        payDetail = "Confirming with PayPal…";
        break;
      default:
        payState = "current";
        payDetail = i.prepared
          ? "Agent D prepared the PayPal order. Nothing is charged until you authorise it with the official PayPal button."
          : "Ready: authorise with the PayPal button. The amount comes from the approved offer, never from the browser.";
    }
  }
  const preparedMismatch = !!i.prepared && !!i.offer && i.prepared.amountCents !== i.offer.finalPriceCents;
  if (preparedMismatch && !paid) {
    payState = "warn";
    payDetail = "The prepared order amount differs from the approved offer. Do not authorise it; reload the page.";
  }
  const payment: TrailStep = {
    id: "payment",
    title: "PayPal payment",
    detail: payDetail,
    state: payState,
    evidence: i.prepared && approved && !paid ? [{ label: "Prepared PayPal order", value: i.prepared.orderId }, { label: "Amount in the order", value: formatEur(i.prepared.amountCents) }] : [],
  };

  const capture: TrailStep = paid
    ? {
        id: "capture",
        title: "Capture confirmed",
        detail: mismatch ? "The captured amount differs from the approved offer. Do not treat this as a clean purchase." : "The server verified the capture with PayPal: status, currency and amount.",
        state: mismatch ? "warn" : "done",
        evidence: [
          { label: "Amount paid", value: formatEur(i.payment!.amountCents) },
          { label: "Matches approved offer", value: i.offer ? (mismatch ? "No" : "Yes") : "Unknown" },
          { label: "PayPal order", value: i.payment!.orderId ?? "—" },
          { label: "Capture ID", value: i.payment!.captureId ?? "—" },
        ],
      }
    : {
        id: "capture",
        title: "Capture confirmed",
        detail: i.phase === "unconfirmed" ? "Pending verification. Nothing is celebrated until the server confirms it." : "Appears here once the server confirms the capture.",
        state: i.phase === "unconfirmed" ? "current" : "todo",
        evidence: [],
      };

  return [negotiation, approval, payment, capture];
}
