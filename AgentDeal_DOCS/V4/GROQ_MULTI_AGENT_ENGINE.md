# Groq multi-agent engine (AgentDeal V4)

AgentDeal can now run its multi-agent negotiation on **Groq** as well as on Gemini, chosen by configuration only. Gemini is untouched and remains the default. The commercial and financial logic (catalogue, reserve prices, concession limits, validators, ranking, approval, PayPal) is shared and unchanged.

Backup taken before this work: `..\paypal-AI-hackaton_BACKUP_V4_20261112-162146\` (private; see its `BACKUP_MANIFEST.md`).

## Architecture

```
AI_PROVIDER ──► server/ai/provider.ts  resolveEngine()
                  ├─ groq   ► server/ai/groq.ts   role-aware caller + per-model pacing gate
                  ├─ gemini ► server/agents/model.ts geminiModelCaller() (unchanged behaviour)
                  └─ rules  ► no caller → deterministic engine

server/agents/run.ts (orchestrator, unchanged flow)
   Agent D (role buyer) ─┐                       ┌─ OFFER / COUNTER / BUYER_* events (+ provider, model, source)
   4 sellers (role seller)├─► ModelCaller(req) ──┤
   explanation           ─┘   req.role, req.wire └─ server validation → Zod → business validators → persistence
```

* **One interface, no business changes.** Every provider is a `ModelCaller(req) -> {text, model, provider, tokens}`. `req.role` (`buyer` / `seller` / `explanation`) lets one provider use different models per role. `ask()` still parses with Zod, runs the commercial validator (reserve price, concession cap, budget, amount grounding), tells the agent why it was rejected, and falls back to the rules engine, exactly as with Gemini.
* **Roles on Groq:** Agent D → `openai/gpt-oss-120b`; the four sellers → `openai/gpt-oss-20b` (each with its own private system prompt and memory); explanations → `openai/gpt-oss-120b`.
* **No silent provider switching.** A Groq quota problem never calls Gemini (or the reverse). The quota circuit breaker is per provider.
* **`AI_PROVIDER=rules`** runs fully without a model API; the session records `fallbackReason: "provider_rules"`.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `AI_PROVIDER` | `gemini` | `groq`, `gemini` or `rules`. Unset keeps today's behaviour. |
| `MULTI_AGENT_NEGOTIATION` | `false` | Must be `true` for live agents (any provider). |
| `GROQ_API_KEY` | — | Server-side only. Never reaches the browser (checked in the client bundle). |
| `GROQ_BUYER_MODEL` / `GROQ_SELLER_MODEL` / `GROQ_EXPLANATION_MODEL` | `openai/gpt-oss-120b` / `-20b` / `-120b` | Malformed ids are ignored. |
| `GROQ_BUYER_REASONING`, `GROQ_SELLER_REASONING` | `low` | `low` \| `medium` \| `high` (`reasoning_effort`). |
| `GROQ_STRUCTURED` | `strict` | `strict` = JSON Schema Structured Outputs; `json_object` = plain JSON mode. |
| `GROQ_MAX_CONCURRENCY` | `2` | Simultaneous requests per model. |
| `GROQ_RPM_LIMIT`, `GROQ_TPM_LIMIT` | unset | Optional, only if you know your plan. Otherwise learned from headers. |
| `GROQ_MAX_INPUT_TOKENS` | `3000` | Prompt budget per request; the agent's oldest exchanges are dropped beyond it. |
| `GROQ_REASONING_HEADROOM` | `500` | Extra completion tokens reserved for gpt-oss reasoning. |
| `GROQ_TIMEOUT_MS` | `40000` | Per request. |
| `MULTI_AGENT_DEADLINE_MS` | `40000` | Whole-negotiation budget. Use `300000` on a free plan. |
| `MULTI_AGENT_MAX_CALLS` | `16` | Cap on model attempts per negotiation (8–40). Rejected replies consume attempts. |
| `AI_API_KEY`, `AI_MODEL`, `AI_RPM_LIMIT` | as before | Gemini, unchanged. |

`GET /api/config` now also returns `provider` and the configured buyer/seller models (no secrets).

## What was verified in the Groq documentation (console.groq.com/docs, Nov 2026)

* Models `openai/gpt-oss-120b` and `openai/gpt-oss-20b` are listed as production models, 131,072-token context, 65,536 max completion tokens.
* Endpoint `https://api.groq.com/openai/v1/chat/completions`, `Authorization: Bearer <key>`.
* Structured Outputs with `strict: true` are listed for both models (all properties `required`, `additionalProperties: false`; no streaming/tools with them).
* `reasoning_effort`: `low|medium|high` for gpt-oss; `include_reasoning` boolean; **`reasoning_format` is not supported for gpt-oss and is never sent**. `max_tokens` is deprecated: `max_completion_tokens` is used.
* Rate limits are per organisation **and per model**: RPM, RPD, TPM, TPD. Headers: `x-ratelimit-{limit,remaining,reset}-requests` (daily) and `-tokens` (per minute), `retry-after` only on 429.
* Not stated in the docs: whether `completion_tokens` includes reasoning tokens, and a `completion_tokens_details.reasoning_tokens` field for chat completions. The engine therefore records reasoning tokens **only if the response contains them**.
* The free-plan table at the time of reading (not hard-coded anywhere): 30 RPM, 1K RPD, **8K TPM**, 200K TPD for both gpt-oss models. Check your own account's limits page: they change.

## Quota handling (`server/ai/groq.ts`)

* **Per-model gate** (limits are per model): concurrency cap, optional declared RPM/TPM windows, and a header-driven token budget. After each response the gate reads `x-ratelimit-remaining-tokens` / `reset-tokens`; before sending, it estimates the request (chars/3.2 + reserved completion) and waits for the window to reset if it would not fit. This is what keeps a free plan with a small tokens-per-minute budget from hitting 429s.
* **HTTP 429:** `retry-after` is honoured; else the token/request reset header; else a bounded 2 s default. The model's gate is blocked for that time (no instant retry loops). `ask()` waits at most until the run deadline; a wait that cannot fit (e.g. daily quota) stops the whole run (`quota_exhausted`), trips Groq's circuit breaker so the next run goes straight to the rules engine, and does not loop.
* **Retries** are bounded (2 attempts per agent turn, max 8 transport failures per run, 16-call cap, deadline).
* **Request options Groq may reject:** a 400 about the schema downgrades to JSON mode (remembered for the process); a 400 about `include_reasoning` stops sending it; a 400 with `failed_generation` returns that text so the server's own validation rejects it and the agent is corrected.
* **Token budgeting:** each seller receives only its own identity, strategy, voice, private policy, its own terms, the buyer's last message and its own history; never other sellers or their history. Agent D receives the validated offers (never reserve prices). `reasoning_effort: low`, small completion caps. Rounds are unchanged (2).

## Validation and fallbacks

Order of checks for every model reply: provider structure (strict schema) → Zod → commercial validator (reserve price, no increases, concession cap, shipping fixed, amount grounding, budget) → monetary checks in the server → persisted event. Invalid replies are rejected and recorded as `OFFER_REJECTED_BY_SERVER`; failures (429, timeout, malformed after one correction) become `AGENT_FALLBACK` events and a labelled rules move (`source: "rules_fallback"`). The final choice is still validated, and the recommendation is still the server's ranking or a server-validated eligible choice.

## Events, labels and honesty in V4

* AI events carry `source` (`groq` / `gemini`), `provider`, `model`. Old events (only `source: "gemini"`) still render as Gemini.
* Labels: `Groq · GPT-OSS 120B · Buyer Agent`, `Groq · GPT-OSS 20B · Seller Agent`, `Gemini · Seller Agent`, `Rules fallback`, `Server validation`. Rules text never gets a model label.
* The header chip is computed from the turns actually recorded: `Live AI agents · Groq`, `… · 9 of 13 turns by AI`, or `Mostly rules fallback · 2 of 13 turns by AI` (with a notice). A run is not presented as AI agents negotiating when most turns were rules.
* Decision Lab: the explanation chip shows the real provider and model; scores, ranking and the recommended offer remain the server's.

## Technical summary (Negotiation Room → sidebar, collapsed)

Provider, buyer/seller/explanation models, calls succeeded/attempted, input/output tokens, reasoning tokens (only if reported), HTTP 429 count, fallbacks, proposals rejected by the server, total time, end reason, and a per-role table. Stored in `session.agentRun` (all new fields optional; old sessions still load).

## Tests (no network, no quota)

`tests/groq-adapter.test.ts` (28): config, header parsing, request shape (models per role, strict schema, `reasoning_format` absent, key only in the header), usage/reasoning tokens, JSON-mode downgrade, failed generation, network errors without the key, 429 variants, the gate (concurrency, token window, RPM/TPM, deadline). `tests/groq-negotiation.test.ts` (16): full negotiation with a scripted Groq stand-in (provider/model/source persisted, seller isolation, reserve prices never reach Agent D, below-reserve and malformed replies rejected, 429 storm and daily-quota stop, provider switching, explanation on the 120B model, V4 labels, legacy sessions, honest summary). Total suite: **261 tests**, typecheck, lint and build clean.

## Try it

```bash
# .env.local (values are yours; never commit them)
AI_PROVIDER=groq
GROQ_API_KEY=...
MULTI_AGENT_NEGOTIATION=true
MULTI_AGENT_DEADLINE_MS=300000
```

Staged real checks (each needs your authorisation because it spends quota): 1) one seller turn (connectivity + structured output), 2) one Agent D turn on the 120B model, 3) one complete negotiation. Compare with the Gemini run via the Technical summary.

## Back to Gemini

Set `AI_PROVIDER=gemini` (or remove it) and keep `AI_API_KEY`. Nothing else changes. `AI_PROVIDER=rules` disables model calls.

## Known issues and limits

* **Not yet run against the real Groq API** (no authorisation yet): the request format follows the documentation and mocks, but the actual accept/reject behaviour of strict schemas, the real quality of the voices, and the token consumption are unverified. Expect to tune `GROQ_REASONING_HEADROOM` / reasoning effort after the first real run.
* On a plan with a small tokens-per-minute budget a full negotiation takes minutes (the gate waits instead of failing); use `MULTI_AGENT_DEADLINE_MS=300000`.
* The per-model gate is in-process (not shared across serverless instances), like the existing rate limiter.
* The seller voices and Agent D prompt changes apply to both providers.
* Reasoning tokens are reported only if Groq returns them; whether `completion_tokens` already includes them is not documented.
* A 400 error message format for schema rejections is not documented in detail; the downgrade matches on keywords.

## First real results (Nov 12, 2026, one call per stage, authorised)

**Stage 1: one seller turn (Brisa Outlet, 20B).** HTTP 200, strict JSON Schema accepted, 555 ms, 596 in / 92 out / 25 reasoning tokens; Zod and the business validator passed; reserve not leaked; voice only mildly in character.
**Stage 2: one Agent D turn (120B).** HTTP 200, strict schema accepted, 807 ms, 1,152 in / 240 out / 93 reasoning; valid counter with a verified comparison (next-day delivery elsewhere). It named stores by internal id ("orbit") and countered only one of four.
**Stage 3: full negotiation** (session `ses_7a99ae93…`, `MULTI_AGENT_DEADLINE_MS=300000`): 56.6 s, **0 HTTP 429**, 16 attempts (cap reached), 9 succeeded, 5 rules fallbacks, 7 proposals rejected by the server, 10,795 in / 1,691 out tokens (674 reasoning reported). All four sellers opened with real 20B messages in clearly different registers (Brisa "Let's seal the deal!", Korvan terse "Offer: €359.00 + €4.90 shipping…", Atelier "long-term value and protection"). Pacing worked: a 48 s wait for the tokens-per-minute window, no rate-limit errors. Problems found:

1. Sellers often proposed prices **below their reserve** (`price_below_floor`, `concede_not_lower`): server rejected all of them, correctly, but the retries consumed the call cap.
2. Agent D's round-2 reply failed the schema twice (`rationale`), so round 2 used the rules fallback.
3. The 16-call cap was reached before Agent D's final decision, so the explanation came from the rules fallback and the run was labelled "Live AI agents · Groq · 9 of 14 turns by AI".
4. Agent D's messages called stores "Prism"/"Orbit"/"Nova" (internal ids) instead of brand names.

Changes made afterwards (verified only by mocked tests; not re-run on Groq): the seller's round prompt now includes `yourLowestAllowedItemPriceCents` (its own floor, same arithmetic as the validator; no rule changed), Agent D's round prompt carries a brand-name / short-rationale reminder, and the call cap is configurable with `MULTI_AGENT_MAX_CALLS` (default 16, range 8–40).

## Stabilisation round (Nov 12, 2026): causes, fixes, verification

Backup before this round: `..\paypal-AI-hackaton_BACKUP_V4_GROQ_20261112-165652\` (private).

**Real causes found (first negotiation, `ses_7a99ae93…`) and what was done**

| Problem | Cause | Fix |
|---|---|---|
| Sellers below reserve / over-concession (5–7 rejections) | The model only had its reserve as text; at the floor it still tried to concede | Each seller turn now gets `yourPriceWindow` (min/max item price in cents, allowed actions, `canConcede`), computed by `sellerPriceWindow()` with the validator's own arithmetic, only in that seller's prompt. One corrective retry repeats the exact window. The validator is unchanged and still rejects everything outside policy. |
| Agent D `rationale` "schema error" | Round-2 requests came back as Groq **HTTP 400 (failed structured generation)**; the failed text then failed Zod. Rejections now keep the real detail and the provider's note (`groq_400 generation failed`), so the next run shows the exact cause. Root cause of the 400 itself is still unconfirmed (see remaining problems). | Rejection `details` + provider `note` persisted in `OFFER_REJECTED_BY_SERVER`; limits spelled out in the schema descriptions and the prompt (≤200 chars, hard 300); one corrective retry that quotes the real Zod detail; accepted text is never trimmed. |
| 16-call cap hit before the final decision | Rejected replies consumed attempts | `FINAL_RESERVE = 2`: round and seller turns stop 2 calls before the cap, so Agent D's final decision always has budget. `MULTI_AGENT_MAX_CALLS` (8–40) stays configurable. Internal call cap ≠ Groq quotas (RPM/TPM/RPD are paced separately by the gate). |
| Agent D said "Nova/Orbit/Prism" | Internal ids were visible in its prompt data | Agent D now sees and returns **brand names** (`store`), mapped back to internal ids from the canonical `SELLER_BRANDS` table; ids never appear in its prompts. Legacy `sellerId` is still accepted. |
| Repetitive seller lines | Nothing told them not to | Seller prompt: react to the buyer's argument, give one real reason, never repeat an earlier message. Prompt also shortened. |
| Fallbacks hidden behind "failed" | One generic reason | Every fallback records `cause`: `http_429`, `timeout`, `provider_error`, `provider_generation_failed`, `invalid_structure`, `policy_rejected`, `call_budget`, `deadline`, `quota_exhausted`; counted in `agentRun.fallbackCauses` and shown in the Technical summary. |
| Final explanation not from Groq | Cap exhausted (above) | Reserve (above). UI label: `AI analysis · Groq · GPT-OSS 120B`, or `Rules-based analysis` (never credited to Groq). |
| 52 s pacing stall | The gate waited for the token bucket to be *full* (reset header = time to full) | The gate now waits only until the refilling bucket holds what the request needs (limit/min from headers). |
| False claim in the explanation ("lowest total" for a pricier offer) | Only amounts were validated | `validateBuyerFinal` rejects "lowest price / fastest / longest warranty" claims about the chosen offer that are false among eligible offers (one correction, else rules fallback). |

**Files:** `server/agents/{validate,schemas,model,run,config}.ts`, `server/ai/groq.ts`, `shared/contracts/types.ts`, `lib/v4/provider.ts`, `components/v3/offers/DealExperience.tsx` (optional `analysisLabel` prop), `components/v4/{deal/V4Deal,lab/DecisionLab}.tsx`, tests `groq-stabilisation`, `groq-adapter`, `groq-negotiation`, and the fakes in `agents`/`v3-*`/`v4-lab` tests (rows now carry `store`).

**Local verification:** 284 tests, typecheck, lint, build clean. New tests cover price windows, schema compatibility (strict-mode rules, Zod alignment), public names, call budget and reserve, recovery per cause, fallback causes, final decision and claims, labels, legacy sessions.

**The one authorised real negotiation after the fixes** (`ses_01b23458-0b97-4af3-8485-e2c74e78235f`, buyer 120B, sellers 20B, hard cap 24 requests): 58.2 s, **15 HTTP requests** (cap 24), 13 succeeded, **0 HTTP 429**, 1 fallback (`invalid_structure`, Agent D round 2, two Groq 400s), 2 rejected proposals (both those buyer attempts), 0 seller rejections, 13,070 in / 1,517 out tokens (513 reasoning reported), ended `completed`. Pacing: 2 waits, 51.8 s total on the 20B gate (measured *before* the refill fix; it would have been roughly 10 s). Final explanation **by Groq 120B** (`AI analysis · Groq · GPT-OSS 120B`). Compared with the previous run: 56.6 s → 58.2 s, seller rejections 7 → 0, fallbacks 5 → 1, AI turns 9 → 13, explanation rules → Groq, call cap no longer exhausted. That run's explanation also contained the false "lowest total" claim, now rejected by the new check (not re-run).

**Remaining problems:** (1) Agent D's round-2 turn returned HTTP 400 twice on the 120B model (the two failing calls used ~2.5K tokens each, suggesting the generation hit the completion cap); not reproduced locally, instrumentation added, no further real call made; (2) the rules fallback keeps its generic wording ("Could you improve your price a little?"); (3) Zefiro/Brisa reuse signature phrases across rounds; (4) the refill-based pacing and the new claim check have not been exercised on the real API.

**Recommended Groq demo config:** `AI_PROVIDER=groq`, `MULTI_AGENT_NEGOTIATION=true`, `MULTI_AGENT_DEADLINE_MS=300000`, `MULTI_AGENT_MAX_CALLS=24`, `GROQ_BUYER_REASONING=low`, `GROQ_SELLER_REASONING=low`, `GROQ_STRUCTURED=strict`, `GROQ_MAX_CONCURRENCY=2`; leave `GROQ_RPM_LIMIT` / `GROQ_TPM_LIMIT` unset (learned from headers).

## Final stabilisation round (Nov 12, 2026, evening)

Backup before it: `..\paypal-AI-hackaton_BACKUP_V4_FINAL_20261112-175556\` (private).

**Checked by tests (no API):** 312 tests, typecheck, lint, build clean.

* **Recommendation = server ranking.** `session.recommendedOfferId` is always the top-ranked eligible offer. Agent D is told `serverRecommendedOfferId` and must explain *that* offer; if it proposes another, the final turn is rejected once with a correction, and if it insists the rules explanation is used. The disagreement is recorded (`BUYER_DECISION.payload.discrepancy`, `agentRun.agentProposalOfferId`) and shown in the Decision Lab as technical information. Approval (`OFFER_MISMATCH` for any other offer) and the PayPal amount (stored price of the approved offer) are unchanged and covered by tests that force a disagreeing Agent D.
* **False claims.** `validateBuyerFinal` now checks, about the chosen offer, against the *eligible* offers only: lowest price, fastest delivery, longest warranty, best/top score (stored scores), savings (must equal the recorded discount), eligibility ("over budget"), and "recommended/winner" naming another store. A failed check is a recorded rejection (`unsupported_claim:*`), one correction, then the deterministic rules explanation, labelled `Rules-based analysis` and never credited to Groq. Text is never edited.
* **HTTP 400 / truncation.** The adapter now tells apart: a failed structured generation (400 with `failed_generation`, or "failed to generate") and a cut-off answer (`finish_reason: length`) get ONE escalated retry (plain JSON mode, 1.6x completion budget); a strict-schema configuration error downgrades once; an unsupported option is dropped once; any other 400 is an invalid request, never retried and reported with Groq's message (`provider_rejected_request`). The buyer gets double reasoning headroom (max completion 1,800 instead of 1,300). Groq's message and a 160-char sample of the failed output are kept in the rejection details.
* **Rate limiter.** The estimate is prompt + a realistic completion; the bucket refills at limit/min from the headers; requests larger than the bucket are clamped; concurrent requests reserve their estimate; fresh headers correct the optimistic accounting; deadline and 429 respected. Simulated-clock tests: small, large, oversized, concurrent, partial refill, exhausted, deadline, 429, FIFO concurrency.
* **Text.** Rules fallbacks are per seller (`"Here is our outlet price…"`, `"No room on the price."`, `"Our price, backed by a 36-month warranty."`), use only each seller's real terms, and are stored as `rules_fallback`. A seller message that alludes to its reserve ("staying above my reserve") is now rejected (`mentions_reserve`, after the price rules).

**The one real negotiation after the fixes** (`ses_aeb107f9-a799-425f-8d9c-fbb9ff1476a1`, hard cap 24, used 17):

| | Result |
|---|---|
| Duration | 51.5 s (previous 58.2 s) |
| HTTP requests / calls | 17 / 15 attempted, 13 succeeded |
| HTTP 429 | 0 |
| Tokens | 17,623 in, 2,134 out (884 reasoning reported) |
| Sellers | 11/11 valid, 0 economic rejections; four distinct voices |
| Fallbacks | 1 (Agent D, round 2) |
| Recommendation | Atelier Norden €332.00 = server top (score 54); Agent D agreed |
| Explanation | Groq 120B: all claims true ("longest warranty among all offers", €332, trade-offs vs Brisa and Zefiro) |
| Ended | completed |
| Pacing | 120B: 3 waits, 41.6 s (round-2 buyer retries, each ~4K input tokens); 20B: none |

**Not achieved:** Agent D still failed in round 2 (two strict-schema HTTP 400s, then the escalated JSON-mode retry returned 200 with a JSON object lacking `rationale` and `moves`; the output sample was not yet being stored, so its content is unknown). Also seen: one seller message alluding to its reserve (now rejected by the validator, not re-run).

**Changes made after that run, verified by tests only:** the last round is no longer announced as `roundsLeft: 0` (both real runs failed exactly at the round where it was 0; the prompt now gives `round`, `totalRounds`, `finalRound`), no second request after a failure that already survived the escalated retry (it saves ~2 calls and ~20 s), the output sample is stored for diagnosis, and `mentions_reserve`.

**Still unverified with the real API:** that the `finalRound` wording removes the round-2 failure; the claim check on a real false claim; the refill pacing under real quotas; the `mentions_reserve` rule.

### Second authorised run (`ses_1258e986-d03f-4f0b-819f-b5e765dbf32d`) and the real cause of the round-2 failure

35.7 s (best so far), 16 requests (cap 24), 13 of 15 calls OK, 0 HTTP 429, 11/11 seller replies valid with 0 economic rejections, no reserve mention, recommendation = server top (Zefiro Express €299.00, tied score 54 with Atelier, lower price wins), explanation by Groq 120B and accurate (fastest delivery, free shipping; trade-offs vs Brisa €261.45 and Atelier €332 are true). The claim check fired on a real false claim ("lowest price" for a pricier offer): rejected, recorded (`unsupported_claim:lowest_price`), corrected on the second attempt, no fallback. Pacing: 120B 1 wait (17.9 s, the final decision), 20B 1 wait (9.0 s). One fallback remained: Agent D, round 2.

**Cause of the round-2 failure (found from the stored output sample):** in the last round the model answered with the *final-decision* JSON (`{"chosenOfferId":…,"summary":…,"reasons":…}`), not a round JSON, so the strict round schema returned HTTP 400 and the escalated JSON-mode retry returned the wrong shape. The system prompt described both formats and the round prompt said "last round / roundsLeft 0 / finalRound". It was never a `rationale` length or token problem.

**Fix (tests only, not run on Groq):** round prompts no longer announce "last round" (they carry `round`, `totalRounds` and `respondWith: "… rationale and moves … not the final decision"`), the final turn carries `respondWith: "chosenOfferId, summary, reasons and tradeoffs"`, and the system prompt says the final format applies only when the turn is `final_decision`. Still to confirm with a real call.
