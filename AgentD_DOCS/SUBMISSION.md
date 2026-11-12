# AgentD: texts for the hackathon submission

Copy each block into the form. Replace `<YOUTUBE_URL>` once the video is uploaded.

---

## 1. Project name

AgentD

## 2. Tagline

Agent D, it always gets you the best deal.

## 3. Text description (paste into the form)

**AgentD is an agentic-commerce app where an AI buyer negotiates for you and PayPal Sandbox settles the deal, but only after you approve one exact offer.**

Getting a good price means comparing stores and haggling by hand. With AgentD you type what you want and your budget ("wireless headphones with noise cancelling, up to €300"). **Agent D**, an animated buyer agent, reads the request back, negotiates with four store agents that each play by their own commercial rules (a price fighter, a next-day-delivery specialist, a premium 3-year-warranty store and a hard negotiator), and brings back competing offers. You compare them in a Decision Lab, see what Agent D achieved (opening vs final price, savings under budget, trade-offs against the runner-up), approve one offer, and pay with PayPal Sandbox.

**Key features**
- **Two reply modes, chosen per negotiation:** *Server Rules* (deterministic engine, no model calls) or *AI Agents* (a buyer model plus four seller models with private strategies and memory, running on Groq).
- **AI proposes, the server validates, a human decides.** Every price a model proposes is checked in code against the store's reserve price, per-round concession caps, "no price increases" and your budget. Rejected proposals are recorded and never applied. If a model fails, the turn is labelled "Rules fallback", never passed off as AI.
- **Secure PayPal Sandbox checkout:** the browser never sends a price. The server creates the order from the approved offer (idempotent request id), the buyer approves in PayPal, and the server verifies status, currency, amount and custom id on capture before showing "Capture confirmed".
- **Transparent negotiation room:** per-store chat threads, price cards, an origin label on every message (AI / server rule / fallback), and a live "how Agent D is deciding" panel built from recorded events.
- **Accounts and history** (Supabase Auth + Row Level Security): requests, analyses, negotiations, payments and savings per user. Guests can negotiate and pay too.

Everything is a simulation: the four stores are fictional, no real merchant is contacted, nothing ships, and the server refuses any PayPal environment other than Sandbox.

## 4. Tools used (paste into the form)

- **PayPal Sandbox** (REST Orders v2 + JS SDK v6): the full payment path. The server creates the order from the stored approved offer, the buyer approves in PayPal, the server captures and verifies the result. A guard in the client refuses any non-sandbox environment.
- **Groq** (`openai/gpt-oss-120b` for Agent D, `openai/gpt-oss-20b` for the four store agents): AI Agents mode, with strict JSON-Schema structured output, plus the written explanation of the winning offer.
- **Google Gemini** (optional alternative provider behind the same adapter).
- **Supabase** (Auth, Postgres, Row Level Security): accounts, persistence and history.
- **Next.js 16, React 19, Tailwind 4, Zod, Vitest**: app, API routes, validation of every model output, 445 tests.
- **Vercel**: public hosting.
- **Claude Code**: AI pair-programming to build and test the project.

## 5. Links

- Live demo: https://paypal-ai-hackathon-2026-pied.vercel.app/
- Code (MIT): https://github.com/mirsinghh/PayPal-AI-Hackathon-2026
- Video: `<YOUTUBE_URL>`

## 6. Testing instructions for judges (paste if the form has the field)

1. Open the live demo and click **Start Negotiating**.
2. Type a request such as "Wireless headphones with noise cancelling, up to €300", pick **AI Agents** (or Server Rules) and start.
3. Watch the negotiation room, review the offers, click **Approve this offer**.
4. Pay with the PayPal button using a **PayPal Sandbox personal (buyer) account**. Sandbox credentials: `<add the email/password of a sandbox buyer you created, or tell judges to use their own sandbox personal account>`.
5. The receipt must show **Capture confirmed**. Optional: sign up and open **History**.

Run it yourself: setup steps are in the README ("Run it locally"); it works without an AI key or database (server rules + local files).

---

## 7. Video script (target 2:45, hard limit 3:00)

Record at 1080p, browser ~1360 px wide, sound on, **no music** (or royalty-free only), narrate in English. Use the live URL. Do one full dry run first: the AI Agents run needs Groq quota, and offers expire after 30 minutes. Hide bookmarks, `.env.local`, secrets and the Sandbox password (type it off-screen or pre-log-in to PayPal Sandbox).

| Time | On screen | Narration |
|---|---|---|
| 0:00–0:15 | Landing hero, Agent D animation | "Getting the best price means comparing stores and haggling by hand. AgentD gives you Agent D: an AI buyer that negotiates for you, while you stay in control." |
| 0:15–0:35 | `/brief`: type *"Wireless headphones with noise cancelling, up to €300"*; the mission card fills in | "I describe what I want in plain words. Agent D reads it back: product, budget, priority. I can edit anything before it starts." |
| 0:35–0:55 | Zoom on the **Server Rules / AI Agents** switch, pick **AI Agents**, press Start | "I choose who writes the store replies. Server Rules is a deterministic engine. AI Agents uses real models on Groq: one buyer and four sellers, each with its own strategy." |
| 0:55–1:35 | Negotiation Room: store threads, price dropping, origin labels; point at a **Rules fallback** or "rejected by server" chip if one appears; open the "how Agent D is deciding" panel | "Four fictional stores, four strategies. Agent D counters, they reply, and every move is a recorded event. The server checks every price against the store's price floor, concession caps and my budget. If a model proposes something invalid, it is rejected and flagged here. If a model fails, the turn is labelled as a fallback, never passed off as AI." |
| 1:35–2:05 | Deal page: recommended offer, **What Agent D achieved**, Decision Lab, comparison | "Agent D recommends one offer and shows what it achieved: how far below the opening price, how far under budget, and the trade-off against the runner-up. The cheapest offer is not always the winner: warranty and delivery count." |
| 2:05–2:30 | Click **Approve this offer** → checkout → PayPal button → Sandbox buyer → approve | "Approval is a separate, explicit step on this exact offer. Only then is the PayPal Sandbox order created, with the amount taken from the server, never from the browser. I authorise it myself in PayPal." |
| 2:30–2:45 | Receipt: **Capture confirmed**, order id, capture id, "matches approved offer"; flash **History** | "The server verifies the capture with PayPal: status, currency and amount. Only then does Agent D celebrate. A purchase is saved to my history with the savings." |
| 2:45–2:55 | Landing / logo | "AI proposes, the server validates, a human decides. This is AgentD." |

Tips: if the AI run is slow, cut or speed up the waiting and add a "sped up" caption. Do not show Agent Auto-Buy (it is unavailable until PayPal enables Vault). Never call a Server Rules run "live AI".

---

## 8. YouTube description (paste under the video)

**AgentD: an AI buyer agent that negotiates for you, and a human who decides.** PayPal AI Hackathon 2026.

Describe what you want and your budget. Agent D negotiates with four store agents, each with its own strategy, brings back competing offers, and pays with PayPal Sandbox only after you approve one exact offer. Every AI price is validated by the server; the payment amount never comes from the browser.

Live demo: https://paypal-ai-hackathon-2026-pied.vercel.app/
Code (MIT): https://github.com/mirsinghh/PayPal-AI-Hackathon-2026

Built with PayPal Sandbox, Groq (GPT-OSS 120B / 20B), Supabase, Next.js and Vercel. All stores are fictional and all payments run on PayPal Sandbox: no real money moves.

---

## 9. Submission checklist

- [ ] Push the latest commit so Vercel redeploys (the live site must show the new version before recording).
- [ ] GitHub repo is **public**, `LICENSE` (MIT) appears in the About section; add the live URL and topics in About.
- [ ] Video < 3:00, public on YouTube, link pasted in the form and in this file.
- [ ] No third-party logos or copyrighted music in the video.
- [ ] `.env.local` never committed (it is git-ignored).
- [ ] Sandbox buyer credentials given to judges in the form's testing field, not in the public repo.
