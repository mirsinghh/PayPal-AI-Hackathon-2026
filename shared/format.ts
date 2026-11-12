/** Formats integer cents as EUR for display (e.g. 29900 -> €299.00). Never used as a source of truth. */
export function formatEur(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}€${euros}.${String(abs % 100).padStart(2, "0")}`;
}

/** Parses a user-typed euro amount ("350", "349.99", "1,200.50") into integer cents without floats. */
export function eurosToCents(raw: string): number | null {
  const cleaned = raw.trim().replace(/[\s€]/g, "").replace(/,(?=\d{3}(\D|$))/g, "");
  const m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(cleaned);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
  return Number.isSafeInteger(cents) ? cents : null;
}

export const DEMO_NOTICE =
  "Demo experience: seller agents, offers and product terms are simulated. PayPal transactions use Sandbox.";

/** Shown whenever the agents are real AI: be explicit about what is real and what is demo. */
export const AI_DEMO_NOTICE =
  "The buyer and seller agents are real AI (Google Gemini). The stores, inventory and offers belong to a demo environment; no real purchase happens and payments use PayPal Sandbox.";
