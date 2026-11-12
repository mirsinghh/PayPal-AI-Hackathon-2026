import { describe, expect, it } from "vitest";
import { centsToField, deriveMission, readBack, toIntent, type BriefInput } from "@/lib/v3/brief";
import { parseIntent } from "@/server/negotiation/intent";

const base: BriefInput = { prompt: "", queryOverride: null, budgetOverride: null, priority: "best_value", preferences: [] };

describe("V3 mission (brief)", () => {
  it("reads the product and the budget from the sentence, like the classic brief", () => {
    const m = deriveMission({ ...base, prompt: "Find me wireless headphones under €300" });
    expect(m.query).toBe("Wireless headphones");
    expect(m.budgetCents).toBe(30_000);
    expect(m.budgetField).toBe("300");
    expect(m.budgetFromPrompt).toBe(true);
    expect(m.ready).toBe(true);
    expect(readBack(m)).toBe("Got it: Wireless headphones, up to €300.00.");
  });

  it("does not invent a budget it was not told", () => {
    const m = deriveMission({ ...base, prompt: "noise cancelling headphones" });
    expect(m.budgetCents).toBeNull();
    expect(m.ready).toBe(false);
    expect(m.errors.budgetCents).toMatch(/€50 and €10,000/);
    expect(readBack(m)).toMatch(/most you want to pay/);
  });

  it("asks for a product before anything else", () => {
    const m = deriveMission(base);
    expect(m.errors.productQuery).toBeTruthy();
    expect(readBack(m)).toMatch(/what we are hunting for/);
  });

  it("lets the user edit what was understood without losing the rest", () => {
    const m = deriveMission({ ...base, prompt: "headphones under 200", queryOverride: "Open-back studio headphones", budgetOverride: "249.99" });
    expect(m.query).toBe("Open-back studio headphones");
    expect(m.budgetCents).toBe(24_999);
    expect(m.queryFromPrompt).toBe(false);
    expect(m.budgetFromPrompt).toBe(false);
  });

  it("keeps the budget limits and money in integer cents", () => {
    expect(deriveMission({ ...base, prompt: "a laptop", budgetOverride: "49.99" }).errors.budgetCents).toBeTruthy();
    expect(deriveMission({ ...base, prompt: "a laptop", budgetOverride: "10000.01" }).errors.budgetCents).toBeTruthy();
    expect(deriveMission({ ...base, prompt: "a laptop", budgetOverride: "50" }).budgetCents).toBe(5_000);
    expect(deriveMission({ ...base, prompt: "a laptop", budgetOverride: "abc" }).budgetCents).toBeNull();
    expect(centsToField(30_000)).toBe("300");
    expect(centsToField(24_999)).toBe("249.99");
  });

  it("builds the same payload the classic UI sends, and the server accepts it", () => {
    const m = deriveMission({ ...base, prompt: "Running shoes with free shipping, up to €100" });
    const intent = toIntent(m, "lowest_price", ["free_shipping"]);
    expect(intent).toEqual({ productQuery: m.query, budgetCents: 10_000, currency: "EUR", priority: "lowest_price", preferences: ["free_shipping"], language: "en" });
    expect(Number.isInteger(intent.budgetCents)).toBe(true);
    expect(parseIntent(intent).ok).toBe(true);
  });

  it("refuses to build a payload from an incomplete mission", () => {
    expect(() => toIntent(deriveMission(base), "best_value", [])).toThrow("mission_not_ready");
  });

  it("applies the same product-length rule as the server", () => {
    const long = "x".repeat(121);
    const m = deriveMission({ ...base, prompt: long, budgetOverride: "100" });
    expect(m.errors.productQuery).toMatch(/under 120/);
    expect(parseIntent({ productQuery: long, budgetCents: 10_000, currency: "EUR", priority: "best_value", preferences: [], language: "en" }).ok).toBe(false);
  });
});
