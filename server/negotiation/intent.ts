import { z } from "zod";
import { PREFERENCES, PRIORITIES, type ProductIntent } from "@/shared/contracts/types";

export const MIN_BUDGET_CENTS = 5_000;
export const MAX_BUDGET_CENTS = 1_000_000;

export const intentSchema = z.object({
  productQuery: z
    .string()
    .trim()
    .min(3, "Add a product or key feature so your agent knows what to compare.")
    .max(120, "Keep the description under 120 characters.")
    // No HTML in the query; it is later rendered and sent to the LLM as data.
    .refine((s) => !/[<>]/.test(s), "Use plain text only."),
  budgetCents: z
    .number()
    .int("Enter a valid amount.")
    .min(MIN_BUDGET_CENTS, "Enter a budget between €50 and €10,000.")
    .max(MAX_BUDGET_CENTS, "Enter a budget between €50 and €10,000."),
  currency: z.literal("EUR"),
  priority: z.enum(PRIORITIES),
  preferences: z.array(z.enum(PREFERENCES)).max(PREFERENCES.length).default([]),
  language: z.literal("en"),
});

export type IntentParseResult =
  | { ok: true; intent: ProductIntent }
  | { ok: false; fieldErrors: Record<string, string> };

export function parseIntent(input: unknown): IntentParseResult {
  const result = intentSchema.safeParse(input);
  if (result.success) {
    return {
      ok: true,
      intent: { ...result.data, preferences: [...new Set(result.data.preferences)] },
    };
  }
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, fieldErrors };
}

export { formatEur, eurosToCents } from "@/shared/format";
