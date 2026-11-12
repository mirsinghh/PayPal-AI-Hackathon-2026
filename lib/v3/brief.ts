import { parseRequest } from "@/lib/request-parse";
import { eurosToCents, formatEur } from "@/shared/format";
import type { Preference, Priority, ProductIntent } from "@/shared/contracts/types";

/**
 * "Your mission": what Agent D understood from the user's sentence, plus the user's edits.
 *
 * Same contract as the classic brief (lib/request-parse.ts does the reading; the server's intent schema does the
 * judging). V3 only changes how it is presented. The budget keeps its meaning: a hard maximum, in euros, turned into
 * integer cents. Preferences stay optional hints, exactly as before.
 */
export const MIN_BUDGET_CENTS = 5_000;
export const MAX_BUDGET_CENTS = 1_000_000;

export interface BriefInput {
  prompt: string;
  /** null = follow what was understood from the sentence; a string = the user edited the field. */
  queryOverride: string | null;
  budgetOverride: string | null;
  priority: Priority;
  preferences: readonly Preference[];
}

export interface Mission {
  /** What Agent D will look for. */
  query: string;
  /** What is shown in the budget field. */
  budgetField: string;
  budgetCents: number | null;
  /** True while the budget field is simply following the sentence. */
  budgetFromPrompt: boolean;
  queryFromPrompt: boolean;
  /** Problems the user can act on. Empty = ready. */
  errors: Partial<Record<"productQuery" | "budgetCents", string>>;
  ready: boolean;
}

export const centsToField = (c: number): string => (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2));

export function deriveMission(input: BriefInput): Mission {
  const parsed = parseRequest(input.prompt);
  const { queryOverride, budgetOverride } = input;
  const queryFromPrompt = queryOverride === null;
  const query = (queryOverride === null ? parsed.query || input.prompt.trim() : queryOverride.trim()).trim();
  const budgetFromPrompt = budgetOverride === null;
  const budgetField = budgetOverride === null ? (parsed.budgetCents !== null ? centsToField(parsed.budgetCents) : "") : budgetOverride;
  const budgetCents = budgetField ? eurosToCents(budgetField) : null;

  const errors: Mission["errors"] = {};
  if (query.length < 3) errors.productQuery = "Tell Agent D what to look for, e.g. “wireless headphones”.";
  else if (query.length > 120) errors.productQuery = "Keep the description under 120 characters.";
  if (budgetCents === null || budgetCents < MIN_BUDGET_CENTS || budgetCents > MAX_BUDGET_CENTS) errors.budgetCents = "Enter a budget between €50 and €10,000.";

  return { query, budgetField, budgetCents, budgetFromPrompt, queryFromPrompt, errors, ready: Object.keys(errors).length === 0 };
}

/** Body for POST /api/negotiations. Identical shape and semantics to the classic UI. */
export function toIntent(mission: Mission, priority: Priority, preferences: readonly Preference[]): ProductIntent {
  if (!mission.ready || mission.budgetCents === null) throw new Error("mission_not_ready");
  return { productQuery: mission.query, budgetCents: mission.budgetCents, currency: "EUR", priority, preferences: [...preferences], language: "en" };
}

export const PRIORITY_LABEL: Record<Priority, string> = { lowest_price: "Lowest price", fast_delivery: "Fast delivery", best_value: "Best value" };
export const PREF_LABEL: Record<Preference, string> = { warranty: "Warranty", fast_delivery: "Fast delivery", free_shipping: "Free shipping" };

/** One plain sentence Agent D says back, so the user can catch a misunderstanding before sending. Never claims more than was understood. */
export function readBack(m: Mission): string {
  if (m.query.length < 3) return "Tell me what we are hunting for and I will write the mission.";
  if (m.budgetCents === null || m.errors.budgetCents) return `Got it: ${m.query}. What is the most you want to pay?`;
  return `Got it: ${m.query}, up to ${formatEur(m.budgetCents)}.`;
}
