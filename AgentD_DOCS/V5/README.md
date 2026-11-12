# AgentD V5

V5 is the final version: the V3 explanatory landing and recorded demo, the V4 real negotiation flow, plus accounts, persistent history and a per-negotiation choice between **Server Rules** and **AI Agents**. Read `AUDIT.md` first (what called which provider before V5).

## Flow

Landing → brief (request + response mode) → Negotiation Room → Decision Lab / offers → approval → PayPal Sandbox → result → History.

| Route | Screen |
|---|---|
| `/` | Landing: hero, How it works (5 steps), recorded demo, the two reply modes, benefits, human approval, PayPal Sandbox, what is real, final CTA |
| `/brief` | "Tell Agent D": request, budget, priority, preferences, **response mode switch** |
| `/negotiation/[id]` | Negotiation Room (live for AI, replay for rules), mode chip + banner |
| `/deals/[id]` | Recommendation, Decision Lab, comparison, approval |
| `/checkout/[id]` | PayPal Sandbox checkout |
| `/login`, `/signup` | Supabase Auth forms |
| `/profile`, `/history` | Identity, stats, latest negotiations; Requests / Analyses / Negotiations views |
| `/activity` | Activity stored in this browser (guests) |

## Response mode (selector)

- **UI**: `components/v5/ResponseModeSwitch.tsx`, a radio group styled as a segmented pill (keyboard: arrows/Tab; touch targets 44 px). "AI Responses" is disabled with the reason when `/api/config` says AI is unavailable.
- **Contract**: `POST /api/negotiations` body adds `responseMode: "server" | "ai"`; anything else is `400 INVALID_RESPONSE_MODE`. Stored as `session.responseMode`, immutable for the session. The response and `GET /api/negotiations/[id]` return it with `mode` (what actually ran: `v0_rules` or `multi_agent`) and `fallbackReason`.
- **Engine choice** (`server/negotiation/service.ts → startNegotiation`): `server` → deterministic engine, never touches a negotiation provider. `ai` → live agents on `NEGOTIATION_PROVIDER`; if the provider has no key, is `rules`, is rate-limited (per-provider breaker), the product has no catalogue match, the budget is below the catalogue, or the hourly run cap is hit, the session falls back to the rules engine **and records the reason**. Omitted mode (legacy API callers) follows `MULTI_AGENT_NEGOTIATION` as before V5.
- **Analysis**: `explanationCaller()` uses `ANALYSIS_PROVIDER`; it takes no mode argument. Tests assert the same analysis call in both modes (`tests/response-mode.test.ts`).
- **Honesty labels**: `lib/v5/response-mode.ts` (`modeBanner`, `modeChip`); per-turn origin labels and the "turns by AI" chip come from V4 (`lib/v4/provider.ts`).
- **Mixing**: a live AI run can contain labelled per-turn rules fallbacks (`AGENT_FALLBACK`); a rules run never contains AI turns. The mode cannot change mid-run.

## Accounts and persistence

- `server/auth/supabase.ts`: GoTrue REST (signup, password login, refresh, user, logout). `server/auth/request.ts`: cookies (`ad_at`, `ad_rt`, `httpOnly`, `SameSite=Lax`, `Secure` in production), verification with a 30 s cache, refresh on expiry, `ownerAllowed()`.
- Routes: `/api/auth/{signup,login,logout,me}`, `/api/history`.
- Data model (one `sessions` row = request + analysis + negotiation; payments reference the session): see `supabase/schema.sql`. Flat columns: `user_id, product_query, budget_cents, priority, status, response_mode, engine_mode, fallback_reason, analysis_source/provider/model/summary, offer_count, winner_seller/product, initial/final_price_cents, savings_cents, approved_offer_id`. Payments keep only order id, status, amount, currency and the owner. The full objects remain in `data jsonb`.
- If the V5 migration has not been applied, writes retry with the original columns, so negotiations and payments keep working (history stays empty until the SQL is run).
- Saved savings in the profile are counted only for deals with a completed Sandbox payment.

## Honest verification status

Verified here: unit/integration tests (342), typecheck, lint, production build; response-mode behaviour on the real Groq provider (rules mode: 0 negotiation calls, analysis on Groq; AI mode: 9 of 10 agent turns by AI, 1 labelled fallback, 2 server rejections, 0 HTTP 429, ~14 s); PayPal Sandbox order creation (approval required first, amount from the server, client `amount` ignored); the signed-in UI, history and cross-user isolation against a **local Supabase stand-in** (not the real Supabase).
Not verified from this machine: real Supabase Auth/RLS (no project keys here), the PayPal buyer approval + capture (needs a Sandbox personal login), the public deployment. Run the manual checklist in the README before the demo.

## Demo script (≈3 min video)

1. **Landing** (0:00): hero line, scroll "How it works", press play on the recorded demo ("pre-recorded, not saved, no AI calls").
2. **Account** (0:30): Sign in with the demo account.
3. **Server Responses** (0:40): "headphones under €300", Server Responses → room shows *Server Responses* chip, "No AI model wrote these replies"; open the Decision Lab.
4. **AI Responses** (1:20): new negotiation, same request, **AI Responses** → live agents, per-message provider labels, any "Rules fallback" or server-rejected proposal called out; compare with the previous run.
5. **Pay** (2:10): approve the recommended offer → PayPal Sandbox → Capture confirmed.
6. **Profile** (2:40): History → Negotiations: both modes side by side, payment status, savings.
7. Close with "AI proposes, the server validates, a human decides."

Tips: set `ANALYSIS_PROVIDER=groq` for a ~1 s analysis if Gemini is slow; keep `MULTI_AGENT_DEADLINE_MS=120000`; do one AI run before recording to warm the provider.
