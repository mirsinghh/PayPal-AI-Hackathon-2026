# Demo video script (target 2:50, hard limit 3:00)

Goal: show one real run from brief to a confirmed Sandbox payment, and make the judges understand it is an **agent negotiating with checks, and a human deciding**. Narrate in English. Record at 1080p, browser at ~1360 px wide, sound on.

**Before recording (checklist)**
- Use the production build (`npm run build && npm start`) or the public deployment; clear `.data/` of old sessions.
- Decide the engine and say it honestly on screen:
  - **Live multi-agent** (`MULTI_AGENT_NEGOTIATION=true`): free-tier pacing makes a run take minutes. Record it once, then **cut or speed up the waiting** and add a "sped up ×N" caption. Only show it as live if the badge says "Live AI agents". If a fallback chip appears, keep it in the video and mention it: it proves the guardrails.
  - **Rule-based replay**: the badge says "Rule-based simulation · replay". Never call it live agents.
- Have a PayPal **Sandbox personal** account ready, pop-ups allowed, and do a full dry run first (offers expire after 30 minutes).
- Hide bookmarks and notifications; never show `.env.local`, client secrets or Sandbox passwords on screen.

| Time | Screen | Narration (suggested) |
|---|---|---|
| 0:00–0:20 | `/v3` hero, Agent D running to a store | "Getting the best price means comparing sellers and haggling by hand. AgentDeal gives you Agent D: an AI buyer that negotiates for you. Your AI agent negotiates. You decide." |
| 0:20–0:50 | `/v3/brief`: type "Running shoes with free shipping, up to €100"; the mission card fills; set priority; **Start negotiating** | "I describe what I want in plain words. Agent D reads it back, extracts the product, the budget and my priority, and I can edit anything before it starts." |
| 0:50–1:40 | Negotiation stage: Agent D walks store to store; show the activity line, the **Conversation** view (store threads, AI agent messages and price cards, then the **How Agent D is deciding** panel), a price dropping, and a fallback or server-validation chip if one appears | "Four fictional stores. Each seller is its own model with its own strategy. Agent D counters, they reply, and every move is a recorded event. The server checks every price against the store's rules and my budget. If a model fails or proposes something invalid, it is flagged here, and it is never mistaken for the store's decision." |
| 1:40–2:10 | Deal page: "What Agent D achieved", reasons and trade-offs, comparison table; point at **AI analysis** (or say "rule-based explanation" if that is what shows) | "Agent D recommends one offer and shows what it achieved: this much below the opening price, this far under budget, and the trade-off against the next-best store. All numbers come from the server's own data." |
| 2:10–2:35 | Click **Approve this offer** ("Approved. You haven't paid yet"); Agent D opens the checkout and prepares the PayPal order by itself → click the official PayPal button → Sandbox login → approve | "Approval is a separate, explicit step on the exact offer. Only then does Agent D prepare the PayPal Sandbox order, and I still authorise it myself in PayPal. The amount comes from the server, never from the browser." |
| 2:35–2:50 | Receipt: **Capture confirmed**, order ID, capture ID, "Matches approved offer: Yes", Agent D celebrates | "The server verified the capture with PayPal: status, currency and amount. Only now does Agent D celebrate. An agent that negotiates, a system that verifies, and a person who decides when to pay. That is AgentDeal." |

**Upload checklist**: public YouTube link, under 3:00, shows the product working end to end (not slides or a mock-up), no secrets visible, description links the public repository and the live demo.
