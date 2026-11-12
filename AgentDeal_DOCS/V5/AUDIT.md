# AgentDeal V5 — Technical audit (before any V5 change)

Audit date: 2026-11-12, performed on branch `main` at `e61ec97` plus the uncommitted V4/Groq work. Baseline: `vitest` 24 files / **312 tests passing**.

## 1. Stack and structure

Next.js 16.4.6 (App Router, `cacheComponents`), React 19.3, Tailwind 4, Zod 4, Vitest 5. No UI library, no Supabase SDK.

| UI | Mount | Root layout |
|---|---|---|
| Classic | `/` (`app/(classic)`) | own |
| V3 "Agent D" | `/v3/*` | own `<html>` (`app/v3/layout.tsx`) |
| V4 "Negotiation Room" | `/v4/*` | own `<html>` (`app/v4/layout.tsx`) |

All three call the same API: `POST /api/negotiations`, `GET /api/negotiations/[id]`, `POST …/approve`, `POST /api/paypal/orders`, `GET …/orders/[orderId]`, `POST …/capture`, `GET /api/config`.
`lib/v3/base.tsx` (`AppBaseProvider`/`BaseLink`) lets screens written for `/v3` run under another mount point.

- **V3** (`app/v3/page.tsx`): the explanatory landing (`components/v3/home/*`: Hero, Benefits, HowItWorks, **LiveDemo**, Approval, PayPal, Transparency, FinalCta) + brief + replay negotiation + deals + checkout + local activity.
- **LiveDemo (the "V3 simulator")**: plays `shared/sample-negotiation.ts` (a frozen run of the rule engine) through the real `Stage`/`usePlayback`/Agent D director. **No network, no model, no session is created.**
- **V4** (`/v4`): opens straight on the brief (no landing). Real flow = brief → `NegotiationRoom` → `/deals/[id]` (+ Decision Lab) → checkout. It reuses the V3 brief/checkout.

## 2. Which AI provider does what (answered from the call graph)

**1. Initial analysis.** There is *no* AI call at request time. The request is interpreted by rules: `lib/request-parse.ts` (client regex: budget + product) and `server/negotiation/intent.ts` (`parseIntent`, Zod). The only model-written "analysis" is the *explanation of the server-chosen winner* (`server/ai/explain.ts`), shown as "AI analysis" in the Decision Lab. It uses `explanationCaller()` in `server/ai/provider.ts`, i.e. the **global `AI_PROVIDER`** (`gemini` default, `groq`, or `rules`). It runs at session creation in V0, and as the `explanation` role at the end of a live run. Output is validated (schema, referenced offer ids, amounts grounded in validated prices); any failure becomes a labelled "Rules-based analysis".

**2. Seller replies in a negotiation.**
- Default (`MULTI_AGENT_NEGOTIATION=false`, or the guards below fail): deterministic rules. `server/negotiation/{scenario,policies,events}.ts` produce the offers and event script before playback; the UI replays it. `lib/v4/scripts.ts` only re-phrases already-recorded numbers in character (labelled *Rule-based simulation*).
- `MULTI_AGENT_NEGOTIATION=true`: real agents (`server/agents/run.ts`): Agent D (buyer) + 4 sellers, provider chosen by `resolveEngine()` from the global `AI_PROVIDER`. Groq: Agent D = `openai/gpt-oss-120b`, sellers = `openai/gpt-oss-20b`; Gemini: `AI_MODEL` for all roles. There is **no automatic switch between providers**.

**3. Automatic deterministic fallbacks: yes, always labelled.**
- Whole run (`startNegotiation`, recorded as `session.fallbackReason`): `provider_rules`, `no_api_key`, `no_catalog_match`, `budget_below_catalog`, `model_quota_exhausted` (per-provider circuit breaker), `cost_cap` (40 live runs/hour/process).
- Per turn (`AGENT_FALLBACK` event, `source: "rules_fallback"`, `fallbackCauses`): `http_429`, `timeout`, `provider_error`, `provider_generation_failed`, `invalid_structure`, `policy_rejected`, `call_budget`, `deadline`, `quota_exhausted`.
- Server vetoes (`OFFER_REJECTED_BY_SERVER`): price below reserve, price increase, concession cap, shipping, ungrounded amounts, false "lowest/fastest" claims.

**4. Limits.**
| Limit | Value |
|---|---|
| Rounds | 2 |
| Model attempts / negotiation | 16 (`MULTI_AGENT_MAX_CALLS` 8–40), 2 reserved for Agent D's final decision |
| Attempts per turn | 2 (one corrective retry) |
| Per-call timeout | Gemini 12 s; Groq 40 s (`GROQ_TIMEOUT_MS`) |
| Run deadline | 40 s default (`MULTI_AGENT_DEADLINE_MS`, 5–600 s) |
| Transport failures tolerated | 8 |
| Output tokens | 450 sellers, 800 buyer/explanation (+ `GROQ_REASONING_HEADROOM` 500) |
| Groq input budget | 3000 tokens/request (`GROQ_MAX_INPUT_TOKENS`), seller isolation |
| Concurrency | Groq 2 per model (`GROQ_MAX_CONCURRENCY`); Gemini paced by `AI_RPM_LIMIT` (5) |
| Quotas | Groq: per-model gate fed by `x-ratelimit-*`/`retry-after`; 429 handled, never loops |
| HTTP | `POST /api/negotiations`: 10/min per IP (in-memory), `maxDuration` 60 s; runs continue with `after()` |
| Cost cap | 40 live runs / rolling hour / process |

**5. Is the provider a global env var?** Yes. `AI_PROVIDER` selected *both* the explanation provider and the negotiation provider, and `MULTI_AGENT_NEGOTIATION` was a *global* on/off. There was no per-request choice. → V5 adds a per-negotiation `responseMode` and optional `ANALYSIS_PROVIDER` / `NEGOTIATION_PROVIDER` overrides (both default to `AI_PROVIDER`, so nothing changes unless set).

**6. Can a negotiation fail without the UI saying so?** No for the paths above: `status: "failed"` renders "No deal this time", `fallbackReason` renders a warning notice, per-turn origin labels and the honesty chip count AI vs fallback turns, the explanation is labelled AI vs rules. Weak spots found: (a) the fallback notice talks about "multi-agent" without saying the user *asked for AI*; (b) a dead run only turns `failed` after `deadline + 60 s` (polling shows "negotiating" until then). V5 fixes (a) with the recorded `responseMode`; (b) is documented.

## 3. Payments

`server/paypal/{client,payments}.ts`: Sandbox enforced (`assertSandbox`), amount computed on the server from the approved offer, create/capture idempotent (request ids), capture verified (status, currency, amount, `custom_id`), uncertain captures reconciled. `POST /api/negotiations/[id]/approve` only approves the recommended, eligible, unexpired offer. Not touched by V5 except for adding an ownership check when a session belongs to a user.

## 4. Persistence and Supabase (before V5)

`server/db/store.ts`: JSON files in `.data/` locally, Supabase PostgREST (service-role key, no SDK) in production. Tables `sessions(id, data jsonb, expires_at)` and `payments(id, session_id, paypal_order_id, data jsonb)`, RLS on **with no policies** (only the server can read). **No Supabase Auth, no users, no ownership: anyone with a session id can open it.** `.env.local` has empty `SUPABASE_*` locally, so Auth/RLS cannot be exercised end to end from this machine without the project's keys.

## 5. Reusable pieces / risks

Reuse: V3 landing + LiveDemo, V4 room/lab/conversation, brief, deal, checkout, mascot, engines, validators, store, PayPal.
Risks: (1) no Supabase credentials available locally → Auth/RLS verified by unit tests with a stand-in only, plus documented manual steps; (2) real Groq/Gemini quota limits during the demo → AI mode is explicit, labelled and falls back safely; (3) in-memory limiter/run cap are per instance; (4) multiple root layouts (V3/V4) → V5 gets one layout and the old ones are removed only after validation; (5) deadline: P0 first.
