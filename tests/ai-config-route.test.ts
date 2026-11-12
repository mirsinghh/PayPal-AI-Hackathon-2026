import { it, expect, vi } from "vitest";
import { tripQuotaBreaker } from "@/server/agents/config";
vi.mock("next/server", () => ({ connection: async () => undefined }));
it("config route exposes the AI issue", async () => {
  vi.stubEnv("AI_PROVIDER", "groq");
  vi.stubEnv("GROQ_API_KEY", "k");
  const { GET } = await import("@/app/api/config/route");
  const ok = await (await GET()).json();
  expect(ok.aiResponses).toMatchObject({ available: true, reason: null, issue: null });
  tripQuotaBreaker(120_000, "groq", Date.now(), { kind: "rate_limit", retryAfterMs: 120_000, scope: "rpm" });
  const lim = await (await GET()).json();
  expect(lim.aiResponses.available).toBe(false);
  expect(lim.aiResponses.reason).toBe("model_quota_exhausted");
  expect(lim.aiResponses.issue.kind).toBe("rate_limit");
  expect(lim.aiResponses.issue.retryAfterMs).toBeGreaterThan(100_000);
  expect(JSON.stringify(lim)).not.toMatch(/GROQ_API_KEY|"k"/);
});
