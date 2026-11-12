import { randomUUID } from "node:crypto";
import type { PaymentMethodAuth, PublicPaymentMethod } from "@/shared/contracts/types";
import {
  PayPalHttpError,
  createPaymentToken,
  createSetupToken,
  deletePaymentToken,
  getSetupToken,
  type PayPalPaymentToken,
  type PayPalSetupToken,
} from "@/server/paypal/client";
import { getPaymentMethod, listMandatesByOwner, listPaymentMethodsByOwner, savePaymentMethod, withLock } from "@/server/db/store";
import { cancelMandateRecord } from "./mandate";
import { openToken, sealToken } from "./crypto";

/**
 * The buyer's one-time PayPal authorisation for later charges (PayPal Vault).
 *
 * Official flow (developer.paypal.com/docs/checkout/save-payment-methods/purchase-later/payment-tokens-api/paypal/):
 *   1. setup token -> 2. the buyer approves ON PAYPAL's page (consent is PayPal's, not ours) -> 3. we verify with PayPal
 *   and exchange it for a payment token. We never see or store a PayPal password, cookie or session.
 * The record is only marked `active` after PayPal itself confirmed it.
 */
export class MethodError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface VaultGateway {
  createSetup: typeof createSetupToken;
  getSetup: typeof getSetupToken;
  createToken: typeof createPaymentToken;
  deleteToken: typeof deletePaymentToken;
}
export const realVault: VaultGateway = { createSetup: createSetupToken, getSetup: getSetupToken, createToken: createPaymentToken, deleteToken: deletePaymentToken };

export const toPublicMethod = (m: PaymentMethodAuth): PublicPaymentMethod => ({ methodId: m.methodId, status: m.status, payerEmail: m.payerEmail, createdAt: m.createdAt, verifiedAt: m.verifiedAt });

const baseUrl = () => (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const now = () => new Date().toISOString();

/** The user's usable authorisation, if any (newest active one). */
export async function getActiveMethod(ownerId: string): Promise<PaymentMethodAuth | null> {
  const all = await listPaymentMethodsByOwner(ownerId);
  return all.filter((m) => m.status === "active").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

/** Only PayPal's own hosts are acceptable approval pages: a response can never send the buyer anywhere else. */
export function isPayPalApprovalUrl(href: string): boolean {
  try {
    const u = new URL(href);
    return u.protocol === "https:" && (u.hostname === "paypal.com" || u.hostname.endsWith(".paypal.com"));
  } catch {
    return false;
  }
}

export async function startAuthorization(ownerId: string, vault: VaultGateway = realVault): Promise<{ method: PaymentMethodAuth; approveUrl: string }> {
  const methodId = `pm_${randomUUID()}`;
  let setup: PayPalSetupToken;
  try {
    setup = await vault.createSetup({
      requestId: methodId,
      returnUrl: `${baseUrl()}/api/auto-buy/payment-method/return?m=${methodId}`,
      cancelUrl: `${baseUrl()}/api/auto-buy/payment-method/return?m=${methodId}&cancelled=1`,
      description: "Let AgentDeal Agent D pay with this PayPal account within purchase limits you set (Sandbox).",
    });
  } catch (e) {
    if (e instanceof PayPalHttpError && (e.status === 401 || e.status === 403)) {
      throw new MethodError(503, "VAULT_NOT_ENABLED", "This PayPal Sandbox app is not allowed to save payment methods yet.");
    }
    throw new MethodError(502, "PAYPAL_UNAVAILABLE", "PayPal could not start the authorisation. Try again.");
  }
  const link = setup.links?.find((l) => l.rel === "approve" || l.rel === "payer-action");
  if (!setup.id || !link || !isPayPalApprovalUrl(link.href)) throw new MethodError(502, "PAYPAL_UNAVAILABLE", "PayPal did not return an approval page.");
  const t = now();
  const method: PaymentMethodAuth = {
    methodId,
    ownerId,
    status: "pending",
    setupTokenId: setup.id,
    paypalCustomerId: setup.customer?.id ?? null,
    tokenCipher: null,
    payerEmail: null,
    createdAt: t,
    updatedAt: t,
    verifiedAt: null,
    revokedAt: null,
    failureCode: null,
  };
  await savePaymentMethod(method);
  return { method, approveUrl: link.href };
}

export type CompleteResult = { ok: true; method: PaymentMethodAuth } | { ok: false; reason: "not_found" | "cancelled" | "not_approved" | "paypal_error" };

/** Called when PayPal sends the buyer back. Verifies with PayPal first, and only then stores the (encrypted) token. */
export async function completeAuthorization(ownerId: string, methodId: string, cancelled: boolean, vault: VaultGateway = realVault): Promise<CompleteResult> {
  return withLock(`method:${methodId}`, async () => {
    const m = await getPaymentMethod(methodId);
    // Another user's record looks exactly like a missing one.
    if (!m || m.ownerId !== ownerId) return { ok: false, reason: "not_found" };
    if (m.status === "active") return { ok: true, method: m };
    if (m.status !== "pending") return { ok: false, reason: "not_found" };
    if (cancelled) {
      await savePaymentMethod({ ...m, status: "failed", failureCode: "CANCELLED_BY_BUYER", updatedAt: now() });
      return { ok: false, reason: "cancelled" };
    }
    try {
      const setup = await vault.getSetup(m.setupTokenId);
      if (setup.status === "CREATED" || setup.status === "PAYER_ACTION_REQUIRED") return { ok: false, reason: "not_approved" };
      const token: PayPalPaymentToken = await vault.createToken(m.setupTokenId, `${m.methodId}-token`);
      if (!token.id) return { ok: false, reason: "paypal_error" };
      const t = now();
      const active: PaymentMethodAuth = {
        ...m,
        status: "active",
        tokenCipher: sealToken(token.id, ownerId, methodId),
        paypalCustomerId: token.customer?.id ?? m.paypalCustomerId,
        payerEmail: token.payment_source?.paypal?.email_address ?? null,
        verifiedAt: t,
        updatedAt: t,
        failureCode: null,
      };
      await savePaymentMethod(active);
      return { ok: true, method: active };
    } catch (e) {
      if (e instanceof PayPalHttpError && e.status < 500) {
        await savePaymentMethod({ ...m, status: "failed", failureCode: `HTTP_${e.status}_${e.issue ?? "UNKNOWN"}`.slice(0, 80), updatedAt: now() });
        return { ok: false, reason: "not_approved" };
      }
      return { ok: false, reason: "paypal_error" };
    }
  });
}

/**
 * The PayPal token for one execution. Server-only: it must be both owned by `ownerId` and active, and the ciphertext is
 * bound to that owner, so a copied token fails to decrypt for anyone else.
 */
export async function vaultTokenFor(ownerId: string, methodId: string): Promise<string | null> {
  const m = await getPaymentMethod(methodId);
  if (!m || m.ownerId !== ownerId || m.status !== "active" || !m.tokenCipher) return null;
  try {
    return openToken(m.tokenCipher, ownerId, m.methodId);
  } catch {
    return null;
  }
}

/** Revokes the authorisation on PayPal, then cancels every mandate of the user that had not been executed. */
export async function revokeAuthorization(ownerId: string, methodId: string, vault: VaultGateway = realVault): Promise<{ revoked: boolean; mandatesCancelled: number }> {
  return withLock(`method:${methodId}`, async () => {
    const m = await getPaymentMethod(methodId);
    if (!m || m.ownerId !== ownerId) throw new MethodError(404, "NOT_FOUND", "We couldn't find that PayPal authorisation.");
    if (m.status === "revoked") return { revoked: true, mandatesCancelled: 0 };
    if (m.status === "active" && m.tokenCipher) {
      try {
        await vault.deleteToken(openToken(m.tokenCipher, ownerId, m.methodId));
      } catch (e) {
        // Already gone on PayPal's side is fine; any other failure must not look like a successful revoke.
        if (!(e instanceof PayPalHttpError && e.status === 404)) throw new MethodError(502, "PAYPAL_UNAVAILABLE", "PayPal could not revoke the authorisation. Try again.");
      }
    }
    const t = now();
    // The ciphertext is dropped: after revoke there is nothing left that could charge this buyer.
    await savePaymentMethod({ ...m, status: "revoked", tokenCipher: null, revokedAt: t, updatedAt: t });
    let n = 0;
    for (const mandate of await listMandatesByOwner(ownerId)) {
      if (mandate.paymentMethodId === methodId && mandate.status === "active" && (await cancelMandateRecord(mandate, "authorization_revoked"))) n++;
    }
    return { revoked: true, mandatesCancelled: n };
  });
}
