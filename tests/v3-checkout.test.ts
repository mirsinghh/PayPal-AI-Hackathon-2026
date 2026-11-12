import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "agentd-v3co-"));

import { prepareSession } from "@/server/negotiation/service";
import { saveSession } from "@/server/db/store";
import { PaymentError, captureOrder, createPaymentOrder, type Gateway } from "@/server/paypal/payments";
import { centsToValue, type PayPalOrder } from "@/server/paypal/client";
import { buildTrail, type TrailInput } from "@/lib/v3/trail";
import type { NegotiationSession, Offer, ProductIntent } from "@/shared/contracts/types";

const intent: ProductIntent = { productQuery: "Wireless noise-cancelling headphones", budgetCents: 35_000, currency: "EUR", priority: "best_value", preferences: [], language: "en" };

function gateway() {
  const calls = { create: 0, capture: 0 };
  const orders = new Map<string, { amountCents: number; customId: string; captured: boolean }>();
  const completed = (id: string): PayPalOrder => {
    const o = orders.get(id)!;
    return { id, status: "COMPLETED", purchase_units: [{ custom_id: o.customId, payments: { captures: [{ id: `CAP-${id}`, status: "COMPLETED", amount: { currency_code: "EUR", value: centsToValue(o.amountCents) } }] } }] } as unknown as PayPalOrder;
  };
  const gw: Gateway = {
    async create(a) {
      calls.create++;
      const id = `ORDER-${randomUUID()}`;
      orders.set(id, { amountCents: a.amountCents, customId: a.customId, captured: false });
      return { id, status: "CREATED" };
    },
    async capture(id) {
      calls.capture++;
      orders.get(id)!.captured = true;
      return completed(id);
    },
    async get(id) {
      return orders.get(id)!.captured ? completed(id) : ({ id, status: "APPROVED" } as PayPalOrder);
    },
  };
  return { gw, calls };
}

async function session(approved: boolean): Promise<NegotiationSession> {
  const s = await prepareSession(intent, { caller: null, seed: 21 });
  if (approved) {
    s.approvedOfferId = s.recommendedOfferId;
    s.approvedAt = new Date().toISOString();
  }
  await saveSession(s);
  return s;
}

describe("assisted checkout: Agent D prepares the order, the buyer still authorises", () => {
  it("prepares nothing before the explicit approval (no order, no PayPal call)", async () => {
    const s = await session(false);
    const { gw, calls } = gateway();
    await expect(createPaymentOrder(s.sessionId, undefined, gw)).rejects.toBeInstanceOf(PaymentError);
    expect(calls.create).toBe(0);
  });

  it("prepare-then-click reuses one order with the server's amount; capture is verified against it", async () => {
    const s = await session(true);
    const winner = s.offers.find((o) => o.offerId === s.recommendedOfferId) as Offer;
    const { gw, calls } = gateway();

    const prepared = await createPaymentOrder(s.sessionId, undefined, gw); // what the page does on load
    const clicked = await createPaymentOrder(s.sessionId, undefined, gw); // what a retry/click would do
    expect(prepared.reused).toBe(false);
    expect(clicked.reused).toBe(true);
    expect(clicked.payment.orderId).toBe(prepared.payment.orderId);
    expect(calls.create).toBe(1);
    expect(prepared.payment.amountCents).toBe(winner.finalPriceCents); // never taken from the browser

    const paid = await captureOrder(prepared.payment.orderId as string, gw);
    expect(paid.status).toBe("completed");
    expect(paid.amountCents).toBe(winner.finalPriceCents);
    // Capturing again (a double click, a refresh) does not capture twice.
    const again = await captureOrder(prepared.payment.orderId as string, gw);
    expect(again.captureId).toBe(paid.captureId);
    expect(calls.capture).toBe(1);
  });
});

describe("verified path with a prepared order", () => {
  const offer = { offerId: "o", finalPriceCents: 8_796 } as Offer;
  const base: TrailInput = { negotiationFinished: true, engine: "rules", approvedAt: "2026-11-12T10:39:00Z", offer, phase: "ready", payment: null, prepared: { orderId: "ORD-1", amountCents: 8_796 } };

  it("says the order is prepared but not charged, with the order and amount as evidence", () => {
    const pay = buildTrail(base)[2];
    expect(pay.state).toBe("current");
    expect(pay.detail).toMatch(/prepared the PayPal order/);
    expect(pay.detail).toMatch(/Nothing is charged until you authorise/);
    expect(pay.evidence).toEqual([
      { label: "Prepared PayPal order", value: "ORD-1" },
      { label: "Amount in the order", value: "€87.96" },
    ]);
    // Capture is still not confirmed.
    expect(buildTrail(base)[3].state).toBe("todo");
  });

  it("warns, instead of hiding it, if the prepared amount differs from the approved offer", () => {
    const pay = buildTrail({ ...base, prepared: { orderId: "ORD-1", amountCents: 9_999 } })[2];
    expect(pay.state).toBe("warn");
    expect(pay.detail).toMatch(/differs from the approved offer/);
  });

  it("shows no prepared order before approval", () => {
    expect(buildTrail({ ...base, approvedAt: null, offer: null, phase: null })[2].evidence).toEqual([]);
  });
});
