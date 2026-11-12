import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// Isolated store: vitest.config.mts points DATA_DIR at a temp folder before any import. The key is a test value, never a real one.
const DATA = process.env.DATA_DIR as string;
process.env.AUTOBUY_ENCRYPTION_KEY = "a".repeat(64);
process.env.APP_BASE_URL = "http://localhost:3000";

import { prepareSession } from "@/server/negotiation/service";
import { getMandate, getPaymentMethod, getPaymentsBySession, getSession, listMandatesByOwner, saveMandate, saveSession } from "@/server/db/store";
import { openToken, sealToken } from "@/server/autobuy/crypto";
import { BLOCKER_TEXT, autoBuyCapability, resetCapabilityCache } from "@/server/autobuy/capability";
import { MandateError, buildMandate, cancelMandate, evaluateMandate } from "@/server/autobuy/mandate";
import { completeAuthorization, getActiveMethod, isPayPalApprovalUrl, revokeAuthorization, startAuthorization, vaultTokenFor, type VaultGateway } from "@/server/autobuy/methods";
import { AutoBuyError, executeAutoBuy } from "@/server/autobuy/execute";
import { PaymentError, captureOrder, createPaymentOrder, type Gateway } from "@/server/paypal/payments";
import { PayPalHttpError, PayPalNetworkError, centsToValue, type PayPalOrder } from "@/server/paypal/client";
import { MANDATE_AUTHORIZATION_TEXT, type NegotiationSession, type Preference, type ProductIntent, type PurchaseMandate } from "@/shared/contracts/types";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const intent = (over: Partial<ProductIntent> = {}): ProductIntent => ({
  productQuery: "Wireless noise-cancelling headphones",
  budgetCents: 35_000,
  currency: "EUR",
  priority: "best_value",
  preferences: [],
  language: "en",
  ...over,
});

/* ---------- fakes ---------- */

function fakeVault(over: { setupStatus?: string; failToken?: boolean } = {}) {
  const calls = { createSetup: 0, getSetup: 0, createToken: 0, deleteToken: 0, deleted: [] as string[] };
  const vault: VaultGateway = {
    async createSetup() {
      calls.createSetup++;
      return { id: `SETUP-${randomUUID()}`, status: "PAYER_ACTION_REQUIRED", links: [{ rel: "approve", href: "https://sandbox.paypal.com/agreements/approve?approval_session_id=X", method: "GET" }] };
    },
    async getSetup() {
      calls.getSetup++;
      return { id: "x", status: over.setupStatus ?? "APPROVED" };
    },
    async createToken() {
      calls.createToken++;
      if (over.failToken) throw new PayPalHttpError(422, "SETUP_TOKEN_NOT_APPROVED", "x", null);
      return { id: `TOKEN-${randomUUID()}`, customer: { id: "cust_1" }, payment_source: { paypal: { email_address: "buyer@example.test" } } };
    },
    async deleteToken(id: string) {
      calls.deleteToken++;
      calls.deleted.push(id);
      return {};
    },
  };
  return { vault, calls };
}

async function authorisedUser(ownerId = OWNER) {
  const fv = fakeVault();
  const { method } = await startAuthorization(ownerId, fv.vault);
  const done = await completeAuthorization(ownerId, method.methodId, false, fv.vault);
  if (!done.ok) throw new Error("authorisation setup failed");
  return { method: done.method, ...fv };
}

type PayBehavior = { create: "completed" | "payer_action" | "declined" | "network" | "wrong_amount" | "approved_then_capture" };
function fakeGateway(behavior: PayBehavior = { create: "completed" }) {
  const calls = { create: 0, capture: 0, get: 0, vaultIds: [] as (string | undefined)[], requestIds: [] as string[], lastAmount: "" };
  const orders = new Map<string, { amountCents: number; customId: string }>();
  const completed = (id: string, value?: string): PayPalOrder => {
    const o = orders.get(id)!;
    return {
      id,
      status: "COMPLETED",
      purchase_units: [{ custom_id: o.customId, payments: { captures: [{ id: `CAP-${id}`, status: "COMPLETED", amount: { currency_code: "EUR", value: value ?? centsToValue(o.amountCents) } }] } }],
    };
  };
  const byRequest = new Map<string, string>();
  const gw: Gateway & { behavior: PayBehavior } = {
    behavior,
    async create(a) {
      calls.create++;
      calls.vaultIds.push(a.vaultId);
      calls.requestIds.push(a.requestId);
      calls.lastAmount = centsToValue(a.amountCents);
      if (gw.behavior.create === "network") throw new PayPalNetworkError("timeout");
      if (gw.behavior.create === "declined") throw new PayPalHttpError(422, "INSTRUMENT_DECLINED", "x", null);
      // PayPal-Request-Id idempotency: the same id returns the same order.
      const existing = byRequest.get(a.requestId);
      const id = existing ?? `ORDER-${randomUUID()}`;
      byRequest.set(a.requestId, id);
      orders.set(id, { amountCents: a.amountCents, customId: a.customId });
      if (gw.behavior.create === "payer_action") return { id, status: "PAYER_ACTION_REQUIRED" };
      if (gw.behavior.create === "approved_then_capture") return { id, status: "APPROVED" };
      if (gw.behavior.create === "wrong_amount") return completed(id, "1.00");
      return completed(id);
    },
    async capture(id) {
      calls.capture++;
      return completed(id);
    },
    async get(id) {
      calls.get++;
      return completed(id);
    },
  };
  return { gw, calls };
}

interface World {
  session: NegotiationSession;
  mandate: PurchaseMandate;
  methodId: string;
}
async function world(opts: { intent?: Partial<ProductIntent>; seed?: number; ownerId?: string; sessionOver?: (s: NegotiationSession) => void } = {}): Promise<World> {
  const ownerId = opts.ownerId ?? OWNER;
  const { method } = await authorisedUser(ownerId);
  const session = await prepareSession(intent(opts.intent), { caller: null, seed: opts.seed ?? 11 });
  session.ownerId = ownerId;
  const mandate = buildMandate({ session, ownerId, method, authorizationText: MANDATE_AUTHORIZATION_TEXT });
  session.checkoutMode = "auto_buy";
  session.mandateId = mandate.mandateId;
  opts.sessionOver?.(session);
  await saveMandate(mandate);
  await saveSession(session);
  return { session, mandate, methodId: method.methodId };
}

beforeEach(() => resetCapabilityCache());

/* ---------- token protection ---------- */

describe("payment token protection", () => {
  it("round-trips, and the ciphertext does not contain the token", () => {
    const sealed = sealToken("PAYPAL-TOKEN-123", OWNER, "pm_a");
    expect(sealed).not.toContain("PAYPAL-TOKEN-123");
    expect(openToken(sealed, OWNER, "pm_a")).toBe("PAYPAL-TOKEN-123");
  });
  it("cannot be moved to another user or record", () => {
    const sealed = sealToken("PAYPAL-TOKEN-123", OWNER, "pm_a");
    expect(() => openToken(sealed, OTHER, "pm_a")).toThrow();
    expect(() => openToken(sealed, OWNER, "pm_b")).toThrow();
  });
  it("is refused without a key outside local Sandbox", () => {
    expect(() => sealToken("x", OWNER, "pm_a", { VERCEL: "1" })).toThrow("encryption_key_missing");
  });
});

/* ---------- capability: never advertise Auto-Buy if it cannot charge ---------- */

describe("Auto-Buy capability", () => {
  const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service", PAYPAL_ENV: "sandbox", PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "secret", AUTOBUY_ENCRYPTION_KEY: "a".repeat(64) } as unknown as NodeJS.ProcessEnv;
  const saved = { ...process.env };
  const withEnv = async <T,>(fn: () => Promise<T>) => {
    Object.assign(process.env, env);
    try {
      return await fn();
    } finally {
      for (const k of Object.keys(env)) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  };

  it("is unavailable when PayPal answers 403 NOT_AUTHORIZED (Vault not enabled)", async () => {
    await withEnv(async () => {
      const cap = await autoBuyCapability(async () => {
        throw new PayPalHttpError(403, "NOT_AUTHORIZED", "Authorization failed due to insufficient permissions.", null);
      }, env);
      expect(cap).toMatchObject({ available: false, blocker: "vault_not_enabled" });
      expect(BLOCKER_TEXT.vault_not_enabled).toMatch(/Vault/);
    });
  });
  it("is available only when the Vault request really succeeds", async () => {
    await withEnv(async () => {
      expect(await autoBuyCapability(async () => undefined, env)).toMatchObject({ available: true, blocker: null });
    });
  });
  it("distinguishes an unreachable PayPal from a missing permission", async () => {
    await withEnv(async () => {
      expect((await autoBuyCapability(async () => { throw new PayPalNetworkError("x"); }, env)).blocker).toBe("paypal_unreachable");
    });
  });
  it("is unavailable without accounts", async () => {
    expect((await autoBuyCapability(async () => undefined, {} as NodeJS.ProcessEnv)).blocker).toBe("accounts_unavailable");
  });
});

/* ---------- PayPal authorisation (Vault) ---------- */

describe("PayPal authorisation", () => {
  it("only accepts PayPal's own approval pages", () => {
    expect(isPayPalApprovalUrl("https://sandbox.paypal.com/agreements/approve?x=1")).toBe(true);
    expect(isPayPalApprovalUrl("https://www.sandbox.paypal.com/x")).toBe(true);
    expect(isPayPalApprovalUrl("https://evilpaypal.com/x")).toBe(false);
    expect(isPayPalApprovalUrl("https://paypal.com.evil.test/x")).toBe(false);
    expect(isPayPalApprovalUrl("http://sandbox.paypal.com/x")).toBe(false);
    expect(isPayPalApprovalUrl("javascript:alert(1)")).toBe(false);
  });

  it("is pending until PayPal confirms, then active with an encrypted token that is never stored in the clear", async () => {
    const owner = randomUUID();
    const fv = fakeVault();
    const { method, approveUrl } = await startAuthorization(owner, fv.vault);
    expect(approveUrl).toMatch(/^https:\/\/sandbox\.paypal\.com\//);
    expect(method.status).toBe("pending");
    expect(await getActiveMethod(owner)).toBeNull();

    const done = await completeAuthorization(owner, method.methodId, false, fv.vault);
    expect(done.ok).toBe(true);
    const stored = (await getPaymentMethod(method.methodId))!;
    expect(stored.status).toBe("active");
    expect(stored.tokenCipher).toMatch(/^v1\./);
    expect(JSON.stringify(stored)).not.toMatch(/TOKEN-/);
    // On disk too.
    const raw = readdirSync(path.join(DATA, "payment_methods")).map((f) => readFileSync(path.join(DATA, "payment_methods", f), "utf8")).join("\n");
    expect(raw).not.toMatch(/TOKEN-[0-9a-f]{8}-/);
    expect(await vaultTokenFor(owner, method.methodId)).toMatch(/^TOKEN-/);
  });

  it("does not activate when the buyer has not approved on PayPal", async () => {
    const owner = randomUUID();
    const fv = fakeVault({ setupStatus: "PAYER_ACTION_REQUIRED" });
    const { method } = await startAuthorization(owner, fv.vault);
    const done = await completeAuthorization(owner, method.methodId, false, fv.vault);
    expect(done).toEqual({ ok: false, reason: "not_approved" });
    expect(fv.calls.createToken).toBe(0);
    expect(await getActiveMethod(owner)).toBeNull();
  });

  it("does not activate when PayPal rejects the token exchange, nor after a cancel", async () => {
    const owner = randomUUID();
    const bad = fakeVault({ failToken: true });
    const a = await startAuthorization(owner, bad.vault);
    expect(await completeAuthorization(owner, a.method.methodId, false, bad.vault)).toEqual({ ok: false, reason: "not_approved" });
    const good = fakeVault();
    const b = await startAuthorization(owner, good.vault);
    expect(await completeAuthorization(owner, b.method.methodId, true, good.vault)).toEqual({ ok: false, reason: "cancelled" });
    expect(await getActiveMethod(owner)).toBeNull();
  });

  it("another user cannot complete or use someone else's authorisation", async () => {
    const owner = randomUUID();
    const fv = fakeVault();
    const { method } = await startAuthorization(owner, fv.vault);
    expect(await completeAuthorization(OTHER, method.methodId, false, fv.vault)).toEqual({ ok: false, reason: "not_found" });
    await completeAuthorization(owner, method.methodId, false, fv.vault);
    expect(await vaultTokenFor(OTHER, method.methodId)).toBeNull();
    await expect(revokeAuthorization(OTHER, method.methodId, fv.vault)).rejects.toMatchObject({ status: 404 });
  });

  it("revoking deletes the token on PayPal, drops the ciphertext and cancels unexecuted mandates", async () => {
    const w = await world({ ownerId: randomUUID() });
    const fv = fakeVault();
    const r = await revokeAuthorization(w.session.ownerId!, w.methodId, fv.vault);
    expect(r).toMatchObject({ revoked: true, mandatesCancelled: 1 });
    expect(fv.calls.deleteToken).toBe(1);
    const m = (await getPaymentMethod(w.methodId))!;
    expect(m).toMatchObject({ status: "revoked", tokenCipher: null });
    expect((await getMandate(w.mandate.mandateId))!.status).toBe("cancelled");
    expect(await vaultTokenFor(w.session.ownerId!, w.methodId)).toBeNull();
  });
});

/* ---------- mandate rules ---------- */

describe("purchase mandate", () => {
  it("requires the exact consent sentence", async () => {
    const session = await prepareSession(intent(), { caller: null, seed: 11 });
    const m = { methodId: "pm_x", payerEmail: null };
    for (const text of ["", "yes", MANDATE_AUTHORIZATION_TEXT.toLowerCase(), MANDATE_AUTHORIZATION_TEXT + " "]) {
      expect(() => buildMandate({ session, ownerId: OWNER, method: m, authorizationText: text })).toThrow(MandateError);
    }
    const ok = buildMandate({ session, ownerId: OWNER, method: m, authorizationText: MANDATE_AUTHORIZATION_TEXT });
    expect(ok).toMatchObject({ budgetCents: 35_000, currency: "EUR", maxPurchases: 1, status: "active", authorizationText: MANDATE_AUTHORIZATION_TEXT });
    expect(ok.evidence[0].type).toBe("mandate_authorized");
  });

  it("derives limits from the negotiation intent (integer cents) and never outlives it", async () => {
    const session = await prepareSession(intent({ preferences: ["warranty", "free_shipping"] }), { caller: null, seed: 11 });
    const m = buildMandate({ session, ownerId: OWNER, method: { methodId: "pm_x", payerEmail: "a@b.test" }, authorizationText: MANDATE_AUTHORIZATION_TEXT });
    expect(Number.isSafeInteger(m.budgetCents)).toBe(true);
    expect(m.requiredConditions).toEqual(["warranty", "free_shipping"]);
    expect(m.paymentMethodLabel).toContain("a@b.test");
    expect(new Date(m.expiresAt).getTime()).toBeLessThanOrEqual(new Date(session.expiresAt).getTime());
  });

  it("accepts the recommended, eligible, in-budget, unexpired offer", async () => {
    const { session, mandate } = await world();
    const c = evaluateMandate(mandate, session);
    expect(c.ok).toBe(true);
    if (c.ok) expect(c.offer.offerId).toBe(session.recommendedOfferId);
  });

  it("never buys above the budget", async () => {
    const { session, mandate } = await world();
    const rec = session.offers.find((o) => o.offerId === session.recommendedOfferId)!;
    rec.finalPriceCents = mandate.budgetCents + 1;
    expect(evaluateMandate(mandate, session)).toMatchObject({ ok: false, code: "OVER_BUDGET" });
  });

  it("never buys an ineligible offer", async () => {
    const { session, mandate } = await world();
    session.offers.find((o) => o.offerId === session.recommendedOfferId)!.eligible = false;
    expect(evaluateMandate(mandate, session)).toMatchObject({ ok: false, code: "OFFER_INELIGIBLE" });
  });

  it("never uses an expired offer or an expired mandate", async () => {
    const { session, mandate } = await world();
    const later = new Date(Date.now() + 31 * 60_000);
    expect(evaluateMandate(mandate, session, later)).toMatchObject({ ok: false, code: "MANDATE_EXPIRED", terminal: "expired" });
    const short = { ...mandate, expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
    expect(evaluateMandate(short, session, new Date(Date.now() + 31 * 60_000))).toMatchObject({ ok: false, code: "OFFER_EXPIRED" });
  });

  it("enforces the selected preferences as mandatory conditions", async () => {
    const { session, mandate } = await world();
    const rec = session.offers.find((o) => o.offerId === session.recommendedOfferId)!;
    const wanting = (c: Preference[]) => ({ ...mandate, requiredConditions: c });
    rec.warrantyMonths = 0;
    expect(evaluateMandate(wanting(["warranty"]), session)).toMatchObject({ ok: false, code: "CONDITION_NOT_MET" });
    rec.deliveryDays = 9;
    expect(evaluateMandate(wanting(["fast_delivery"]), session)).toMatchObject({ ok: false, code: "CONDITION_NOT_MET" });
    rec.freeShipping = false;
    expect(evaluateMandate(wanting(["free_shipping"]), session)).toMatchObject({ ok: false, code: "CONDITION_NOT_MET" });
    rec.warrantyMonths = 24;
    rec.deliveryDays = 2;
    rec.freeShipping = true;
    expect(evaluateMandate(wanting(["warranty", "fast_delivery", "free_shipping"]), session).ok).toBe(true);
  });

  it("is bound to its user, negotiation and mode", async () => {
    const { session, mandate } = await world();
    expect(evaluateMandate(mandate, { ...session, ownerId: OTHER })).toMatchObject({ ok: false, code: "MANDATE_SESSION_MISMATCH" });
    expect(evaluateMandate(mandate, { ...session, mandateId: "man_other" })).toMatchObject({ ok: false, code: "MANDATE_SESSION_MISMATCH" });
    expect(evaluateMandate(mandate, { ...session, checkoutMode: "manual" })).toMatchObject({ ok: false, code: "MANDATE_SESSION_MISMATCH" });
    expect(evaluateMandate({ ...mandate, budgetCents: mandate.budgetCents + 100 }, session)).toMatchObject({ ok: false, code: "MANDATE_INTENT_MISMATCH" });
  });

  it("waits for a negotiation that has not finished", async () => {
    const { session, mandate } = await world();
    expect(evaluateMandate(mandate, { ...session, status: "negotiating" })).toMatchObject({ ok: false, terminal: "wait" });
  });

  it("can be cancelled by its owner before execution, not by someone else, and not twice-used", async () => {
    const w = await world({ ownerId: randomUUID() });
    await expect(cancelMandate(OTHER, w.mandate.mandateId)).rejects.toMatchObject({ status: 404 });
    const c = await cancelMandate(w.session.ownerId!, w.mandate.mandateId);
    expect(c.status).toBe("cancelled");
    expect(c.evidence.at(-1)?.type).toBe("mandate_cancelled");
  });
});

/* ---------- autonomous execution ---------- */

describe("Agent Auto-Buy execution", () => {
  it("buys the recommended offer once: verified capture, mandate executed, evidence kept", async () => {
    const w = await world();
    const { gw, calls } = fakeGateway();
    const r = await executeAutoBuy({ sessionId: w.session.sessionId, ownerId: OWNER }, gw);
    expect(r.outcome).toBe("completed");
    const rec = w.session.offers.find((o) => o.offerId === w.session.recommendedOfferId)!;
    expect(r.payment).toMatchObject({ status: "completed", amountCents: rec.finalPriceCents, currency: "EUR" });
    expect(r.payment?.orderId).toMatch(/^ORDER-/);
    expect(r.payment?.captureId).toMatch(/^CAP-/);
    expect(calls.lastAmount).toBe(centsToValue(rec.finalPriceCents));
    // Charged through the vaulted token, with the token the user authorised.
    expect(calls.vaultIds[0]).toMatch(/^TOKEN-/);
    const m = (await getMandate(w.mandate.mandateId))!;
    expect(m.status).toBe("executed");
    expect(m.paymentAttemptId).toBe(r.payment?.paymentAttemptId);
    expect(m.evidence.map((e) => e.type)).toEqual(["mandate_authorized", "execution_claimed", "purchase_executed"]);
    const s = (await getSession(w.session.sessionId))!;
    expect(s).toMatchObject({ approvedOfferId: rec.offerId, approvedBy: "mandate" });
    // The public result carries no owner id and no token.
    expect(JSON.stringify(r)).not.toMatch(/TOKEN-|tokenCipher|ownerId/);
  });

  it("is idempotent: calling again never creates or captures a second payment", async () => {
    const w = await world();
    const { gw, calls } = fakeGateway();
    await executeAutoBuy({ sessionId: w.session.sessionId, ownerId: OWNER }, gw);
    const again = await executeAutoBuy({ sessionId: w.session.sessionId, ownerId: OWNER }, gw);
    expect(again.outcome).toBe("completed");
    expect(calls.create).toBe(1);
    expect(calls.capture).toBe(0);
    expect((await getPaymentsBySession(w.session.sessionId)).length).toBe(1);
  });

  it("concurrent executions produce exactly one payment", async () => {
    const w = await world();
    const { gw, calls } = fakeGateway();
    const results = await Promise.all(Array.from({ length: 6 }, () => executeAutoBuy({ sessionId: w.session.sessionId, ownerId: OWNER }, gw)));
    expect(calls.create).toBe(1);
    expect(results.every((r) => r.outcome === "completed")).toBe(true);
    expect((await getPaymentsBySession(w.session.sessionId)).length).toBe(1);
  });

  it("two different instances racing on the claim: only one wins (compare-and-set)", async () => {
    const w = await world();
    const { casMandate } = await import("@/server/db/store");
    const claim = (n: string) => casMandate("active", { ...w.mandate, status: "executing", failureCode: n, updatedAt: new Date().toISOString() });
    const [a, b] = await Promise.all([claim("A"), claim("B")]);
    expect([a, b].filter(Boolean).length).toBe(1);
  });

  it("blocks over-budget offers: nothing is created at PayPal", async () => {
    const w = await world({
      sessionOver: (s) => {
        // Simulates tampered/inconsistent data: the price somehow exceeds the mandate.
        s.offers.find((o) => o.offerId === s.recommendedOfferId)!.finalPriceCents = s.intent.budgetCents + 500;
      },
    });
    const { gw, calls } = fakeGateway();
    const r = await executeAutoBuy({ sessionId: w.session.sessionId, ownerId: OWNER }, gw);
    expect(r).toMatchObject({ outcome: "blocked", code: "OVER_BUDGET" });
    expect(calls.create).toBe(0);
    expect((await getMandate(w.mandate.mandateId))!.status).toBe("blocked");
    // A blocked mandate stays blocked: calling again cannot buy.
    expect((await executeAutoBuy({ sessionId: w.session.sessionId, ownerId: OWNER }, gw)).outcome).toBe("blocked");
    expect(calls.create).toBe(0);
  });

  it("blocks ineligible offers and unmet mandatory conditions", async () => {
    const a = await world({ sessionOver: (s) => void (s.offers.find((o) => o.offerId === s.recommendedOfferId)!.eligible = false) });
    const g1 = fakeGateway();
    expect(await executeAutoBuy({ sessionId: a.session.sessionId, ownerId: OWNER }, g1.gw)).toMatchObject({ outcome: "blocked", code: "OFFER_INELIGIBLE" });
    expect(g1.calls.create).toBe(0);

    const b = await world({ intent: { preferences: ["free_shipping"] }, sessionOver: (s) => void (s.offers.find((o) => o.offerId === s.recommendedOfferId)!.freeShipping = false) });
    const g2 = fakeGateway();
    expect(await executeAutoBuy({ sessionId: b.session.sessionId, ownerId: OWNER }, g2.gw)).toMatchObject({ outcome: "blocked", code: "CONDITION_NOT_MET" });
    expect(g2.calls.create).toBe(0);
  });

  it("expired mandate: no purchase, and it is recorded as expired", async () => {
    const w = await world();
    const { gw, calls } = fakeGateway();
    const r = await executeAutoBuy({ sessionId: w.session.sessionId, ownerId: OWNER }, gw, () => new Date(Date.now() + 40 * 60_000));
    expect(r.outcome).toBe("expired");
    expect(calls.create).toBe(0);
    expect((await getMandate(w.mandate.mandateId))!.status).toBe("expired");
  });

  it("cancelled mandate: no purchase", async () => {
    const w = await world({ ownerId: randomUUID() });
    await cancelMandate(w.session.ownerId!, w.mandate.mandateId);
    const { gw, calls } = fakeGateway();
    const r = await executeAutoBuy({ sessionId: w.session.sessionId, ownerId: w.session.ownerId! }, gw);
    expect(r.outcome).toBe("cancelled");
    expect(calls.create).toBe(0);
  });

  it("revoked PayPal authorisation: no purchase", async () => {
    const w = await world({ ownerId: randomUUID() });
    await revokeAuthorization(w.session.ownerId!, w.methodId, fakeVault().vault);
    const { gw, calls } = fakeGateway();
    const r = await executeAutoBuy({ sessionId: w.session.sessionId, ownerId: w.session.ownerId! }, gw);
    expect(r.outcome).toBe("cancelled"); // revoking cancelled the mandate first
    expect(calls.create).toBe(0);
  });

  it("authorisation revoked while the mandate is still active (no cascade): blocked, nothing charged", async () => {
    const w = await world({ ownerId: randomUUID() });
    const { savePaymentMethod } = await import("@/server/db/store");
    const method = (await getPaymentMethod(w.methodId))!;
    await savePaymentMethod({ ...method, status: "revoked", tokenCipher: null, updatedAt: new Date().toISOString() });
    const { gw, calls } = fakeGateway();
    const r = await executeAutoBuy({ sessionId: w.session.sessionId, ownerId: w.session.ownerId! }, gw);
    expect(r).toMatchObject({ outcome: "blocked", code: "AUTHORIZATION_REVOKED" });
    expect(calls.create).toBe(0);
  });

  it("waits while the negotiation is still running, and keeps the mandate active", async () => {
    const w = await world({ sessionOver: (s) => void (s.status = "negotiating") });
    const { gw, calls } = fakeGateway();
    const r = await executeAutoBuy({ sessionId: w.session.sessionId, ownerId: OWNER }, gw);
    expect(r.outcome).toBe("waiting");
    expect(calls.create).toBe(0);
    expect((await getMandate(w.mandate.mandateId))!.status).toBe("active");
  });

  it("a user cannot execute someone else's negotiation or mandate", async () => {
    const w = await world();
    const { gw, calls } = fakeGateway();
    await expect(executeAutoBuy({ sessionId: w.session.sessionId, ownerId: OTHER }, gw)).rejects.toMatchObject({ status: 404 });
    expect(calls.create).toBe(0);
  });

  it("refuses a manual negotiation", async () => {
    const s = await prepareSession(intent(), { caller: null, seed: 12 });
    s.ownerId = OWNER;
    await saveSession(s);
    await expect(executeAutoBuy({ sessionId: s.sessionId, ownerId: OWNER }, fakeGateway().gw)).rejects.toBeInstanceOf(AutoBuyError);
  });

  it("PayPal needing the buyer stops the purchase: no capture, no faked approval", async () => {
    const w = await world();
    const { gw, calls } = fakeGateway({ create: "payer_action" });
    const r = await executeAutoBuy({ sessionId: w.session.sessionId, ownerId: OWNER }, gw);
    expect(r).toMatchObject({ outcome: "failed", code: "PAYER_ACTION_REQUIRED" });
    expect(r.payment?.status).toBe("failed");
    expect(calls.capture).toBe(0);
    expect((await getMandate(w.mandate.mandateId))!.status).toBe("failed");
    // The single-use mandate is spent: a retry cannot charge.
    await executeAutoBuy({ sessionId: w.session.sessionId, ownerId: OWNER }, gw);
    expect(calls.create).toBe(1);
  });

  it("a declined payment is shown as failed, never as paid", async () => {
    const w = await world();
    const { gw } = fakeGateway({ create: "declined" });
    const r = await executeAutoBuy({ sessionId: w.session.sessionId, ownerId: OWNER }, gw);
    expect(r.outcome).toBe("failed");
    expect(r.payment?.status).toBe("failed");
  });

  it("an amount mismatch from PayPal is never marked paid; it stays pending reconciliation", async () => {
    const w = await world();
    const { gw } = fakeGateway({ create: "wrong_amount" });
    const r = await executeAutoBuy({ sessionId: w.session.sessionId, ownerId: OWNER }, gw);
    expect(r.outcome).toBe("uncertain");
    expect(r.payment?.status).toBe("unknown_pending_reconciliation");
    expect((await getMandate(w.mandate.mandateId))!.status).toBe("pending_reconciliation");
  });

  it("an uncertain create (timeout) is reconciled with the SAME PayPal request id: never a second charge", async () => {
    const w = await world();
    const fake = fakeGateway({ create: "network" });
    const first = await executeAutoBuy({ sessionId: w.session.sessionId, ownerId: OWNER }, fake.gw);
    expect(first.outcome).toBe("uncertain");
    expect((await getMandate(w.mandate.mandateId))!.status).toBe("pending_reconciliation");

    fake.gw.behavior.create = "completed";
    const second = await executeAutoBuy({ sessionId: w.session.sessionId, ownerId: OWNER }, fake.gw);
    expect(second.outcome).toBe("completed");
    expect(fake.calls.requestIds[0]).toBe(fake.calls.requestIds[1]);
    expect((await getPaymentsBySession(w.session.sessionId)).length).toBe(1);
    expect((await getMandate(w.mandate.mandateId))!.status).toBe("executed");
  });

  it("an order PayPal leaves APPROVED is captured once and verified", async () => {
    const w = await world();
    const { gw, calls } = fakeGateway({ create: "approved_then_capture" });
    const r = await executeAutoBuy({ sessionId: w.session.sessionId, ownerId: OWNER }, gw);
    expect(r.outcome).toBe("completed");
    expect(calls.capture).toBe(1);
  });

  it("two mandates cannot pay the same negotiation twice", async () => {
    const w = await world();
    const { gw, calls } = fakeGateway();
    await executeAutoBuy({ sessionId: w.session.sessionId, ownerId: OWNER }, gw);
    // A second mandate forged onto the same session still cannot create another order.
    const { payWithVault } = await import("@/server/paypal/payments");
    const s = (await getSession(w.session.sessionId))!;
    s.mandateId = "man_second";
    await saveSession(s);
    await expect(payWithVault({ sessionId: s.sessionId, offerId: s.approvedOfferId!, mandateId: "man_second", vaultId: "TOKEN-x" }, gw)).rejects.toMatchObject({ code: "PAYPAL_ALREADY_CAPTURED" });
    expect(calls.create).toBe(1);
  });

  it("lists only the caller's mandates", async () => {
    const owner = randomUUID();
    await world({ ownerId: owner });
    expect((await listMandatesByOwner(owner)).length).toBe(1);
    expect((await listMandatesByOwner(randomUUID())).length).toBe(0);
  });
});

/* ---------- manual checkout stays closed to auto-buy sessions and untouched otherwise ---------- */

describe("manual checkout vs Auto-Buy", () => {
  it("the manual order/capture path refuses an Auto-Buy negotiation", async () => {
    const w = await world();
    const s = (await getSession(w.session.sessionId))!;
    s.approvedOfferId = s.recommendedOfferId;
    await saveSession(s);
    await expect(createPaymentOrder(s.sessionId, undefined, fakeGateway().gw)).rejects.toMatchObject({ code: "CHECKOUT_MODE_MISMATCH" });
  });

  it("the manual capture endpoint refuses an Auto-Buy payment", async () => {
    const w = await world();
    const { gw } = fakeGateway({ create: "wrong_amount" });
    const r = await executeAutoBuy({ sessionId: w.session.sessionId, ownerId: OWNER }, gw);
    await expect(captureOrder(r.payment!.orderId!, gw)).rejects.toBeInstanceOf(PaymentError);
  });

  it("a normal manual negotiation still pays exactly as before", async () => {
    const s = await prepareSession(intent(), { caller: null, seed: 13 });
    s.approvedOfferId = s.recommendedOfferId;
    s.approvedAt = new Date().toISOString();
    await saveSession(s);
    const { gw, calls } = fakeGateway();
    // Manual create returns a plain CREATED order and the buyer approves it in PayPal; here we only check it is created without a vault id.
    gw.create = async (a) => {
      calls.create++;
      calls.vaultIds.push(a.vaultId);
      return { id: `ORDER-${randomUUID()}`, status: "CREATED" };
    };
    const { payment } = await createPaymentOrder(s.sessionId, undefined, gw);
    expect(payment.status).toBe("approval_pending");
    expect(calls.vaultIds[0]).toBeUndefined();
  });
});
