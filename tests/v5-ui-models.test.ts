import { describe, expect, it } from "vitest";
import { MODE_LABEL, fallbackReasonLabel, modeBanner, modeChip } from "@/lib/v5/response-mode";
import { toHistorySession, toHistoryPayment } from "@/server/db/history";
import { safeNext } from "@/components/v5/AuthForm";
import { modeLabel, paymentFor, statusChip } from "@/components/v5/profile/History";
import type { HistoryPayment } from "@/server/db/history";

describe("response mode wording", () => {
  it("never presents a server fallback as AI", () => {
    const b = modeBanner({ responseMode: "ai", mode: "v0_rules", fallbackReason: "model_quota_exhausted" });
    expect(b?.tone).toBe("warn");
    expect(b?.text).toContain("not AI");
    expect(b?.text).toContain("quota");
    expect(modeChip({ responseMode: "ai", mode: "v0_rules" })?.text).toBe("AI requested · server fallback");
  });

  it("labels a real AI run and a server run plainly", () => {
    expect(modeBanner({ responseMode: "ai", mode: "multi_agent", fallbackReason: null })).toBeNull();
    expect(modeChip({ responseMode: "ai", mode: "multi_agent" })?.text).toBe(MODE_LABEL.ai);
    expect(modeBanner({ responseMode: "server", mode: "v0_rules", fallbackReason: null })?.text).toMatch(/No AI model/);
    expect(modeChip({ responseMode: "server", mode: "v0_rules" })?.text).toBe(MODE_LABEL.server);
  });

  it("shows nothing extra for sessions created before V5", () => {
    expect(modeBanner({ responseMode: undefined, mode: "v0_rules", fallbackReason: null })).toBeNull();
    expect(modeChip({ responseMode: undefined, mode: undefined })).toBeNull();
  });

  it("explains every recorded fallback reason in words, and tolerates unknown ones", () => {
    for (const r of ["provider_rules", "no_api_key", "no_catalog_match", "budget_below_catalog", "model_quota_exhausted", "cost_cap"]) {
      expect(fallbackReasonLabel(r)).not.toContain("_");
    }
    expect(fallbackReasonLabel("something_new")).toBe("something new");
    expect(fallbackReasonLabel(null)).toBe("AI was unavailable");
  });
});

describe("sign-in redirect", () => {
  it("only allows same-site paths", () => {
    expect(safeNext("/profile")).toBe("/profile");
    expect(safeNext("/deals/ses_abc")).toBe("/deals/ses_abc");
    for (const bad of ["https://evil.example", "//evil.example", "/deals//evil.example", "/api/auth/logout", "javascript:alert(1)", null, ""]) {
      expect(safeNext(bad)).toBe("/profile");
    }
  });
});

describe("history view models", () => {
  const row = { id: "ses_1", created_at: "2026-11-12T10:00:00Z", product_query: "Headphones", response_mode: "ai", engine_mode: "v0_rules", fallback_reason: "no_api_key", status: "ready", savings_cents: 1500, user_id: "must-not-leak" };

  it("maps only known columns and validates the response mode", () => {
    const s = toHistorySession(row);
    expect(s).toMatchObject({ id: "ses_1", responseMode: "ai", engineMode: "v0_rules", savingsCents: 1500 });
    expect(JSON.stringify(s)).not.toContain("must-not-leak");
    expect(toHistorySession({ ...row, response_mode: "turbo" }).responseMode).toBeNull();
  });

  it("flags an AI request that ran on server rules", () => {
    expect(modeLabel(toHistorySession(row))).toEqual({ tone: "warn", text: "AI requested · server fallback" });
    expect(modeLabel(toHistorySession({ ...row, engine_mode: "multi_agent" })).text).toBe("AI Responses");
    expect(modeLabel(toHistorySession({ ...row, response_mode: "server" })).text).toBe("Server Responses");
  });

  it("reports paid only when a completed payment exists", () => {
    const s = toHistorySession(row);
    const pending: HistoryPayment = toHistoryPayment({ id: "p1", session_id: "ses_1", status: "approval_pending" });
    const done: HistoryPayment = toHistoryPayment({ id: "p2", session_id: "ses_1", status: "completed", paypal_order_id: "ORD" });
    expect(statusChip(s, pending).text).not.toMatch(/Paid/);
    expect(statusChip(s, done)).toEqual({ tone: "success", text: "Paid (Sandbox)" });
    expect(paymentFor([pending, done], "ses_1")?.id).toBe("p2");
    expect(paymentFor([pending], "other")).toBeUndefined();
  });
});
