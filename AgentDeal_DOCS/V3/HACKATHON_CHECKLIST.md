# Hackathon final checklist

Status legend: **VERIFIED** (run in this repo, evidence below) · **PENDING AUTHORISATION** (spends Gemini quota or makes a payment) · **BLOCKED** · **NOT CHECKED**.
Deadline: 12 Nov 2026, 12:00 PST (21:00 Spain).

## P0 — critical validation

| # | Item | Status | Evidence / next step |
|---|---|---|---|
| 1 | Full flow brief → negotiation → review → approval → PayPal Sandbox → confirmed capture | **PENDING AUTHORISATION** | Verified up to the official PayPal button with the correct amount (€87.96), approval step and trail. Authorising and capturing needs a Sandbox buyer login (done by a person). Steps in `README.md` → *End-to-end manual test*. |
| 2 | Real multi-agent run with Gemini (polling, seller replies, price validation, fallbacks) | **VERIFIED** | One authorised run, session `ses_993da5d7…`, model `gemini-3.5-flash`, flag on, `AI_RPM_LIMIT=5`, deadline 300 s. `mode: multi_agent`, `status: ready`, duration 3 min 02 s. **16 of 16 model calls used, 14 succeeded**, 13.3k input / 1.5k output tokens. Events: 4 AI opening quotes, 8 AI seller counter-replies (all four sellers lowered prices), 4 buyer counters, 1 buyer round plan by Gemini. **Guardrails fired for real:** the buyer's round-2 output failed schema validation (`schema_invalid:rationale`) → `OFFER_REJECTED_BY_SERVER` + `AGENT_FALLBACK`, and a rules-based move replaced it, labelled. 2 proposals rejected by the server in total. Polling showed events arriving progressively (14 → 18 → 33 → 40). |
| 3 | Winner explanation shows **AI analysis** when Gemini answers | **VERIFIED** | Same session: `evaluation.source: llm`, `aiStatus: succeeded`; the V3 review page showed "AI analysis · gemini-3.5-flash" with advantages and trade-offs. Winner: Atelier Norden €332.00 (opened €349.00), not the cheapest (Brisa Outlet €254.90, Zefiro Express €299.00): the buyer weighted the 36-month warranty preference, and the trade-offs say so. |
| 4 | Fix blocking errors, keep security guarantees | **VERIFIED** | No blocking error found in the flows exercised. See *Errors found* below. |

## P1 — product value

| # | Item | Status | Evidence |
|---|---|---|---|
| 5 | Final offer explains the value achieved | **VERIFIED** | New "What Agent D achieved" card (`lib/v3/deal-intel.ts`): opening vs final price (€3.93 / 4.3%), under budget (€12.04), counters and replies, gap vs next-best offer, trade-offs vs rival. Only server data; no market comparisons. Page text read in the browser; 10 tests. |
| 6 | Observable reasoning of Agent D from persisted events | **VERIFIED** | New "How Agent D is deciding" panel (`lib/v3/reasoning.ts`): each line shows its origin (AI agent · recorded, Rules fallback, Server check, Computed from offers); the price-vs-delivery trade-off is computed from revealed offers (e.g. "Brisa Outlet has the lowest price so far (€75.99), but Zefiro Express delivers sooner (Next day vs 6 days)"). Model text appears only when the event says a model wrote it. |
| 7 | Clear approval and payment states | **VERIFIED** (UI) / pending live capture | Header chip distinguishes *Negotiation finished · awaiting approval* / *Approved · not paid yet* / *Paid*. Checkout "Verified path" (`lib/v3/trail.ts`): negotiation finished → approved (time, amount) → PayPal payment → capture confirmed (order, capture ID, "matches approved offer"). Mismatch is flagged. 10 tests. The confirmed-capture state itself has only been exercised in unit tests. |

## P2 — quality

| # | Item | Status | Evidence |
|---|---|---|---|
| 8 | Reduced motion | **NOT CHECKED in a browser** | Implemented (static pose, replay opens finished, ambient loops off) and reviewed in code; the test browser cannot emulate the OS setting. Check once: OS "reduce motion" on → `/v3`. |
| 9 | Agent D vs timeline lag at 2×/4× | **VERIFIED (logic)** | Mascot cadence and walk now follow the replay speed (`Stage` `pace = speed`), default speed 1×. Not re-inspected visually at 4×. |
| 10 | Tests, typecheck, lint, build | **VERIFIED** | `npm test`: 15 files, **173 tests pass**; `typecheck` and `lint` clean; `npm run build` OK (classic + V3 routes). |
| 11 | Accessibility and responsive review | **PARTIAL** | Checked earlier in the browser: 1360 px and 375 px without horizontal overflow; radio/label names, `alt`, landmarks, one `h1`, ≥44 px targets, AA contrasts computed. No automated audit or screen-reader pass. |

## P3 — delivery

| # | Item | Status | Evidence / next step |
|---|---|---|---|
| 13 | English README with architecture, configuration and test steps | **VERIFIED** | `README.md` rewritten. |
| 14 | Public repository, open-source licence, reproducible instructions | **PENDING (needs you)** | `LICENSE` (MIT) added: **change it if you prefer another**. The folder is **not a git repository** and has no remote: create the public GitHub repo and push (`.env*` and `.data/` are already git-ignored). |
| 15 | Video script under 3 minutes | **VERIFIED** | `AgentDeal_DOCS/V3/VIDEO_SCRIPT.md` (2:50, timings, narration, honest-engine rules, pre-recording checklist). The video itself is yours to record and upload. |
| 16 | Public deployment reachable; no secrets in the browser | **PARTIAL** | Client bundle scanned: `PAYPAL_CLIENT_SECRET` and `AI_API_KEY` appear nowhere in `.next/static` or `public`; the browser only receives the public PayPal client ID. **Deployment not checked:** it needs Vercel + Supabase set up by you (`supabase/schema.sql`); give me the URL and I will test it. |

## Store names

Final decision: the four stores keep their **original fictional names** (Brisa Outlet, Zefiro Express, Atelier Norden, Korvan Direct) so the demo and the video contain no third-party marks. A temporary variant that used real marketplace names was reverted; ids, policies and prices were never changed. Product names stayed generic ("Wireless ANC Headphones · Value edition"). `tests/fixtures/gemini-run.json` is a verbatim record of a real Gemini run made while the temporary names were active, so its recorded texts still mention them: it is test data only and never shown in the app.

## Errors found during this pass

1. Earlier Gemini explanation calls returned **429** (quota) in the dev log. In the authorised run Gemini answered normally (14/16 calls), so quota was available at that moment; it is tight: one run used the full 16-call budget and ~3 min at 5 requests/minute. Plan the recording around it.
1b. **Fixed:** the buyer's final-choice event records `source: "llm"`, which V3 labelled "Server check" instead of AI. Now recognised (`isAi`), with a test.
2. No `LICENSE` and no git repository. (LICENSE added; repository is yours to publish.)
3. V0 sessions call Gemini once on creation for the explanation, so even a "rule-based" run spends quota unless `AI_API_KEY` is empty. (For tests I started the server with `AI_API_KEY=""`.)
4. Test-browser artefact: pages do not hydrate or paint while the app window is minimised; reproduced on the classic UI too, so not a V3 defect.

## Next steps, in order

1. Do the Sandbox payment yourself (README → End-to-end manual test) on a fresh session: use the live engine so the video shows real agents.
2. Optional safety net: an OpenAI-compatible provider behind the same validators in case Gemini returns 429 during recording (not needed in this run, so not built).
3. Create the public repo and the deployment; record the video from `VIDEO_SCRIPT.md`.

## V3.1 — conversational negotiation, assisted checkout, local activity

| Item | Status | Evidence |
|---|---|---|
| Chat per store + global view, Agent D vs four stores, origin labels, price cards, technical details, timeline kept as secondary view | **VERIFIED** | Viewed in the browser on the real Gemini session and on a fresh V0 run. See `CONVERSATION.md`. |
| Authenticity (verbatim persisted texts, origin from `source`, amounts recorded, prefix-stable polling, fallbacks and server rejections) | **VERIFIED** | `tests/v3-conversation.test.ts` (15 tests) on the real Gemini fixture and on the real orchestrator with a scripted model. No engine change was needed: the texts were already persisted. |
| Live polling visual with Gemini while it runs | **NOT RE-CHECKED** | Logic tested; watching it live would spend Gemini quota again. |
| Assisted checkout: after the server-confirmed approval Agent D opens the checkout and the PayPal order is prepared automatically; the buyer still authorises with the official button | **VERIFIED up to the PayPal button** | Browser: approval → "Agent D is preparing your checkout" → auto-navigation (cancellable, "Stay on this page") → prepared Sandbox order `9XS3…` with €87.96 shown in the verified path. Tests: no order before approval, prepare-then-click reuses one order with the server amount, capture verified and not repeated. The PayPal authorisation + capture of this new flow was **not re-run** by me (it was verified end to end earlier, same capture code). |
| Future autonomous purchase | **DOCUMENTED** | `AUTONOMOUS_CHECKOUT_FUTURE.md` (not implemented). |
| My activity (local) | **VERIFIED** | `/v3/activity`: list kept in this browser only, details via the existing per-session endpoint, AI analysis, transcript, Sandbox receipt; limits stated on screen. 3 tests. No listing endpoint exists. |
| Tests / typecheck / lint / build | **VERIFIED** | 18 files, 196 tests pass; typecheck and lint clean; build OK. |
| Third-party store names in the video | **RESOLVED** | Original fictional names restored (see *Store names*). The recorded Gemini fixture is test data only. |
