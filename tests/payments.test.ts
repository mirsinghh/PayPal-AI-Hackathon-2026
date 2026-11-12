import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Isolated store per test run; must be set before importing the store.
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "agentdeal-"));

import { prepareSession } from "@/server/negotiation/service";
import { getSession, saveSession } from "@/server/db/store";
import {
  PaymentError,
  captureOrder,
  createPaymentOrder,
  getPaymentStatus,
  type Gateway,
} from "@/server/paypal/payments";
import { PayPalHttpError, PayPalNetworkError, centsToValue, type PayPalOrder } from "@/server/paypal/client";
import type { NegotiationSession, ProductIntent } from "@/shared/contracts/types";

const intent: ProductIntent = {
  productQuery: "Wireless noise-cancelling headphones",
  budgetCents: 35_000,
  currency: "EUR",
  priority: "best_value",
  preferences: [],
  language: "en",
};

async function approvedSession(): Promise<NegotiationSession> {
  const s = await prepareSession(intent, { caller: null, seed: 11 });
  s.approvedOfferId = s.recommendedOfferId;
  s.approvedAt = new Date().toISOString();
  await saveSession(s);
  return s;
}

function fakeGateway() {
  const calls = { create: 0, capture: 0, get: 0, lastAmount: "" };
  let orderSeq = 0;
  const orders = new Map<string, { amountCents: number; customId: string; captured: boolean }>();
  const completedOrder = (id: string, over: Partial<{ value: string; currency: string }> = {}): PayPalOrder => {
    const o = orders.get(id)!;
    return {
      id,
      status: "COMPLETED",
      purchase_units: [
        {
          custom_id: o.customId,
          payments: {
            captures: [
              {
                id: `CAP-${id}`,
                status: "COMPLETED",
                amount: { currency_code: over.currency ?? "EUR", value: over.value ?? centsToValue(o.amountCents) },
              },
            ],
          },
        },
      ],
    };
  };
  const gw: Gateway & { behavior: { capture: "ok" | "network" | "not_approved" | "wrong_amount" | "already" } } = {
    behavior: { capture: "ok" },
    async create(a) {
      calls.create++;
      calls.lastAmount = centsToValue(a.amountCents);
      const id = `ORDER-${randomUUID()}-${++orderSeq}`;
      orders.set(id, { amountCents: a.amountCents, customId: a.customId, captured: false });
      return { id, status: "CREATED" };
    },
    async capture(id) {
      calls.capture++;
      const b = gw.behavior.capture;
      if (b === "network") throw new PayPalNetworkError("timeout");
      if (b === "not_approved") throw new PayPalHttpError(422, "ORDER_NOT_APPROVED", "x", null);
      if (b === "already") throw new PayPalHttpError(422, "ORDER_ALREADY_CAPTURED", "x", null);
      if (b === "wrong_amount") return completedOrder(id, { value: "1.00" });
      orders.get(id)!.captured = true;
      return completedOrder(id);
    },
    async get(id) {
      calls.get++;
      return orders.get(id)!.captured ? completedOrder(id) : { id, status: "APPROVED" };
    },
  };
  return { gw, calls, orders };
}

beforeEach(() => {
  /* each test builds its own session */
});

describe("PayPal order creation", () => {
  it("refuses to create an order before human approval (SEC-03)", async () => {
    const s = await prepareSession(intent, { caller: null, seed: 3 });
    await saveSession(s);
    const { gw, calls } = fakeGateway();
    await expect(createPaymentOrder(s.sessionId, undefined, gw)).rejects.toMatchObject({ code: "NOT_APPROVED" });
    expect(calls.create).toBe(0);
  });

  it("uses the stored final price and ignores any other offer id (SEC-01/02)", async () => {
    const s = await approvedSession();
    const winner = s.offers.find((o) => o.offerId === s.recommendedOfferId)!;
    const other = s.offers.find((o) => o.offerId !== s.recommendedOfferId)!;
    const { gw, calls } = fakeGateway();
    await expect(createPaymentOrder(s.sessionId, other.offerId, gw)).rejects.toMatchObject({ code: "OFFER_MISMATCH" });
    const { payment } = await createPaymentOrder(s.sessionId, undefined, gw);
    expect(payment.amountCents).toBe(winner.finalPriceCents);
    expect(calls.lastAmount).toBe(centsToValue(winner.finalPriceCents));
  });

  it("is idempotent: a second call reuses the same order", async () => {
    const s = await approvedSession();
    const { gw, calls } = fakeGateway();
    const a = await createPaymentOrder(s.sessionId, undefined, gw);
    const b = await createPaymentOrder(s.sessionId, undefined, gw);
    expect(b.reused).toBe(true);
    expect(b.payment.orderId).toBe(a.payment.orderId);
    expect(calls.create).toBe(1);
  });

  it("rejects when the offer has expired", async () => {
    const s = await approvedSession();
    const stored = (await getSession(s.sessionId))!;
    stored.offers.forEach((o) => (o.offerExpiresAt = new Date(Date.now() - 1000).toISOString()));
    await saveSession(stored);
    const { gw } = fakeGateway();
    await expect(createPaymentOrder(s.sessionId, undefined, gw)).rejects.toMatchObject({ code: "OFFER_EXPIRED" });
  });
});

describe("PayPal capture", () => {
  it("captures once and returns the same result for repeated/concurrent calls (SEC-04, QA-06c)", async () => {
    const s = await approvedSession();
    const { gw, calls } = fakeGateway();
    const { payment } = await createPaymentOrder(s.sessionId, undefined, gw);
    const [r1, r2] = await Promise.all([captureOrder(payment.orderId!, gw), captureOrder(payment.orderId!, gw)]);
    expect(r1.status).toBe("completed");
    expect(r2.captureId).toBe(r1.captureId);
    expect(calls.capture).toBe(1);
    expect((await captureOrder(payment.orderId!, gw)).status).toBe("completed");
    expect(calls.capture).toBe(1);
  });

  it("does not declare success on a PayPal amount mismatch (SEC-08)", async () => {
    const s = await approvedSession();
    const { gw } = fakeGateway();
    gw.behavior.capture = "wrong_amount";
    const { payment } = await createPaymentOrder(s.sessionId, undefined, gw);
    await expect(captureOrder(payment.orderId!, gw)).rejects.toMatchObject({ code: "PAYPAL_UNCONFIRMED" });
    const status = await getPaymentStatus(payment.orderId!, gw).catch((e: PaymentError) => e);
    expect(status).not.toMatchObject({ status: "completed" });
  });

  it("marks the outcome unknown after a timeout, then reconciles without recapturing (QA-06e)", async () => {
    const s = await approvedSession();
    const { gw, calls, orders } = fakeGateway();
    const { payment } = await createPaymentOrder(s.sessionId, undefined, gw);
    gw.behavior.capture = "network";
    await expect(captureOrder(payment.orderId!, gw)).rejects.toMatchObject({ code: "PAYPAL_UNCONFIRMED", status: 502 });
    // PayPal actually captured it while we were disconnected.
    orders.get(payment.orderId!)!.captured = true;
    const status = await getPaymentStatus(payment.orderId!, gw);
    expect(status.status).toBe("completed");
    expect(calls.capture).toBe(1);
  });

  it("asks for approval when the buyer has not approved yet", async () => {
    const s = await approvedSession();
    const { gw } = fakeGateway();
    gw.behavior.capture = "not_approved";
    const { payment } = await createPaymentOrder(s.sessionId, undefined, gw);
    await expect(captureOrder(payment.orderId!, gw)).rejects.toMatchObject({ code: "PAYPAL_NOT_APPROVED" });
    expect((await getPaymentStatus(payment.orderId!, gw)).status).toBe("approval_pending");
  });

  it("verifies instead of recapturing when PayPal says already captured", async () => {
    const s = await approvedSession();
    const { gw, orders } = fakeGateway();
    const { payment } = await createPaymentOrder(s.sessionId, undefined, gw);
    orders.get(payment.orderId!)!.captured = true;
    gw.behavior.capture = "already";
    expect((await captureOrder(payment.orderId!, gw)).status).toBe("completed");
  });
});
