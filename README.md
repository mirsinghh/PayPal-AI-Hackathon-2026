# AgentDeal

**Your AI agent negotiates. You decide.**

AgentDeal is an agentic-commerce demo built for the PayPal AI Hackathon. You tell **Agent D**, an animated buyer agent, what you want and your budget. It negotiates with four store agents, explains what it achieved, and brings back competing offers. You approve one exact offer, then pay with **PayPal Sandbox**. AI proposes, the server validates, a human decides.

> **Everything here is a simulation.** The four stores (Brisa Outlet, Zefiro Express, Atelier Norden, Korvan Direct) are fictional: their offers, prices, stock and terms are invented and they are not affiliated with any real company. AgentDeal does **not** negotiate with real merchants. Nothing ships. Payments run **only on PayPal Sandbox** (the server refuses any other environment).

## What a user can do (V5)

1. Read the landing, watch the recorded negotiation demo (no AI calls, not saved, no account needed).
2. Create an account or sign in (Supabase Auth). Accounts are optional: guests can negotiate and pay too.
3. Describe a purchase and a budget. Agent D reads it back.
4. **Choose how the stores reply**: `Server Responses` or `AI Responses` (below).
5. Watch the negotiation room, compare the offers in the Decision Lab, approve one.
6. Pay with PayPal Sandbox.
7. Come back to **History / Profile** to see requests, analyses, negotiations, payments and savings.

## Two ways for the stores to reply

A segmented switch on the brief screen. It is chosen **before** the negotiation, sent to the server, validated there (`responseMode: "server" | "ai"`), recorded on the session and **fixed for that negotiation**. It never changes the request analysis.

| | Server Responses | AI Responses |
|---|---|---|
| Who writes the replies | Deterministic backend rules (`server/negotiation/*`) | Real model agents: Agent D + four store agents with private strategies and memory (`server/agents/*`) |
| Model calls for replies | **None** | Yes, on the configured provider (Groq or Gemini) |
| Commercial limits | Store policy, price floor, discount caps, budget | The same: every model proposal is validated by the server (reserve price, no price increases, concession caps, amount grounding). Rejected proposals are recorded, never applied |
| If it cannot run | n/a | The session records why (`fallbackReason`) and the UI says "You chose AI Responses, but AI could not run (…). The stores answered with backup server rules, not AI." Per-turn failures become labelled `Rules fallback` messages |
| Needs | nothing | a provider key and quota (`/api/config` tells the UI if it is available) |

**Analysis is independent.** The only model-written "analysis" is the explanation of the server-chosen winner (`server/ai/explain.ts`). It uses `ANALYSIS_PROVIDER` (default `AI_PROVIDER`); the replies use `NEGOTIATION_PROVIDER` (default `AI_PROVIDER`). The switch touches neither. See `AgentDeal_DOCS/V5/AUDIT.md` for the call-graph audit of who calls which provider.

## Architecture

```
Browser (Next.js 16 App Router, React 19, Tailwind 4)
 ├─ app/                     V5 pages: /, /brief, /negotiation/[id], /deals/[id], /checkout/[id], /activity, /login, /signup, /profile, /history
 │    components/v3         design system, Agent D mascot, brief, deal, checkout, recorded-demo screens (kept from V3)
 │    components/v4         Negotiation Room, conversation, Decision Lab (kept from V4)
 │    components/v5         header/footer, auth, response-mode switch, landing sections, profile/history
 └─ app/api/*               REST: negotiations, approve, paypal orders/capture, config, auth/*, history
Server
 ├─ server/negotiation/*    deterministic engine (scenario, policies, validator, ranking, events) + engine choice
 ├─ server/agents/*         multi-agent engine (Agent D + 4 sellers), validators, event recorder
 ├─ server/ai/*             providers (Groq, Gemini, rules), explanation of the winner
 ├─ server/auth/*           Supabase Auth over REST, httpOnly-cookie sessions, ownership guard
 ├─ server/paypal/*         Sandbox client, create/capture with idempotency and amount verification
 └─ server/db/*             JSON files (local) or Supabase (production), history reads through RLS
shared/contracts/types.ts   contracts between server and UI (money = integer EUR cents)
supabase/schema.sql         tables, columns, profiles, Row Level Security
```

Key flow: `POST /api/negotiations` (intent + `responseMode`) → engine runs (rules: events computed up front and replayed; AI: events persisted live and polled) → `GET` session → `POST …/approve` (recommended, eligible, unexpired offer only) → `POST /api/paypal/orders` (amount from the approved offer; the browser never sends a price) → PayPal approval in the browser → `POST …/capture` (server verifies status, currency, amount, `custom_id`).

## Run it locally

```bash
npm install
cp .env.example .env.local      # fill in the values below
npm run dev                     # http://localhost:3000
```

| Variable | Needed for | Notes |
|---|---|---|
| `PAYPAL_ENV=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | payments | A PayPal **Sandbox** REST app. Only the client ID reaches the browser. |
| `AI_PROVIDER` | AI | `groq`, `gemini` or `rules` (no model API). Default `gemini`. |
| `ANALYSIS_PROVIDER`, `NEGOTIATION_PROVIDER` | AI | Optional per-role overrides, default `AI_PROVIDER`. |
| `GROQ_API_KEY` (+ `GROQ_*` tuning) / `AI_API_KEY`, `AI_MODEL` | AI | Groq (GPT-OSS 120B buyer, 20B sellers) / Google Gemini. Without a key the app runs fully on labelled rule-based fallbacks and "AI Responses" shows as unavailable. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | accounts + production storage | All server-only. Empty = JSON files in `./.data` and **no accounts**. |
| `MULTI_AGENT_NEGOTIATION` | legacy default | Only the default for API callers that send no `responseMode`. The UI always sends one. |
| `MULTI_AGENT_DEADLINE_MS`, `MULTI_AGENT_MAX_CALLS`, `AI_RPM_LIMIT`, `GROQ_MAX_CONCURRENCY` | pacing | See `.env.example` and `AgentDeal_DOCS/V4/GROQ_MULTI_AGENT_ENGINE.md`. |

Local data lives in `./.data` (git-ignored). **Never commit `.env.local`.**

### Supabase (accounts, history, production storage)

1. Create a Supabase project. In **SQL editor** run `supabase/schema.sql` (idempotent).
2. **Authentication → Providers → Email**: keep it enabled. For a frictionless demo, turn **Confirm email** off; otherwise new users must confirm from their inbox before the first sign-in (the UI handles both).
3. **Project settings → API**: copy the project URL, the **anon/publishable** key and the **service_role/secret** key into `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Vercel: Project → Settings → Environment Variables). None is `NEXT_PUBLIC_*`: the browser never talks to Supabase.
4. Optional demo account, created with the Admin API so no credential lives in the repo:
   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DEMO_USER_EMAIL=demo@example.test DEMO_USER_PASSWORD='choose-a-demo-password' node scripts/create-demo-user.mjs
   ```

Security model: passwords are handled only by Supabase Auth (never stored, hashed or logged here). The session lives in `httpOnly` cookies; every API call re-verifies the token with Supabase, and the owner of a negotiation is taken from that verified token, **never from the request body**. RLS is on for every table; users can only `select` their own rows (`auth.uid() = user_id`), have no insert/update/delete policy, and the history API reads with the user's own token. A negotiation owned by a user is invisible (404) to everyone else, including for approval and payment. Guest negotiations stay reachable by their unguessable id, as before.

### PayPal Sandbox

Create a Sandbox REST app at developer.paypal.com, put its client id and secret in `.env.local`, and create a Sandbox **personal** account to pay with (never use a real account). The checkout uses the PayPal JS SDK v6 + Orders v2; the server creates and captures orders and verifies the capture.

## Test the project

```bash
npm test            # vitest: 342 tests (engines, validators, payments, response mode, auth/ownership, Groq adapter, view models)
npm run typecheck
npm run lint
npm run build
```

Manual end-to-end (Sandbox): open `/`, watch the demo, **Start Negotiating**, pick a mode, **Start negotiating**, review the offers, **Approve this offer**, pay with the PayPal button using a Sandbox personal account, and check the verified-path card ends on **Capture confirmed** (order id, capture id, amount compared with the approved offer). Then open **History**.

## What is real, what is simulated

| | |
|---|---|
| **Real** | PayPal Sandbox orders created and captured through the PayPal API; the payable amount is set on the server; human approval is enforced server-side; every price is validated against the store policy and your budget. |
| **Real (opt-in)** | With **AI Responses**, Agent D and the four stores are real model agents with separate contexts; outputs are validated (schema, reserve price, no increases, concession caps, amount grounding). |
| **Real** | Accounts (Supabase Auth), ownership and RLS. |
| **Simulated** | The merchants, inventory, delivery and terms. In **Server Responses** the negotiation itself is a deterministic rule engine and the screen is a replay of that run (and says so). The landing demo is a recorded run: no model, no session, not saved. |

The UI never shows activity the backend did not record. A fallback is never presented as AI.

## Docs

`AgentDeal_DOCS/V5/` (audit, V5 design, demo script) · `AgentDeal_DOCS/V4/` (Negotiation Room, Groq engine) · `AgentDeal_DOCS/V3/` (design system, mascot, UX flows) · older specs in `AgentDeal_DOCS/DOCS/` (Spanish). V3/V4 docs describe screens that now live under the V5 routes; the original standalone V1–V4 UIs are preserved on the `archive/agentdeal-v1-v4` branch.

## Known limits

- In-memory rate limiter, run cap and token-bucket gates are per server instance.
- AI quality and latency depend on the provider plan; the stores' tone has only been exercised on a few real runs.
- Without a Supabase project there are no accounts or cross-device history (local activity stays in the browser).

## License

MIT, see `LICENSE`. Agent D artwork comes from the project's own asset pack; store names are used only as labels (see the trademark note in `LICENSE`).
