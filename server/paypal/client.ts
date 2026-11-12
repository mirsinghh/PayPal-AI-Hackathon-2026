/** Thin PayPal REST client. Sandbox only: it refuses to run in any other environment. */

const SANDBOX_API = "https://api-m.sandbox.paypal.com";

export class PayPalHttpError extends Error {
  constructor(
    public status: number,
    public issue: string | null,
    message: string,
    public debugId: string | null,
  ) {
    super(message);
  }
}

/** Network/timeout problems: the outcome on PayPal's side is unknown. */
export class PayPalNetworkError extends Error {}

export function assertSandbox(): void {
  if (process.env.PAYPAL_ENV !== "sandbox") {
    throw new Error("PAYPAL_ENV must be 'sandbox'. AgentD V0 never moves real money.");
  }
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required.");
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  assertSandbox();
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  let res: Response;
  try {
    res = await fetch(`${SANDBOX_API}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new PayPalNetworkError("auth_unreachable");
  }
  if (!res.ok) throw new PayPalHttpError(res.status, "AUTH_FAILED", "PayPal authentication failed", null);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function call<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  opts: { body?: unknown; requestId?: string } = {},
): Promise<T> {
  const token = await accessToken();
  let res: Response;
  try {
    res = await fetch(`${SANDBOX_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...(opts.requestId ? { "PayPal-Request-Id": opts.requestId } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new PayPalNetworkError("unreachable_or_timeout");
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (res.status >= 500) {
    // Outcome unknown for writes: treat like a network problem so we reconcile instead of failing.
    throw new PayPalNetworkError(`paypal_${res.status}`);
  }
  if (!res.ok) {
    throw new PayPalHttpError(
      res.status,
      data?.details?.[0]?.issue ?? data?.name ?? null,
      data?.message ?? "PayPal request failed",
      res.headers.get("paypal-debug-id"),
    );
  }
  return data as T;
}

export function centsToValue(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("invalid_cents");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export interface PayPalCapture {
  id: string;
  status: string;
  amount: { currency_code: string; value: string };
}

export interface PayPalOrder {
  id: string;
  status: string;
  purchase_units?: {
    custom_id?: string;
    amount?: { currency_code: string; value: string };
    payments?: { captures?: PayPalCapture[] };
  }[];
}

export function createPayPalOrder(args: {
  amountCents: number;
  description: string;
  customId: string;
  requestId: string;
  /** Auto-Buy only: the buyer's vaulted PayPal payment token. Absent = the normal order the buyer approves in PayPal. */
  vaultId?: string;
}) {
  return call<PayPalOrder>("POST", "/v2/checkout/orders", {
    requestId: args.requestId,
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: args.customId,
          description: args.description.slice(0, 127),
          amount: { currency_code: "EUR", value: centsToValue(args.amountCents) },
        },
      ],
      ...(args.vaultId ? { payment_source: { paypal: { vault_id: args.vaultId } } } : {}),
    },
  });
}

/* ---------- Vault (save payment methods): the buyer's one-time PayPal authorisation for later charges ---------- */

export interface PayPalLink {
  rel: string;
  href: string;
  method?: string;
}
export interface PayPalSetupToken {
  id: string;
  status: string;
  customer?: { id?: string };
  links?: PayPalLink[];
}
export interface PayPalPaymentToken {
  id: string;
  customer?: { id?: string };
  payment_source?: { paypal?: { email_address?: string; payer_id?: string } };
}

/** Step 1: ask PayPal for an approval page where the buyer consents to save their PayPal for later purchases. */
export function createSetupToken(args: { requestId: string; returnUrl: string; cancelUrl: string; description: string }) {
  return call<PayPalSetupToken>("POST", "/v3/vault/setup-tokens", {
    requestId: args.requestId,
    body: {
      payment_source: {
        paypal: {
          description: args.description.slice(0, 127),
          permit_multiple_payment_tokens: false,
          usage_pattern: "IMMEDIATE",
          usage_type: "MERCHANT",
          customer_type: "CONSUMER",
          experience_context: {
            shipping_preference: "NO_SHIPPING",
            payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED",
            brand_name: "AgentD (Sandbox)",
            locale: "en-US",
            return_url: args.returnUrl,
            cancel_url: args.cancelUrl,
          },
        },
      },
    },
  });
}

export function getSetupToken(setupTokenId: string) {
  return call<PayPalSetupToken>("GET", `/v3/vault/setup-tokens/${encodeURIComponent(setupTokenId)}`);
}

/** Step 2: after the buyer approved, exchange the setup token for the reusable payment token. */
export function createPaymentToken(setupTokenId: string, requestId: string) {
  return call<PayPalPaymentToken>("POST", "/v3/vault/payment-tokens", {
    requestId,
    body: { payment_source: { token: { id: setupTokenId, type: "SETUP_TOKEN" } } },
  });
}

/** Revocation: removes the saved method on PayPal's side, so no further charge is possible. */
export function deletePaymentToken(paymentTokenId: string) {
  return call<Record<string, never>>("DELETE", `/v3/vault/payment-tokens/${encodeURIComponent(paymentTokenId)}`);
}

export function capturePayPalOrder(orderId: string, requestId: string) {
  return call<PayPalOrder>("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    requestId,
    body: {},
  });
}

export function getPayPalOrder(orderId: string) {
  return call<PayPalOrder>("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
}
