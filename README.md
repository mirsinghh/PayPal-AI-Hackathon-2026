# AgentDeal

**Your AI agent negotiates. You decide.**

AgentDeal is an agentic-commerce demo built for the PayPal AI Hackathon. You tell **Agent D**, an animated buyer agent, what you want and your budget. It negotiates with four stores, explains what it achieved, and brings back **one** recommended offer. You approve that exact offer, then pay with **PayPal Sandbox**. AI proposes, the server validates, a human decides.

> **Everything here is a simulation.** The four stores (Brisa Outlet, Zefiro Express, Atelier Norden, Korvan Direct) are fictional: their offers, prices, stock and terms are invented and they are not affiliated with any real company. Nothing ships. Payments run **only on PayPal Sandbox** (the server refuses any other environment).

## Two front ends, one backend

| | Path | |
|---|---|---|
| **AgentDeal V3** (Agent D) | `/v3` | Playful premium fintech UI. Agent D walks between the four stores and reacts to the negotiation events. Stable demo UI. |
| **AgentDeal V4** (The Negotiation Room) | `/v4` | V3 plus four distinct seller characters, a conversation grouped by round, a visual **Decision Lab** that explains the recommendation, and a staged negotiation room. See `AgentDeal_DOCS/V4/README.md`. |
| Classic UI | `/` | The original, sober UI. Untouched, kept for comparison. |

V3 routes: `/v3`, `/v3/brief`, `/v3/negotiation/[id]`, `/v3/deals/[id]`, `/v3/checkout/[id]`, `/v3/activity` (local demo history). Both UIs call the same API, engines, validators and PayPal flow. See `AgentDeal_DOCS/V3/README.md`.

## What is real, what is simulated

| | |
|---|---|
| **Real** | PayPal Sandbox orders are created and captured through the PayPal API (JS SDK v6 + Orders v2). The payable amount is set **on the server** from the offer you approved; the browser never sends a price. |
| **Real** | Human approval is enforced server-side: no order exists until you approve the exact, eligible, unexpired offer. Approval and PayPal authorisation are separate steps. Order creation and capture are idempotent; an uncertain capture is reconciled, never guessed. |
| **Real** | Every price is validated server-side against the store's policy and your budget before it can be recommended or paid. |
| **Real (opt-in)** | With `MULTI_AGENT_NEGOTIATION=true` and a Gemini key, the buyer and the four sellers are **real model agents** with separate contexts. Their structured outputs are validated (schema, reserve price, no price increases, concession caps, amount grounding). Failures become labelled rule-based fallbacks. |
| **Real (opt-in)** | The "why this offer" explanation is written by Gemini and shown as **AI analysis**; if it is unavailable the UI says **Rule-based explanation**. |
| **Simulated** | By default a deterministic rule engine plays the stores and the negotiation screen is a replay of that run (and says so). Merchants, inventory and terms are invented. |

The UI never shows activity the backend did not record. Agent D's reactions are driven by persisted `NegotiationEvent`s: a "discount" needs a recorded price drop; a server guardrail or an AI fallback is an informational notice, never a store's decision; "approved" and "payment confirmed" come only from the approval and payment endpoints' verified responses.

## Architecture

```
Browser (Next.js 16 App Router, React 19, Tailwind 4)
 ├─ app/(classic)/*          classic UI                  ┐ both read the same
 ├─ app/v3/*                 V3 UI (own root layout)     ┘ session + events
 │    components/v3, lib/v3  Agent D sprite engine, event→animation adapter, deal intelligence, verified-payment trail
 └─ app/api/*                REST: /negotiations, /negotiations/[id](/approve), /paypal/orders(/[id](/capture)), /config
Server
 ├─ server/negotiation/*     deterministic engine (scenario, policies, validator, ranking, events)
 ├─ server/agents/*          multi-agent engine (1 buyer + 4 seller agents on Gemini, validators, event recorder)
 ├─ server/ai/explain.ts     explanation of the server-chosen winner (AI or rules fallback)
 ├─ server/paypal/*          Sandbox client, create/capture with idempotency and amount verification
 └─ server/db/store.ts       JSON files (local) or Supabase (production)
shared/contracts/types.ts    contracts between server and UI (money = integer EUR cents)
```

Key flow: `POST /api/negotiations` → engine runs (V0: replay of validated events; multi-agent: events persisted live and polled every 1 s) → `GET` session → `POST …/approve` (server checks the recommended, eligible, unexpired offer) → `POST /api/paypal/orders` (amount from the approved offer) → PayPal approval in the browser → `POST …/capture` (server verifies status, currency, amount and `custom_id`).

## Run it locally

```bash
npm install
cp .env.example .env.local      # fill in the values below
npm run dev                     # http://localhost:3000/v3
```

| Variable | Needed for | Notes |
|---|---|---|
| `PAYPAL_ENV=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | payments | A PayPal **Sandbox** REST app. Only the client ID reaches the browser (it is public by design); the secret stays on the server. |
| `AI_API_KEY`, `AI_MODEL` | AI explanation and live agents | Google Gemini key. Without it the app runs fully on labelled rule-based fallbacks. |
| `MULTI_AGENT_NEGOTIATION=true` | live multi-agent engine | Off by default. Also falls back to the rule engine, with a recorded reason, when key, catalogue match, budget or quota make a live run impossible. |
| `AI_RPM_LIMIT`, `MULTI_AGENT_DEADLINE_MS` | pacing | Free tier: `5` and `300000`. A run makes up to ~16 model calls. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | production | Required on Vercel (read-only filesystem). Run `supabase/schema.sql` first (RLS on, no public policies). |

Local data lives in `./.data` (git-ignored). **Never commit `.env.local`.**

## Test the project

```bash
npm test            # vitest: 217 tests (engines, validators, payments, Agent D adapter, V3 view models)
npm run typecheck
npm run lint
npm run build
```

### End-to-end manual test (Sandbox)

1. Open `/v3/brief`, pick "Running shoes with free shipping, up to €100" (or type your own), **Start negotiating**.
2. Watch Agent D work: a per-store **conversation** (each bubble is one persisted event, labelled AI agent message / Rule-based simulation / Rules fallback / Server validation / System status; price cards carry the validated money) with the structured timeline one click away. In rule-based mode the screen says "Rule-based simulation · replay". With the multi-agent flag on it says "Live AI agents" and shows real replies, any server rejections and any rules fallbacks, labelled.
3. **See Agent D's pick** → read the deal intelligence, the reasons and the comparison → **Approve this offer** ("Approved. You haven't paid yet").
4. (Agent D opens the checkout for you and prepares the PayPal order; you can stay on the page) → the official PayPal button → sign in with a **Sandbox personal account** (create one at developer.paypal.com → Sandbox accounts; never use a real account or card).
5. The verified-path card turns to **Capture confirmed** with the order ID, capture ID and the amount compared with the approved offer. Agent D celebrates only then.

Live multi-agent run: set `MULTI_AGENT_NEGOTIATION=true`, `AI_RPM_LIMIT=5`, `MULTI_AGENT_DEADLINE_MS=300000` and restart. Each negotiation spends a few Gemini requests.

## Security notes

- Sandbox is enforced in code (`assertSandbox`); other environments are refused.
- The browser never sends an amount; the server reads it from the approved offer and verifies the capture against it.
- Model output is untrusted: strict schemas, business validators, amount grounding. Models never see reserve prices and cannot change policies. All user text is treated as data.
- Known limits: in-memory rate limiter and run cap (not shared across instances); no authentication or session ownership (anyone with a session id can open it).

## Docs

`AgentDeal_DOCS/V3/` documents the V3 implementation (design system, UX flows, motion and mascot, event→animation mapping, implementation notes, video script, hackathon checklist). Older specs (Spanish) are in `AgentDeal_DOCS/DOCS/`; the classic pages now live in `app/(classic)/`.

## License

MIT, see `LICENSE`. Agent D artwork comes from the project's own asset pack; store names are used only as labels (see the trademark note in `LICENSE`).
