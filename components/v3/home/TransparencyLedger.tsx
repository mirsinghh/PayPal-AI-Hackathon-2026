"use client";

import { useEngineMode } from "@/lib/v3/use-engine-mode";

/** What a judge or a customer can rely on, stated plainly. Mirrors the server code, not the marketing. The engine row follows /api/config. */
export function TransparencyLedger() {
  const { multiAgent } = useEngineMode();
  const rows: { real: boolean; k: string; v: string }[] = [
    { real: true, k: "PayPal Sandbox payments", v: "Orders are created and captured through the PayPal API. The amount is set on the server from the offer you approved." },
    { real: true, k: "Your approval", v: "The server will not create an order until you approve the exact offer. Approval and PayPal authorisation are separate steps." },
    { real: true, k: "Server-side price checks", v: "Every price is validated against the store's policy and your budget before it can be recommended or paid." },
    multiAgent
      ? { real: true, k: "AI agents", v: "The buyer and seller agents are real AI (Google Gemini). Their proposals are validated by the server, and a recorded fallback is shown whenever a call fails or is rejected." }
      : { real: false, k: "The negotiation", v: "A deterministic rule engine plays the stores. The demo above is a recorded run of it, and your live screen replays a run the server already computed." },
    { real: false, k: "Stores, stock and delivery", v: "Four fictional merchants with demo inventory. Nothing is shipped and no real purchase happens." },
  ];
  return (
    <dl className="divide-y divide-v3-line overflow-hidden rounded-v3-lg border border-v3-line bg-v3-surface">
      {rows.map((r) => (
        <div key={r.k} className="grid gap-1 p-5 sm:grid-cols-[7.5rem_1fr] sm:gap-4">
          <dt>
            <span className={`v3-chip ${r.real ? "v3-chip--success" : "v3-chip--warn"}`}>{r.real ? "Real" : "Simulated"}</span>
          </dt>
          <dd>
            <p className="font-extrabold">{r.k}</p>
            <p className="mt-1 text-[0.95rem] leading-snug text-v3-ink2 text-pretty">{r.v}</p>
          </dd>
        </div>
      ))}
    </dl>
  );
}
