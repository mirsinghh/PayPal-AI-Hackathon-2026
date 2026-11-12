import { afterAll, describe, expect, it, vi } from "vitest";

process.env.SUPABASE_URL = "https://proj.supabase.co/";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const calls: { url: string; init: RequestInit }[] = [];
vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const body = init.method === "POST" ? null : JSON.stringify([{ data: { paymentAttemptId: "pay_1", paypalOrderId: "ORD1" } }]);
    return new Response(body, { status: 200 });
  }),
);
afterAll(() => vi.unstubAllGlobals());

describe("Supabase store", () => {
  it("upserts sessions with the secret key in a header only", async () => {
    const { saveSession } = await import("@/server/db/store");
    await saveSession({ sessionId: "ses_1", expiresAt: "2026-01-01T00:00:00Z" } as never);
    const c = calls[0];
    expect(c.url).toBe("https://proj.supabase.co/rest/v1/sessions?on_conflict=id");
    expect(c.url).not.toContain("sb_secret_test");
    const h = c.init.headers as Record<string, string>;
    expect(h.apikey).toBe("sb_secret_test");
    expect(h.authorization).toBeUndefined();
    expect(h.prefer).toContain("merge-duplicates");
  });

  it("looks payments up by order id with an encoded filter", async () => {
    const { getPaymentByOrderId } = await import("@/server/db/store");
    const p = await getPaymentByOrderId("ORD1&x=1");
    expect(p?.paymentAttemptId).toBe("pay_1");
    expect(calls.at(-1)!.url).toContain("paypal_order_id=eq.ORD1%26x%3D1");
  });

  it("rejects unsafe ids before touching the network", async () => {
    const { getSession } = await import("@/server/db/store");
    const before = calls.length;
    expect(await getSession("../etc/passwd")).toBeNull();
    expect(calls.length).toBe(before);
  });
});
