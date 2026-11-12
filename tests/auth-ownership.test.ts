import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "agentdeal-auth-"));

import { clearAuthCacheForTests, authFromRequest, parseCookies } from "@/server/auth/request";
import { authConfigured, signIn, signUp, AuthError } from "@/server/auth/supabase";
import { loadHistory } from "@/server/db/history";
import { sessionRow, paymentRow } from "@/server/db/summary";
import { saveSession, getSession } from "@/server/db/store";
import { startNegotiation } from "@/server/negotiation/service";
import { GET as getNegotiation } from "@/app/api/negotiations/[id]/route";
import { POST as approve } from "@/app/api/negotiations/[id]/approve/route";
import { GET as getHistory } from "@/app/api/history/route";
import type { PaymentAttempt, ProductIntent } from "@/shared/contracts/types";

const intent: ProductIntent = { productQuery: "Wireless noise-cancelling headphones", budgetCents: 35_000, currency: "EUR", priority: "best_value", preferences: [], language: "en" };

const ENV = { SUPABASE_URL: "https://proj.supabase.co", SUPABASE_ANON_KEY: "sb_publishable_anon", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_service" };
const ALICE = { id: "11111111-1111-1111-1111-111111111111", email: "alice@example.test", created_at: "2026-11-01T00:00:00Z" };
const BOB = { id: "22222222-2222-2222-2222-222222222222", email: "bob@example.test", created_at: "2026-11-02T00:00:00Z" };

interface Seen {
  url: string;
  headers: Record<string, string>;
  body: string | null;
}
/** A stand-in for Supabase Auth: tokens "alice-token" / "bob-token" are valid; "alice-refresh" refreshes to "alice-token-2". */
function stubSupabase() {
  const seen: Seen[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const headers = (init.headers ?? {}) as Record<string, string>;
      seen.push({ url, headers, body: typeof init.body === "string" ? init.body : null });
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
      if (url.endsWith("/auth/v1/user")) {
        const t = headers.authorization;
        if (t === "Bearer alice-token" || t === "Bearer alice-token-2") return json(ALICE);
        if (t === "Bearer bob-token") return json(BOB);
        return json({ code: 401, msg: "invalid JWT" }, 401);
      }
      if (url.includes("grant_type=password")) {
        const b = JSON.parse(String(init.body));
        return b.password === "correct-horse" ? json({ access_token: "alice-token", refresh_token: "alice-refresh", expires_in: 3600, user: ALICE }) : json({ error_code: "invalid_credentials" }, 400);
      }
      if (url.includes("grant_type=refresh_token")) {
        const b = JSON.parse(String(init.body));
        return b.refresh_token === "alice-refresh" ? json({ access_token: "alice-token-2", refresh_token: "alice-refresh-2", expires_in: 3600, user: ALICE }) : json({ error_code: "refresh_token_not_found" }, 400);
      }
      if (url.endsWith("/auth/v1/signup")) {
        const b = JSON.parse(String(init.body));
        return b.email === "alice@example.test" ? json({ error_code: "user_already_exists" }, 422) : json({ id: BOB.id, email: b.email, created_at: BOB.created_at });
      }
      if (url.includes("/rest/v1/sessions")) return json([{ id: "ses_1", created_at: "2026-11-12T10:00:00Z", product_query: "Headphones", response_mode: "ai", engine_mode: "multi_agent", savings_cents: 1200 }]);
      if (url.includes("/rest/v1/payments")) return json([{ id: "pay_1", session_id: "ses_1", paypal_order_id: "ORD1", status: "completed", amount_cents: 29900, currency: "EUR", created_at: "2026-11-12T10:05:00Z" }]);
      return json({}, 404);
    }),
  );
  return seen;
}

const req = (cookie?: string, extra: Record<string, string> = {}) => new Request("http://localhost/api/x", { headers: { ...(cookie ? { cookie } : {}), ...extra } });

// The store picks its backend once. Touch it before any Supabase env is stubbed so sessions use the local file backend
// (the auth calls below go through the stubbed fetch; storage is not what these tests are about).
beforeAll(async () => {
  await getSession("warmup");
});

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  vi.stubEnv("AI_PROVIDER", "rules");
  clearAuthCacheForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Supabase Auth client", () => {
  it("needs URL, anon key and service key", () => {
    expect(authConfigured(ENV)).toBe(true);
    expect(authConfigured({ ...ENV, SUPABASE_ANON_KEY: "" })).toBe(false);
    expect(authConfigured({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" })).toBe(false);
  });

  it("signs in with the anon key only (never the service key) and maps tokens", async () => {
    const seen = stubSupabase();
    const r = await signIn("alice@example.test", "correct-horse", ENV);
    expect(r.user.email).toBe("alice@example.test");
    expect(r.tokens.accessToken).toBe("alice-token");
    expect(seen[0].headers.apikey).toBe("sb_publishable_anon");
    expect(JSON.stringify(seen)).not.toContain("sb_secret_service");
  });

  it("maps a wrong password to a friendly 401 without echoing it", async () => {
    stubSupabase();
    const err = await signIn("alice@example.test", "nope-nope", ENV).catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.status).toBe(401);
    expect(err.message).not.toContain("nope-nope");
  });

  it("reports an existing email as 409 and a new account without a session when confirmation is required", async () => {
    stubSupabase();
    const taken = await signUp("alice@example.test", "correct-horse", ENV).catch((e) => e);
    expect(taken.code).toBe("EMAIL_TAKEN");
    const fresh = await signUp("new@example.test", "correct-horse", ENV);
    expect(fresh.user.email).toBe("new@example.test");
    expect(fresh.tokens).toBeNull();
  });
});

describe("request authentication", () => {
  it("verifies the cookie token with Supabase and ignores any client-sent user id", async () => {
    stubSupabase();
    const a = await authFromRequest(req("ad_at=alice-token", { "x-user-id": BOB.id, "x-supabase-user": BOB.id }));
    expect(a.user?.id).toBe(ALICE.id);
    const none = await authFromRequest(req(undefined, { "x-user-id": ALICE.id }));
    expect(none.user).toBeNull();
  });

  it("rejects a forged token", async () => {
    stubSupabase();
    const a = await authFromRequest(req("ad_at=forged-token"));
    expect(a.user).toBeNull();
  });

  it("refreshes an expired access token and asks to set new httpOnly cookies", async () => {
    stubSupabase();
    const a = await authFromRequest(req("ad_at=expired; ad_rt=alice-refresh"));
    expect(a.user?.id).toBe(ALICE.id);
    expect(a.setCookies.join(" ")).toContain("ad_at=alice-token-2");
    expect(a.setCookies.every((c) => c.includes("HttpOnly") && c.includes("SameSite=Lax"))).toBe(true);
  });

  it("clears cookies when the refresh token is no longer valid", async () => {
    stubSupabase();
    const a = await authFromRequest(req("ad_at=expired; ad_rt=revoked"));
    expect(a.user).toBeNull();
    expect(a.setCookies.join(" ")).toContain("Max-Age=0");
  });

  it("parses cookies safely", () => {
    expect(parseCookies("a=1; b=%E0%A4%A; c=hello%20world")).toEqual({ a: "1", c: "hello world" });
  });
});

describe("ownership of sessions", () => {
  async function ownedSession(ownerId: string | null) {
    const { session } = await startNegotiation(intent, { responseMode: "server", explainCaller: null, ownerId });
    await saveSession(session);
    return session;
  }
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it("a signed-in user's session is invisible to other users and to anonymous visitors, and never leaks ownerId", async () => {
    stubSupabase();
    const s = await ownedSession(ALICE.id);
    expect((await getSession(s.sessionId))?.ownerId).toBe(ALICE.id);

    const mine = await getNegotiation(req("ad_at=alice-token"), ctx(s.sessionId));
    expect(mine.status).toBe(200);
    const body = await mine.json();
    expect(body.sessionId).toBe(s.sessionId);
    expect(body.ownerId).toBeUndefined();

    expect((await getNegotiation(req("ad_at=bob-token"), ctx(s.sessionId))).status).toBe(404);
    expect((await getNegotiation(req(), ctx(s.sessionId))).status).toBe(404);
  });

  it("another user cannot approve (and therefore cannot pay for) it", async () => {
    stubSupabase();
    const s = await ownedSession(ALICE.id);
    const post = (cookie?: string) => approve(new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ offerId: s.recommendedOfferId }), headers: cookie ? { cookie } : {} }), ctx(s.sessionId));
    expect((await post("ad_at=bob-token")).status).toBe(404);
    expect((await post()).status).toBe(404);
    expect((await post("ad_at=alice-token")).status).toBe(200);
  });

  it("anonymous sessions stay reachable by their unguessable id, as before accounts existed", async () => {
    stubSupabase();
    const s = await ownedSession(null);
    expect((await getNegotiation(req(), ctx(s.sessionId))).status).toBe(200);
  });

  it("an owner can still reopen a session older than the 24 h demo window (history)", async () => {
    stubSupabase();
    const s = await ownedSession(ALICE.id);
    await saveSession({ ...s, expiresAt: "2020-01-01T00:00:00.000Z" });
    const res = await getNegotiation(req("ad_at=alice-token"), ctx(s.sessionId));
    expect(res.status).toBe(200);
    expect((await res.json()).expired).toBe(true);
    // An anonymous session past its window is still gone.
    const anon = await ownedSession(null);
    await saveSession({ ...anon, expiresAt: "2020-01-01T00:00:00.000Z" });
    expect((await getNegotiation(req(), ctx(anon.sessionId))).status).toBe(410);
  });
});

describe("history", () => {
  it("reads through RLS with the user's own token and the anon key, filtering by the verified user id", async () => {
    const seen = stubSupabase();
    const h = await loadHistory(ALICE.id, "alice-token", ENV);
    expect(h.sessions[0]).toMatchObject({ id: "ses_1", responseMode: "ai", savingsCents: 1200 });
    expect(h.payments[0]).toMatchObject({ paypalOrderId: "ORD1", status: "completed" });
    for (const c of seen) {
      expect(c.headers.apikey).toBe("sb_publishable_anon");
      expect(c.headers.authorization).toBe("Bearer alice-token");
      expect(c.url).toContain(`user_id=eq.${ALICE.id}`);
    }
    expect(JSON.stringify(seen)).not.toContain("sb_secret_service");
  });

  it("/api/history needs a verified session", async () => {
    stubSupabase();
    expect((await getHistory(req())).status).toBe(401);
    expect((await getHistory(req("ad_at=forged"))).status).toBe(401);
    const ok = await getHistory(req("ad_at=alice-token"));
    expect(ok.status).toBe(200);
    expect((await ok.json()).user.email).toBe("alice@example.test");
  });

  it("/api/history is unavailable (not broken) when accounts are not configured", async () => {
    vi.stubEnv("SUPABASE_ANON_KEY", "");
    expect((await getHistory(req())).status).toBe(503);
  });
});

describe("persisted rows", () => {
  it("carry the verified owner and flat summary columns", async () => {
    const { session } = await startNegotiation(intent, { responseMode: "server", explainCaller: null, ownerId: ALICE.id });
    const row = sessionRow(session);
    expect(row.user_id).toBe(ALICE.id);
    expect(row.response_mode).toBe("server");
    expect(row.engine_mode).toBe("v0_rules");
    expect(row.product_query).toBe(intent.productQuery);
    expect(typeof row.final_price_cents).toBe("number");
    expect((row.savings_cents as number) >= 0).toBe(true);
  });

  it("payments carry only order reference, status and amount: no card or credential data", () => {
    const p: PaymentAttempt = { paymentAttemptId: "pay_1", sessionId: "ses_1", offerId: "o1", amountCents: 100, currency: "EUR", status: "completed", paypalOrderId: "ORD", paypalCaptureId: "CAP", createRequestId: "a", captureRequestId: "b", createdAt: "x", updatedAt: "y", failureCode: null, ownerId: ALICE.id };
    const row = paymentRow(p);
    expect(row.user_id).toBe(ALICE.id);
    expect(Object.keys(row).sort()).toEqual(["amount_cents", "currency", "data", "id", "paypal_order_id", "session_id", "status", "updated_at", "user_id"]);
  });
});
