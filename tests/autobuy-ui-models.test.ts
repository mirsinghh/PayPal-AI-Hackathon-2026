import { describe, expect, it } from "vitest";
import { CHECKOUT_LABEL, CHECKOUT_TAGLINE, MANDATE_STATUS_LABEL, RUN_STEPS, mandateLines, outcomeNotice, stepStates } from "@/lib/v5/autobuy";
import { MANDATE_AUTHORIZATION_TEXT } from "@/shared/contracts/types";
import { formatEur } from "@/shared/format";

const snap = (over: Partial<Parameters<typeof stepStates>[0]> = {}) => ({ phase: "running" as const, mandateStatus: null, paymentStatus: null, outcome: null, ...over });

describe("Auto-Buy wording", () => {
  it("uses the two modes exactly as specified", () => {
    expect(CHECKOUT_LABEL).toEqual({ manual: "Manual Checkout", auto_buy: "Agent Auto-Buy" });
    expect(CHECKOUT_TAGLINE.manual).toBe("You review the deal and approve the payment.");
    expect(CHECKOUT_TAGLINE.auto_buy).toMatch(/Set your limits/);
    expect(MANDATE_AUTHORIZATION_TEXT).toBe("Authorize Agent D to purchase one eligible offer within these limits.");
  });
  it("lists the progress stages in the required order", () => {
    expect(RUN_STEPS.map((s) => s.label)).toEqual([
      "Searching offers",
      "Negotiating",
      "Evaluating",
      "Checking purchase mandate",
      "Preparing payment",
      "Processing PayPal Sandbox payment",
      "Capture confirmed",
    ]);
  });
  it("describes the mandate in euros with every limit", () => {
    const lines = mandateLines({ productQuery: "Headphones", budgetCents: 30_000, requiredConditions: ["warranty", "free_shipping"], paymentMethodLabel: "PayPal Sandbox · b@x.test" }, formatEur);
    const text = lines.map((l) => `${l.k}: ${l.v}`).join("\n");
    expect(text).toMatch(/Maximum budget: .*300/);
    expect(text).toMatch(/Purchases allowed: One/);
    expect(text).toMatch(/Warranty, Free shipping/);
    expect(text).toMatch(/b@x\.test/);
  });
  it("has a label for every mandate status", () => {
    for (const s of ["active", "executing", "executed", "pending_reconciliation", "cancelled", "expired", "blocked", "failed"] as const) expect(MANDATE_STATUS_LABEL[s]).toBeTruthy();
  });
});

describe("purchase progress", () => {
  it("shows the mandate check first, and nothing past it before the server recorded it", () => {
    expect(stepStates(snap({ phase: "countdown" })).mandate).toBe("pending");
    const s = stepStates(snap());
    expect(s).toMatchObject({ searching: "done", negotiating: "done", evaluating: "done", mandate: "active", preparing: "pending", confirmed: "pending" });
  });
  it("advances only on recorded server states", () => {
    expect(stepStates(snap({ mandateStatus: "executing" }))).toMatchObject({ mandate: "done", preparing: "active", processing: "pending" });
    expect(stepStates(snap({ mandateStatus: "executing", paymentStatus: "approval_pending" }))).toMatchObject({ preparing: "done", processing: "active", confirmed: "pending" });
  });
  it("confirms the capture only for a completed payment on an executed mandate", () => {
    expect(stepStates(snap({ phase: "settled", mandateStatus: "executed", paymentStatus: "completed", outcome: "completed" })).confirmed).toBe("done");
    // A payment in an uncertain state never reaches 'Capture confirmed'.
    const u = stepStates(snap({ phase: "settled", mandateStatus: "pending_reconciliation", paymentStatus: "unknown_pending_reconciliation", outcome: "uncertain" }));
    expect(u.confirmed).toBe("pending");
    expect(u.processing).toBe("active");
  });
  it("shows exactly where a refused or failed purchase stopped", () => {
    expect(stepStates(snap({ phase: "settled", mandateStatus: "blocked", outcome: "blocked" })).mandate).toBe("failed");
    const f = stepStates(snap({ phase: "settled", mandateStatus: "failed", paymentStatus: "failed", outcome: "failed" }));
    expect(f.processing).toBe("failed");
    expect(f.confirmed).toBe("pending");
  });
});

describe("result messages", () => {
  it("never says paid for anything but a verified purchase", () => {
    for (const o of ["blocked", "failed", "uncertain", "cancelled", "expired", "waiting", "in_progress"]) {
      const n = outcomeNotice(o, null, null)!;
      expect(`${n.title} ${n.text}`.toLowerCase()).not.toMatch(/\bpaid\b|purchase confirmed/);
    }
    expect(outcomeNotice("completed", null, null)?.tone).toBe("success");
  });
  it("tells the user nothing was charged when the server refused", () => {
    expect(outcomeNotice("blocked", "The offer is above the budget you authorised.", "OVER_BUDGET")?.text).toMatch(/Nothing was charged/);
    expect(outcomeNotice("failed", null, null)?.text).toMatch(/Nothing was charged/);
    expect(outcomeNotice("nonsense", null, null)).toBeNull();
  });
});
