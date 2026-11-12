# Future: autonomous purchase with prior consent (NOT implemented)

Today's checkout is **agent-assisted**: after your explicit approval and the server's confirmation, Agent D opens the checkout and prepares the PayPal order, but **you** authorise the payment with PayPal's own button, and the server verifies the capture. This document lists what a future *autonomous* mode would need. None of it exists in this repository, and nothing in the current code pretends otherwise.

## What is deliberately not done
- No clicking PayPal buttons on the user's behalf, no reuse of PayPal cookies or sessions, no bypass of PayPal authentication.
- No payment without the buyer present; no stored credentials.

## What an autonomous mode would require

1. **Persistent identity and ownership.** Accounts (or at least signed, server-side sessions) so an order and a consent belong to one person. Today there are no accounts and anyone holding a session id can open it.
2. **An explicit, verifiable consent record.** What the agent may buy (categories, merchants), the maximum amount per purchase and per period, an expiry, and the exact wording the user agreed to. Stored server-side, versioned, shown back to the user.
3. **A way to revoke at any time**, effective immediately, plus notification of every action taken under the consent.
4. **PayPal-side authorisation for future charges.** PayPal documents saving a payment method / vaulting with the buyer's consent so a merchant can charge later (see PayPal's *Save payment methods* documentation). Availability depends on the integration type and account permissions and must be confirmed in the PayPal dashboard before building. A saved PayPal *login session* is not a substitute for this.
5. **Strong-customer-authentication handling.** For EU payers, some charges can require a fresh step-up from the buyer; the agent must stop and hand back to the human when PayPal asks.
6. **Hard server-side limits.** Per-purchase and per-period caps, an allowlist of merchants, the existing price/eligibility validators as a precondition, and a "human approval required above X" threshold.
7. **Idempotency and reconciliation** (already present for capture): a unique request id per intended purchase so a retry can never double-charge; reconcile uncertain results with PayPal (webhooks such as capture-completed plus the existing status check).
8. **Audit trail and receipts** for each autonomous action: which consent, which negotiation events, which validated offer, which PayPal order and capture, with the amount compared against the approved offer (the "verified path" already does this for the assisted flow).
9. **Abuse and safety controls.** Rate limits, anomaly detection, a kill switch, and clear separation between a *recommendation*, an *approval under consent*, and a *payment*.
10. **Legal and policy review.** Terms for delegated purchasing, refund/dispute handling, data protection (consent and payment-token storage), and the PayPal agreements that apply.

## Suggested path
1. Accounts + ownership; 2. consent model with limits and revocation; 3. PayPal vaulting in Sandbox behind a feature flag; 4. a dry-run mode that shows what the agent *would* buy; 5. only then enable real charges, for Sandbox first.
