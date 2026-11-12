# AgentDeal V5 — Agent Auto-Buy (autonomous checkout)

Status on 2026-11-12: **built and unit-tested end to end, but BLOCKED by one PayPal Sandbox permission.** With the current Sandbox app, PayPal answers `403 NOT_AUTHORIZED` to `POST /v3/vault/setup-tokens`, so the app correctly shows Agent Auto-Buy as *unavailable* (with the reason) and Manual Checkout is unchanged. Nothing in Auto-Buy pretends to work.

## What was verified against the real PayPal Sandbox (read-only probes, no money moved)

| Probe | Result |
|---|---|
| OAuth token with the current Sandbox app | 200 |
| `POST /v3/vault/setup-tokens` (PayPal wallet, `usage_type` MERCHANT or PLATFORM) | **403 `NOT_AUTHORIZED`** "insufficient permissions" |
| `POST /v1/billing-agreements/agreement-tokens` (legacy route) | 201 (token creation works; the charge step needs reference-transaction approval and was not tested) |
| `POST /v2/checkout/orders` with checkout-time vault attributes | 200 (order created, unapproved, no money) |

Leftovers from probing: one unapproved Sandbox order and one unused billing-agreement token. Both are harmless and expire.

## What you must do to unblock it (PayPal side)

1. PayPal Developer Dashboard → **Apps & Credentials → Sandbox →** your app → **App Feature Options → Accept payments**, then **Advanced options → Vault** must be ticked (PayPal's *Save payment methods* doc).
2. The Sandbox **business** account behind the app must be approved for saving PayPal payment methods: paypal.com (Sandbox business login) → Account Settings → Payment Preferences → **Save PayPal and Venmo payment methods**. PayPal's own page says the account "must be approved and have your account configured for billing agreements" for reference transactions (a request to your PayPal account manager in production; in Sandbox, check the toggle above).
3. Reload `http://localhost:3000/api/auto-buy/status`. When `"available": true` the selector unlocks by itself. No code change needed. The status is re-probed every minute while blocked (10 minutes once available).

## What you must do on our side

1. **Supabase**: re-run `supabase/schema.sql` in the SQL editor (idempotent). It adds `payment_methods` (encrypted PayPal token, RLS on, **no policy**: nobody can read it with the anon key) and `purchase_mandates` (owner can read own, server writes only, unique per negotiation).
2. **Token key**: set `AUTOBUY_ENCRYPTION_KEY` (64 hex chars, `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). Locally, if unset, a dev key is derived from `PAYPAL_CLIENT_SECRET`; **never** in production (Vercel): Auto-Buy stays unavailable until the key exists.
3. `APP_BASE_URL` must be the URL you run on (PayPal sends the buyer back to `APP_BASE_URL/api/auto-buy/payment-method/return`).
4. A Sandbox **personal** (buyer) account to authorise with. Never a real account.

## Flow

1. Brief → **How should Agent D check out?** `[ Manual Checkout | Agent Auto-Buy ]` (default Manual; no login needed for Manual).
2. Auto-Buy → (a) sign in to AgentDeal (existing Supabase Auth) → (b) **Authorise PayPal**: `POST /api/auto-buy/payment-method` creates a Vault setup token and sends the buyer to PayPal's own consent page; PayPal returns to `/api/auto-buy/payment-method/return`, where the server asks PayPal whether the setup token was approved and only then exchanges it for a payment token (stored AES-256-GCM encrypted, bound to user and record). → (c) the **purchase mandate** block + the checkbox with the exact sentence *"Authorize Agent D to purchase one eligible offer within these limits."* The toggle alone is never consent.
3. `POST /api/negotiations` (with `checkoutMode: "auto_buy"` + that sentence) checks login, PayPal authorisation and consent **before any AI call**, then creates the negotiation and the mandate together. The mandate is derived by the server from the negotiation's own intent (budget in integer cents, EUR, preferences become mandatory conditions, valid 30 min, one purchase). The client cannot widen it.
4. Negotiation plays as usual. When it finishes, Agent D shows a 3-second **Cancel authorisation** window, then calls `POST /api/auto-buy/execute { sessionId }` (no amount, offer or mandate id from the browser).
5. The server: loads session + mandate for the verified caller → `evaluateMandate` (active, not expired, same user/session, recommended offer exists, eligible, not expired, ≤ budget, every required condition met) → compare-and-set `active → executing` (only one execution can win, across instances) → approves the one offer as `approvedBy: "mandate"` → `payWithVault`: same amount-from-stored-offer, same idempotent create (saved before the PayPal call, same `PayPal-Request-Id` on retries), same capture verification (status, currency, amount, `custom_id`) as manual → mandate `executed` / `failed` / `pending_reconciliation`.
6. Agent D shows progress from persisted state and, only for a verified capture, the receipt (product, simulated seller, final price, amount captured, order id, capture id, verification) with the `payment_approved` animation (distinct from `success`, used for "negotiation complete").

## Safety properties (each has a test in `tests/autobuy.test.ts`)

Never over budget · never an ineligible or expired offer · never an expired/cancelled/blocked mandate · one purchase per mandate (concurrency, retries, two instances, a forged second mandate) · cancellable until execution starts · revoking PayPal deletes the token on PayPal, drops the ciphertext and cancels pending mandates · tokens unreadable by other users (AAD-bound), absent from API output, from the browser and from the AI · Groq/Gemini never see tokens or mandates (they only write the negotiation) · uncertain PayPal outcomes are never "paid": they reconcile with the same request id · PayPal asking for the buyer (`PAYER_ACTION_REQUIRED`) stops the purchase (we never simulate clicks or logins) · manual endpoints refuse Auto-Buy negotiations and vice versa · evidence log (`mandate_authorized → execution_claimed → purchase_executed`) with the consent wording and its version.

## Not verified against PayPal yet (needs the Vault permission)

The pieces below follow PayPal's docs but could not be exercised because Vault is blocked: the status value a setup token has after the buyer approves (we only refuse `CREATED` / `PAYER_ACTION_REQUIRED` and let the token exchange itself be the proof), whether the vaulted order comes back `COMPLETED` or `APPROVED` (both are handled), EUR with Vault, and whether PayPal wants `PayPal-Client-Metadata-Id` (risk data) on the order call. Expect to adjust `server/paypal/client.ts` (`createSetupToken`, `createPayPalOrder`) if the first real call says otherwise. The first Auto-Buy purchase performs a real Sandbox capture: do it deliberately.

## Demo script (once `available: true`)

1. Sign in. 2. Brief → Agent Auto-Buy → Authorise PayPal (Sandbox buyer). 3. Back on the brief: type the request, tick the sentence, **Start Auto-Buy negotiation**. 4. Watch the room; the 3-second window; the stages; the receipt. 5. My Activity → *Agent Auto-Buy* chip → open **Your authorisation** to show the consent text and evidence trail. 6. For contrast, one **Manual Checkout** run.
