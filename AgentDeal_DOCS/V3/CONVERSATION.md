# V3.1 — Conversational negotiation

The negotiation screen now reads as a conversation between Agent D (buyer) and the four stores, with a per-store thread, a global view and the structured timeline as the secondary view. Everything is derived from persisted `NegotiationEvent`s. No engine, contract, validator, ranking rule or commercial policy was changed.

## Audit: what the agents actually produce and what is stored

Inspected on a real multi-agent run with Gemini (`gemini-3.5-flash`, 40 events) and on the code (`server/agents/run.ts`, `recorder.ts`).

| Content | Where it is persisted | Used by the chat |
|---|---|---|
| Seller opening message | `OFFER_RECEIVED.payload.message` (+ `source`, `model`, `latencyMs`, `round`) | verbatim |
| Buyer message to a store | `BUYER_MESSAGE.payload.message` (+ `targetPriceCents`, `source`) | verbatim |
| Seller reply / argument | `COUNTEROFFER_RECEIVED.payload.message` (+ `previous/newPriceCents`, `held`, `source`) | verbatim |
| Buyer's round rationale | only in `BUYER_DECISION.feedText` ("Round N: …") | verbatim, prefix removed |
| Buyer's final choice | `BUYER_DECISION.feedText` (+ `source: "llm"`), explanation in `evaluation` | verbatim |
| Server rejections / fallbacks | `OFFER_REJECTED_BY_SERVER.reasons`, `AGENT_FALLBACK` (+ `feedText`) | banners |
| **Text of a proposal the server rejected** | **not stored** (only the reason codes) | not shown |

Conclusion: the original model texts **were already persisted**, so no persistence change was needed. The one gap (rejected proposal text) would require touching the engine's recorder and was left alone, as required.

## Authenticity rules (enforced by `tests/v3-conversation.test.ts`)

- A message's words are the event's own text; nothing is paraphrased or invented. The test compares the chat's text with the persisted payloads one by one, on the real Gemini fixture (`tests/fixtures/gemini-run.json`) and on a scripted real orchestrator run.
- **Origin** comes from the event's `source`: `gemini`/`llm` → *AI agent message*; `rules_fallback` → *Rules fallback*; no source on a message → *Rule-based simulation* (V0 engine templates); server verdicts/guardrails → *Server validation*; mission/joined/finished lines → *System status*.
- V0 has no text for the opening offer, so the line "Opening offer: €X." is a template built from the recorded price, marked `templated` and labelled as simulation. V0 buyer asks and store replies are the engine's own persisted texts.
- **Money lives in the price card**, not the prose: cards take `previous → current` (and item + shipping) from the validated offer events, labelled "validated by the server". Euro amounts quoted inside a message are cross-checked against prices the server had already recorded; an unrecorded one gets a "narrative, not a validated price" chip. On the real Gemini run **every** amount quoted in the 16 AI messages (4 openings, 4 buyer asks, 8 replies) matched a recorded price; a model quoting an amount the server did not provide is rejected by the server before it is stored (tested).
- The chat is prefix-stable: polling in more events never rewrites earlier messages (tested for every prefix of the real run).
- A model's words never change a price, a policy or a decision: the engine validates first, the UI only displays.

## UI

`components/v3/negotiation/Conversation.tsx`, built from `lib/v3/conversation.ts`.
- Buyer bubbles on the right with an Agent D pose that matches the moment (counteroffer, thinking, success); store bubbles on the left with the store's mark. Origin chip on every bubble; clock; **Technical details** (event type and sequence, round, source, model, latency, rejection reasons).
- Per-store thread via the picker (shared with the stage: selecting a stall also selects its thread), "All stores" for the global order; unread-free counters and last validated price per store.
- Server verdicts, validations and fallbacks are centered banners (never mistaken for a store or agent speaking); system lines are small status chips.
- A typing indicator appears only for the recorded "asked, not yet answered" state of a live run.
- The stage keeps Agent D's animated reactions to the same events (`event-map.ts`, unchanged); the conversation header says what Agent D is doing.
- The structured timeline (`EventLog`) is one click away under **Timeline**.
- Replay (V0) and live polling (multi-agent) use the same visible-events list as before.

## What works where

| | Real Gemini | V0 simulation |
|---|---|---|
| Messages, threads, price cards, origins | **Verified** on a real run's persisted events (tests + UI viewed on that session) | **Verified** live in the browser |
| Live polling visual (messages appearing while it runs) | Logic tested (prefix-stable, hydrate/sync); **not re-watched live** (would spend quota again) | n/a (replay) |
| Fallback / server-validation banners | Shown from the real run's events | n/a (V0 emits none) |
