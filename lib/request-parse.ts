import { eurosToCents } from "@/shared/format";

/**
 * Turns a natural-language shopping request into the fields the API contract needs.
 * Pure and conservative: if it isn't sure about the budget it returns null and the user types it.
 *   "Find me wireless headphones under €300" -> { query: "Wireless headphones", budgetCents: 30000 }
 */
const BUDGET_RE =
  /(?:\b(?:under|below|less than|up to|max(?:imum)?(?: budget)?(?: of)?|at most|within|no more than|budget(?: of)?|for)\b\s*|\b)(?:€\s*(\d[\d.,]*)|(\d[\d.,]*)\s*(?:€|eur(?:os?)?\b))/i;
const FILLER_PREFIX = /^\s*(?:please\s+)?(?:(?:can you\s+)?(?:find|get|buy|search for|look for)\s+(?:me\s+)?|i(?:'m| am)? (?:want|need|looking for)\s+|looking for\s+)/i;
const LEADING_ARTICLE = /^(?:an?|the|some)\s+/i;

export interface ParsedRequest {
  /** Cleaned product description (no budget phrase, no "find me"). */
  query: string;
  budgetCents: number | null;
}

export function parseRequest(raw: string): ParsedRequest {
  let text = raw.replace(/\s+/g, " ").trim();
  let budgetCents: number | null = null;

  const m = BUDGET_RE.exec(text);
  if (m) {
    const amount = m[1] ?? m[2];
    // Trailing sentence punctuation is not part of the number ("€300." / "€300,").
    const cents = eurosToCents(amount.replace(/[.,]+$/, ""));
    if (cents !== null) {
      budgetCents = cents;
      text = (text.slice(0, m.index) + " " + text.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim();
    }
  }

  text = text
    .replace(FILLER_PREFIX, "")
    .replace(LEADING_ARTICLE, "")
    .replace(/[\s,;:.\-–—]+$/g, "")
    .replace(/^[\s,;:.\-–—]+/g, "")
    .trim();
  if (text) text = text[0].toUpperCase() + text.slice(1);
  return { query: text, budgetCents };
}
