import { authConfigured } from "@/server/auth/supabase";
import { PayPalHttpError, PayPalNetworkError, assertSandbox, createSetupToken } from "@/server/paypal/client";
import { encryptionKey } from "./crypto";

/**
 * Can Agent D really charge a saved PayPal method in this deployment? Auto-Buy is offered ONLY if every part is true.
 * The PayPal part is checked against PayPal itself (a Vault setup token is requested; it moves no money): a Sandbox
 * app without the Vault permission answers 403 NOT_AUTHORIZED and Auto-Buy stays unavailable, with the reason.
 */
export type AutoBuyBlocker = "accounts_unavailable" | "paypal_not_configured" | "encryption_key_missing" | "vault_not_enabled" | "vault_error" | "paypal_unreachable";

export interface AutoBuyCapability {
  available: boolean;
  blocker: AutoBuyBlocker | null;
  checkedAt: string;
}

export const BLOCKER_TEXT: Record<AutoBuyBlocker, string> = {
  accounts_unavailable: "accounts are not configured on this deployment",
  paypal_not_configured: "PayPal Sandbox credentials are missing",
  encryption_key_missing: "no key is configured to protect saved PayPal tokens",
  vault_not_enabled: "this PayPal Sandbox app is not allowed to save payment methods yet (Vault permission)",
  vault_error: "PayPal rejected the Vault request used to check Auto-Buy",
  paypal_unreachable: "PayPal could not be reached to check the Vault permission",
};

let cache: { value: AutoBuyCapability; until: number } | null = null;
const OK_MS = 10 * 60_000;
const NO_MS = 60_000;
export function resetCapabilityCache() {
  cache = null;
}

type Probe = () => Promise<void>;
const realProbe: Probe = async () => {
  await createSetupToken({
    requestId: crypto.randomUUID(),
    returnUrl: `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/brief`,
    cancelUrl: `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/brief`,
    description: "AgentD Auto-Buy capability check",
  });
};

export async function autoBuyCapability(probe: Probe = realProbe, env: NodeJS.ProcessEnv = process.env): Promise<AutoBuyCapability> {
  if (cache && cache.until > Date.now()) return cache.value;
  const done = (blocker: AutoBuyBlocker | null): AutoBuyCapability => {
    const value = { available: blocker === null, blocker, checkedAt: new Date().toISOString() };
    cache = { value, until: Date.now() + (blocker === null ? OK_MS : NO_MS) };
    return value;
  };
  if (!authConfigured(env)) return done("accounts_unavailable");
  try {
    assertSandbox();
  } catch {
    return done("paypal_not_configured");
  }
  if (!encryptionKey(env)) return done("encryption_key_missing");
  try {
    await probe();
    return done(null);
  } catch (e) {
    if (e instanceof PayPalHttpError && (e.status === 401 || e.status === 403)) return done("vault_not_enabled");
    if (e instanceof PayPalNetworkError) return done("paypal_unreachable");
    if (e instanceof PayPalHttpError) return done("vault_error");
    return done("paypal_unreachable");
  }
}
