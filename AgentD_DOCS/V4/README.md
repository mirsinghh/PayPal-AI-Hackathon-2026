# AgentD V4 — The Negotiation Room

V4 is an evolution of V3, mounted at `/v4`. V3 (`/v3`) and the classic UI (`/`) are untouched and still work. V4 reuses the same backend, engines, validators, ranking, approval and PayPal Sandbox flow; it changes how agents **speak**, how the recommendation is **explained**, and how the negotiation is **staged**.

Backup of the V3 state taken before any change: `..\paypal-AI-hackaton_BACKUP_V3_20261112-152156\` (sibling folder, private, contains `.env.local` and `.data`; see its `BACKUP_MANIFEST.md` for the restore procedure).

## Routes

| Route | What it is |
|---|---|
| `/v4` , `/v4/brief` | The V3 brief ("What are we hunting for today?"), unchanged, running under `/v4` |
| `/v4/negotiation/[id]` | **The Negotiation Room** (new) |
| `/v4/deals/[id]` | The V3 review/approval screen with **Agent D's Decision Lab** inserted (approval card unchanged) |
| `/v4/checkout/[id]` | The V3 assisted checkout, unchanged (same PayPal flow) |
| `/v4/activity` | The V3 local "My activity", unchanged |

`lib/v3/base.tsx` (`AppBaseProvider` / `useAppBase`) lets the unchanged V3 screens keep their links inside `/v4`; it defaults to `/v3`, so V3 behaves exactly as before. V4 has its own root layout (`app/v4/layout.tsx`) and stylesheet (`app/v4/v4.css`, which imports the V3 design system and adds only V4 classes).

## 1. Characters

* **Agent D** — strategic, curious, decisive, friendly. In live runs the buyer's system prompt now asks for natural, commercially-minded lines that mention the shopper's real priority and preferences, compare **only** with offers present in the data, and never reveal private reasoning (`BUYER_SYSTEM` in `server/agents/run.ts`).
* **The four sellers** each get a `voice` (`server/agents/catalog.ts`) appended to their private prompt: Brisa Outlet *The Bargain Hunter*, Zefiro Express *The Speed Specialist*, Atelier Norden *The Premium Advisor*, Korvan Direct *The Tough Negotiator*. A voice contains no number, price or rule (tested) and the prompt still ends with "the voice never changes your prices, reserve, concession limit or any rule". **Prices, reserve prices, discounts, concession caps, strategies, validators, ranking and budget checks are unchanged** (asserted by `tests/v4-voices.test.ts`).
* **Rule-based simulation (V0).** No extra model calls. `lib/v4/scripts.ts` composes in-character lines from data the server already validated: recorded prices, the store's own terms, the shopper's priority/preferences, and offers already visible earlier in the replay. Variants are chosen deterministically from the event id. Amounts quoted in a line are always recorded amounts; a store only claims "next-day" or "long-term protection" when its terms say so. These messages are shown as **Rule-based simulation · scripted line**, never as AI.
* **Real Gemini messages are never rewritten.** `lib/v4/conversation.ts` only replaces text for events whose own source is the rule engine (no `source`). AI turns and rules fallbacks keep their persisted text and origin.

## 2. Conversation (`components/v4/chat/V4Conversation.tsx`)

Built from persisted events (`lib/v3/conversation.ts`) plus V4 layers: character avatars/monograms and titles, bubbles per speaker, **grouping by round** (Mission, Opening offers, Round n, Evaluation), price-update cards (validated by the server), reaction chips (*Counteroffer*, *Improved offer*, *The store held its price*), a quiet origin line (dot + words) on every message, and technical details in a collapsed `Details`. Server verdicts, validations and fallbacks are banners, never a store's words, and a **commercial** hold ("the store held its price") is a different thing from a **server** rejection ("Not a store decision"). Views: all stores or one thread, and lenses *Conversation / Offer changes / Server checks / Result*; the structured timeline is still one click away. Live runs append as events are persisted; the replay keeps the V3 playback clock.

## 3. Agent D's Decision Lab (`lib/v4/lab.ts`, `components/v4/lab/DecisionLab.tsx`)

Each block answers one question:

* **A. Recommendation hero** — store, price, match score (the server's ranking score, explicitly *not* a probability), eligibility/headroom, strengths and trade-offs (Agent D's own, with their origin).
* **B. How the four offers score** — bars of the stored scores; eligible vs set-aside (hatched, unranked). Bars are split into **price / delivery / warranty** only when those real terms of the server's formula (`WEIGHTS` + the same min-max normalisation) reproduce **every** stored score exactly; otherwise the split is hidden, never guessed. Patterns + printed numbers + an accessible score table, so colour is never the only channel.
* **C. Where each store wins** — cheapest, fastest, longest warranty, best match, under budget (among eligible offers); click one to highlight, click a store to compare it with the pick.
* **D. Why this offer won** — your priority → score weights → what the winner gains over the runner-up; your preferences checked against the winner's actual terms; a note when Agent D chose an offer other than the top-ranked one (validated as eligible by the server). Plus a **What-if comparison** (clearly *Hypothetical*): the server's own `rankOffers` under another priority; it changes nothing.
* **E. Evidence and reasoning** — per conclusion ("Why X", "Why not Y"): items labelled **AI agent message / Rules fallback / Server check / Computed from offers**, with chips linking to the persisted events (in the room they jump to the message in the conversation).

It appears in the room once the negotiation is complete (before that, the tab shows what Agent D is weighing so far) and in `/v4/deals/[id]` above the comparison.

## 4. The Negotiation Room (`components/v4/room/NegotiationRoom.tsx`)

* **Top:** the four offers as compact cards (price, status, terms, score). On phones they are a contained snap carousel; on `sm`+ four columns. When Agent D has a pick the winner moves first and is highlighted.
* **Table:** Agent D (left) and the store it is dealing with (right) with the latest exchange as two bubbles, a line between them that flows while a request is out, and a separate banner for server checks/fallbacks. The store in focus follows Agent D's director (the persisted-event choreography from V3); pick a card to pin another store.
* **Agent D does not travel.** The director's "running" beat between stores is shown as scanning, so nothing runs on the spot and replay/live are never slowed by a walk. Reactions (offer received, counteroffer, discount, reject, success) are the existing sprites, queued and coalesced by the V3 director.
* **Side:** Agent D's activity, "Best offers so far" (price order only; says it isn't a recommendation), store details.
* **Below:** *Conversation* / *Decision Lab* tabs; the Lab and the final result card ("Open Decision Lab", "Review the offers").

## 5. Files

New: `app/v4/**` (layout, css, loading, 7 pages), `components/v4/{V4Footer.tsx, chat/V4Conversation.tsx, lab/DecisionLab.tsx, room/NegotiationRoom.tsx, deal/V4Deal.tsx}`, `lib/v4/{personas,scripts,conversation,lab}.ts`, `lib/v3/base.tsx`, `components/v3/BaseLink.tsx`, `tests/v4-voices.test.ts`, `tests/v4-lab.test.ts`, this folder.

Modified (behaviour unchanged for V3): `components/v3/{Chrome.tsx, ui.tsx, activity/ActivityExperience.tsx, brief/BriefExperience.tsx, checkout/CheckoutExperience.tsx, offers/ApprovalCard.tsx, offers/DealExperience.tsx}` (links/routes now use the mount point, default `/v3`; `DealExperience` gained an optional `labSlot`), `server/agents/catalog.ts` (`voice`), `server/agents/run.ts` (prompts; `sellerSystem` and `BUYER_SYSTEM` exported for tests), `vitest.config.mts` (tests write to a temp `DATA_DIR`; before this they wrote into the real `./.data`).

## 6. Tests and checks

217 tests in 20 files (196 before + 21 new), `tsc --noEmit`, `eslint` and `next build` clean. New tests cover: scripted lines (determinism, prefix-stability, recorded amounts only, no claims beyond the data, per-character tone), Gemini text/origin untouched on a verbatim real run, prompts (voice has no numbers, rules/reserve/concession lines intact, strategy table unchanged), score components reproducing stored scores for all three priorities, facets, what-if equals `rankOffers`, evidence origins and event links, hidden breakdown when scores can't be reproduced, and the Lab on a scripted multi-agent run.

Browser checks (Chromium, existing stored sessions only; no Gemini call, no payment): replay and finished states of a rule-based session, the verbatim real-Gemini session, Decision Lab, `/v4/deals`, 375 px and 1360 px with no horizontal page overflow, and 200 responses for classic, V3 and V4 routes.

## 7. Limitations (honest list)

* The prompt changes (seller voices, Agent D personality) were **not exercised against live Gemini** in V4 (no quota was used without authorisation). They are covered by prompt tests and by the same validators, but the new tone of real replies is unverified. The recorded real run in the tests predates them.
* The seller voices and Agent D prompt also apply to V3 live runs (same engine); V3's screens are unchanged.
* In the replay, scripted lines exist only for events the V0 engine emits (opening, one counteroffer, one reply per store). A store that held its price produces no event, so there is no "rejection" line to show; Korvan's firmness appears in its opening and reply lines.
* Reduced motion is implemented in CSS and in the playback hook (the replay opens finished) but was not checked in a browser. Replay 1×/2×/4× reuses the V3 playback and the mascot cadence logic; it was not re-measured.
* No axe/screen-reader audit; accessibility was checked by structure (labels, landmarks, `aria-pressed`, 44 px targets, patterns + numbers) and contrast tokens inherited from V3.
* The Decision Lab is hidden until the negotiation is complete (the scores it explains only exist then).
* The browser pane used for testing often stalls on a reloaded page when the app window is in the background; checks were repeated in fresh tabs.
