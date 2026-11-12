# Agent D V5 — Vercel deployment

Public name: **Agent D** ("Agent D, it always gets you the best deal."). The repository, package and database keep the technical name `agentdeal`; nothing technical was renamed.
Scope of the demo: four **simulated** stores, offers compared only inside that simulated environment (not the whole market), payments in **PayPal Sandbox** only.

Check any configuration (names and messages only, never values):

```bash
npm run check:env
```

For the real Vercel values: `vercel env pull .env.vercel` then `node --env-file=.env.vercel scripts/check-env.mjs --vercel`.

## Recommended Hackathon Deployment Configuration

Set these in **Vercel → Project → Settings → Environment Variables**, for **Production** and **Preview** (leave Development empty unless you use `vercel dev`). Mark every secret as **Sensitive**. Redeploy after any change: Vercel applies variables only to new deployments.

| Variable | Value | Secret |
|---|---|---|
| `AI_PROVIDER` | `groq` | no |
| `GROQ_API_KEY` | your Groq key | **yes** |
| `GROQ_BUYER_MODEL` | `openai/gpt-oss-120b` | no |
| `GROQ_SELLER_MODEL` | `openai/gpt-oss-20b` | no |
| `GROQ_EXPLANATION_MODEL` | `openai/gpt-oss-120b` | no |
| `GROQ_BUYER_REASONING` | `low` | no |
| `GROQ_SELLER_REASONING` | `low` | no |
| `GROQ_STRUCTURED` | `strict` | no |
| `GROQ_MAX_CONCURRENCY` | `2` | no |
| `MULTI_AGENT_NEGOTIATION` | `false` | no |
| `MULTI_AGENT_DEADLINE_MS` | `30000` | no |
| `SUPABASE_URL` | project URL | no |
| `SUPABASE_ANON_KEY` | anon / publishable key | no (but keep it server-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | secret key | **yes** |
| `PAYPAL_ENV` | `sandbox` | no |
| `PAYPAL_CLIENT_ID` | Sandbox app client id | no (PayPal's checkout page needs it in the browser) |
| `PAYPAL_CLIENT_SECRET` | Sandbox app secret | **yes** |
| `APP_BASE_URL` | `https://<your-domain>` (no trailing slash) | no |

What this gives you: **Groq is the main provider** (buyer GPT-OSS 120B, sellers GPT-OSS 20B), **server rules are the automatic backup** (nothing extra to configure: it is built in), the **AI Agents / Server Rules** pill stays on screen, and nothing touches real money.

Do **not** set: `AI_API_KEY`, `AI_MODEL`, `AI_RPM_LIMIT` (Gemini only), `ANALYSIS_PROVIDER`, `NEGOTIATION_PROVIDER` (default to `AI_PROVIDER`), `MULTI_AGENT_ENGINE` (test only), `DATA_DIR`, `DEMO_USER_*` (local only), `AGENTS_DEBUG`. Leave `AUTOBUY_ENCRYPTION_KEY` empty unless Agent Auto-Buy is enabled (it is blocked until PayPal enables Vault: see `AUTO_BUY.md`).

### One-time setup order
1. **Supabase**: create a project, run `supabase/schema.sql` in the SQL editor (idempotent; it also creates the Auto-Buy tables), copy the three keys. For a smooth demo turn **Authentication → Email → "Confirm email" off**, or create a user with `scripts/create-demo-user.mjs`.
2. **PayPal**: Developer Dashboard → Sandbox → your REST app → copy Client ID and Secret. Use a Sandbox **personal** account to pay. No webhooks are used.
3. **Vercel**: import the repo (framework Next.js, defaults), add the variables above, deploy.
4. **Verify**: open `https://<domain>/api/config`. You want `"provider":"groq"` and `"aiResponses":{"available":true,...}`. Then run one negotiation in each mode.

## Full variable reference

Public = shipped to browsers. **No variable in this project is `NEXT_PUBLIC_*`**, so no value below reaches the browser bundle. (The checkout page passes the PayPal *client id* to PayPal's SDK as a prop: it is a public identifier by PayPal's design.)

Env column: **P** Production, **Pv** Preview, **D** Development (`vercel dev` only).

| Name | Purpose | Required | Visibility | Demo value | Envs | If missing |
|---|---|---|---|---|---|---|
| `NODE_ENV` | Set by Next/Vercel. Turns on `Secure` cookies in production. | auto | private | (automatic) | automatic | n/a |
| `VERCEL` | Set by Vercel. Makes the server refuse JSON-file storage and cap the AI time budget at 40 s. | auto | private | (automatic) | automatic | n/a |
| `PAYPAL_ENV` | Must be exactly `sandbox`; any other value disables every payment. | **yes** | private | `sandbox` | P, Pv | Checkout shows "PayPal Sandbox isn't configured". No payments. |
| `PAYPAL_CLIENT_ID` | PayPal Sandbox REST app id (server calls + checkout button). | **yes** | public-by-design | Sandbox id | P, Pv | No checkout. |
| `PAYPAL_CLIENT_SECRET` | PayPal Sandbox REST app secret. | **yes** | **private** | Sandbox secret | P, Pv | No orders or captures. |
| `SUPABASE_URL` | Supabase project URL (storage + Auth). | **yes on Vercel** | private | project URL | P, Pv | Negotiations cannot be stored: `/api/negotiations` answers 503 `STORAGE_NOT_CONFIGURED`. |
| `SUPABASE_ANON_KEY` | Public Supabase key used for Auth and RLS-scoped history reads (server-side only here). | **yes on Vercel** | private (public-grade key) | anon key | P, Pv | Accounts, login and history disabled. |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key: the only writer of sessions/payments. | **yes on Vercel** | **private** | secret key | P, Pv | Storage not configured (as above). Never expose it. |
| `AI_PROVIDER` | Default AI provider: `groq`, `gemini` or `rules`. Unset = `gemini`. | recommended | private | `groq` | P, Pv | Defaults to Gemini: without `AI_API_KEY`, AI Agents is unavailable (Server Rules work). |
| `ANALYSIS_PROVIDER` | Provider of the "why this offer" analysis. Defaults to `AI_PROVIDER`. | optional | private | (unset) | P, Pv | Uses `AI_PROVIDER`. |
| `NEGOTIATION_PROVIDER` | Provider of the AI store replies. Defaults to `AI_PROVIDER`. | optional | private | (unset) | P, Pv | Uses `AI_PROVIDER`. |
| `GROQ_API_KEY` | Groq key. | yes for Groq | **private** | your key | P, Pv | AI Agents shown as unavailable ("no AI provider key"); analysis is "Rules-based analysis"; Server Rules fully work. |
| `GROQ_BUYER_MODEL` | Agent D buyer model. | optional | private | `openai/gpt-oss-120b` | P, Pv | Same default. |
| `GROQ_SELLER_MODEL` | Four seller agents' model. | optional | private | `openai/gpt-oss-20b` | P, Pv | Same default. |
| `GROQ_EXPLANATION_MODEL` | Analysis model. | optional | private | `openai/gpt-oss-120b` | P, Pv | Same default. |
| `GROQ_BUYER_REASONING` / `GROQ_SELLER_REASONING` | `low` / `medium` / `high` reasoning effort. | optional | private | `low` | P, Pv | `low`. |
| `GROQ_STRUCTURED` | `strict` (JSON Schema) or `json_object`. The server validates either way. | optional | private | `strict` | P, Pv | `strict`. |
| `GROQ_MAX_CONCURRENCY` | Simultaneous Groq requests per model (1-8). | optional | private | `2` | P, Pv | `2`. |
| `GROQ_RPM_LIMIT`, `GROQ_TPM_LIMIT` | Your plan's limits, only if you know them (otherwise learned from Groq's headers and `Retry-After`). | optional | private | (unset) | P, Pv | Learned automatically. |
| `GROQ_MAX_INPUT_TOKENS`, `GROQ_REASONING_HEADROOM`, `GROQ_TIMEOUT_MS` | Prompt budget (default 3000), reasoning headroom (500), per-call timeout (40000 ms). | optional | private | (unset) | P, Pv | Defaults. |
| `AI_API_KEY` | Gemini key. | only for Gemini | **private** | (unset) | P, Pv | Gemini unavailable. |
| `AI_MODEL` | Gemini model. | optional | private | (unset) | P, Pv | `gemini-3.5-flash`. |
| `AI_RPM_LIMIT` | Gemini requests per minute (free tier 5). Ignored by Groq. | optional | private | (unset) | P, Pv | `5`. |
| `MULTI_AGENT_NEGOTIATION` | Default mode for API callers that send none. The UI choice overrides it. | optional | private | `false` | P, Pv | `false`. AI Agents does not need it. |
| `MULTI_AGENT_DEADLINE_MS` | Wall-clock budget of one AI negotiation (5000-600000). Capped at 40000 on Vercel. | recommended | private | `30000` | P, Pv | 40000. After it, the rest finishes with server rules. |
| `MULTI_AGENT_MAX_CALLS` | Cap on model attempts per negotiation (8-40). | optional | private | (unset) | P, Pv | 16. |
| `MULTI_AGENT_ENGINE` | `single_call` is a TEST engine. | no | private | (unset) | none | n/a. |
| `APP_BASE_URL` | Public https URL; PayPal's return page for Auto-Buy. | Auto-Buy only | private | `https://<domain>` | P, Pv | Defaults to `http://localhost:3000` (wrong on Vercel, only Auto-Buy affected). |
| `AUTOBUY_ENCRYPTION_KEY` | 64 hex chars; encrypts saved PayPal tokens. | Auto-Buy only | **private** | (unset for now) | P, Pv | Auto-Buy unavailable in production. Manual Checkout unaffected. |
| `DATA_DIR` | Local JSON store folder. | no | private | (unset) | none | `./.data`. Vercel's filesystem is read-only, so Supabase is required there. |
| `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD` | Only `scripts/create-demo-user.mjs`. | no | private | (unset) | none | n/a. |
| `AGENTS_DEBUG` | Verbose log of invalid model output (never keys). | no | private | (unset) | none | Off. |

**Obsolete / removed from `.env.example`:** `NEXT_PUBLIC_APP_NAME` (never read by any code).

## How to disable AI safely if the quota is exhausted

You normally do nothing: when Groq answers 429, the server honours `Retry-After`, then finishes the negotiation with server rules, labels every turn by who wrote it, and the UI shows **AI temporarily unavailable** with **Continue with server rules** / **Try AI again**. A daily quota stops further tries immediately; the next negotiations skip the AI until the quota/limit period the provider reported has passed.

If you want AI **off** (for a recording, or the quota is gone for the day):

1. Vercel → Settings → Environment Variables → set `AI_PROVIDER` to `rules` (Production). Nothing else.
2. **Redeploy** (Deployments → ⋯ → Redeploy). Variables apply only to new deployments.
3. Result: the AI Agents option shows "Unavailable right now (AI is switched off on this deployment)", every negotiation uses Server Rules with **zero** Groq/Gemini calls, and the "why this offer" analysis is labelled **Rules-based analysis**. Payments and history are unaffected.
4. To turn AI back on, set `AI_PROVIDER` back to `groq` and redeploy.

Deleting `GROQ_API_KEY` has the same effect with a different label ("no AI provider key is configured"). Do not just remove the key from a running deployment's memory: redeploy.

## Resilience on Vercel: what was checked

| Question | Finding |
|---|---|
| Does the function limit let a multi-agent negotiation finish? | `app/api/negotiations/route.ts` has `maxDuration = 60`. A healthy Groq run takes well under that. `MULTI_AGENT_DEADLINE_MS` is **capped at 40 000 ms on Vercel** (fix: a larger value would let the platform kill the run). After the budget every remaining turn falls back to rules and the run closes itself. |
| Is the async mechanism compatible with Vercel? | Yes: `after(run)` (Next.js) uses Vercel's `waitUntil` and runs inside the same invocation, inside `maxDuration`. It does not outlive the function, which is why the budget is capped and the recovery below exists. |
| Are events persisted in Supabase? | Yes, one atomic read-modify-write per event (`EventRecorder`), idempotent by event key. Offers are stored with their events. |
| Can sessions be recovered by polling? | Yes: `GET /api/negotiations/[id]` returns the stored session; the UI polls it every second while `status` is `negotiating`. |
| Are the in-memory limiters adequate with several instances? | **Partially, and documented.** The per-IP request limiter, the 40-runs-per-hour cost cap and the quota circuit breaker are per instance. With N warm instances the caps are N times looser. This is acceptable for a demo: Groq's own 429 is the real limiter, and every 429 ends in the fallback. For stricter protection use Vercel's WAF / rate limiting. |
| What if a run is interrupted (function killed, instance recycled)? | **Fixed.** A run still `negotiating` after its budget + 25 s used to be closed as *failed*. Now `recoverInterruptedNegotiation` finishes it with server rules from the offers already confirmed (checks, scores, winner), with the same event keys as a normal run so nothing is repeated, labelled `rules_fallback`, never as AI. With fewer than four confirmed offers it is closed as failed with an honest message. Nothing is paid or approved by this. |
| Can pending and failed be told apart? | Yes. Negotiations: `negotiating` (pending) vs `ready` / `failed`. Payments: `capturing` and `unknown_pending_reconciliation` (pending, reconciled with PayPal) vs `failed` / `completed`. A mixed run is shown as mixed, not as failed. |
| Build warnings / function size | **Fixed.** The build warned "Dynamic filesystem access causes tracing of the whole project" (the local JSON store used a variable folder name), which would pull the 43 MB animation folder and more into the function bundle. The folder names are now literals and `npm run build` prints no warnings. |
| Missing Supabase on Vercel | **Fixed.** The server used to answer a generic 500. It now answers 503 `STORAGE_NOT_CONFIGURED` ("This deployment has no database configured yet."). |

## Security

* Secrets (`GROQ_API_KEY`, `AI_API_KEY`, `PAYPAL_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTOBUY_ENCRYPTION_KEY`) are read only in server code. No `NEXT_PUBLIC_` variable exists, and `npm run check:env` fails if one with KEY/SECRET/TOKEN/PASSWORD in its name appears.
* `.gitignore` ignores `.env*` (only `.env.example` is tracked), `.data/` (local sessions and payments) and `.next/`. Verified with `git ls-files`: no env file and no `.data` content is tracked.
* The browser never talks to Supabase; sessions use `httpOnly` cookies (`Secure` in production).
* The AI providers never receive PayPal data, tokens or user credentials.
* Run `git log -p -- .env.local` once if in doubt: it must print nothing.
