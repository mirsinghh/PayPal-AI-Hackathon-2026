import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "agentd-mode-"));

import { resetRunSlotsForTests } from "@/server/agents/config";
import type { ModelCaller } from "@/server/agents/model";
import type { LlmCaller } from "@/server/ai/explain";
import { analysisProvider, explanationCaller, negotiationProvider, publicEngineStatus, resolveEngine } from "@/server/ai/provider";
import { startNegotiation } from "@/server/negotiation/service";
import { getSession } from "@/server/db/store";
import { POST as createNegotiation } from "@/app/api/negotiations/route";
import type { ProductIntent } from "@/shared/contracts/types";

const intent: ProductIntent = { productQuery: "Wireless noise-cancelling headphones", budgetCents: 35_000, currency: "EUR", priority: "best_value", preferences: [], language: "en" };

/** A negotiation model that must never be called in Server mode. */
function spyModel() {
  const calls: unknown[] = [];
  const caller: ModelCaller = async (req) => {
    calls.push(req);
    throw new Error("negotiation model was called");
  };
  return { caller, calls };
}
function spyExplain() {
  const calls: string[] = [];
  const caller: LlmCaller = async (system) => {
    calls.push(system);
    throw new Error("analysis unavailable"); // forces the labelled rules fallback after the call is counted
  };
  return { caller, calls };
}

beforeEach(() => resetRunSlotsForTests());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Server Responses", () => {
  it("never calls a negotiation model, even when AI is globally enabled", async () => {
    vi.stubEnv("MULTI_AGENT_NEGOTIATION", "true");
    const model = spyModel();
    const { session, run } = await startNegotiation(intent, { caller: model.caller, responseMode: "server", explainCaller: null });
    expect(run).toBeNull();
    expect(model.calls).toHaveLength(0);
    expect(session.mode).toBe("v0_rules");
    expect(session.responseMode).toBe("server");
    expect(session.fallbackReason).toBeNull();
    expect(session.offers.length).toBeGreaterThan(0);
    // Rule-based commercial logic: every recorded event is deterministic (no AI source).
    expect(session.events.some((e) => e.payload.source === "gemini" || e.payload.source === "groq")).toBe(false);
  });

  it("makes zero HTTP calls when the analysis provider is rules, even with a Groq negotiation provider configured", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubEnv("NEGOTIATION_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "gsk_test_not_real");
    vi.stubEnv("ANALYSIS_PROVIDER", "rules");
    const { session } = await startNegotiation(intent, { responseMode: "server" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(session.evaluation.source).toBe("rules_fallback");
  });

  it("keeps the deterministic seller rules: prices stay inside policy and the pick is eligible", async () => {
    const { session } = await startNegotiation(intent, { responseMode: "server", explainCaller: null });
    const winner = session.offers.find((o) => o.offerId === session.recommendedOfferId)!;
    expect(winner.eligible).toBe(true);
    for (const o of session.offers) {
      expect(o.finalPriceCents).toBeGreaterThanOrEqual(o.minPriceCents);
      expect(o.finalPriceCents).toBeLessThanOrEqual(o.initialPriceCents);
    }
  });
});

describe("AI Responses", () => {
  it("is the user's opt-in: it starts a live run without the global MULTI_AGENT_NEGOTIATION flag", async () => {
    vi.stubEnv("MULTI_AGENT_NEGOTIATION", "false");
    const model = spyModel();
    const { session, run } = await startNegotiation(intent, { caller: model.caller, responseMode: "ai" });
    expect(run).toBeTypeOf("function");
    expect(session.mode).toBe("multi_agent");
    expect(session.responseMode).toBe("ai");
    expect(session.status).toBe("negotiating");
    expect(model.calls).toHaveLength(0); // nothing is called until the run executes
  });

  it("falls back to server rules with a recorded reason, and never pretends to be AI", async () => {
    vi.stubEnv("AI_PROVIDER", "rules");
    const { session, run } = await startNegotiation(intent, { responseMode: "ai", explainCaller: null });
    expect(run).toBeNull();
    expect(session.responseMode).toBe("ai"); // what the user asked for
    expect(session.mode).toBe("v0_rules"); // what actually ran
    expect(session.fallbackReason).toBe("provider_rules");
    expect(session.events.some((e) => e.payload.source === "gemini" || e.payload.source === "groq")).toBe(false);
  });

  it("reports missing credentials as a fallback reason", async () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "");
    const { session } = await startNegotiation(intent, { responseMode: "ai", explainCaller: null });
    expect(session.mode).toBe("v0_rules");
    expect(session.fallbackReason).toBe("no_api_key");
  });

  it("legacy callers without a mode keep the old flag behaviour", async () => {
    vi.stubEnv("MULTI_AGENT_NEGOTIATION", "false");
    const a = await startNegotiation(intent, { caller: spyModel().caller, explainCaller: null });
    expect(a.run).toBeNull();
    expect(a.session.responseMode).toBe("server");
    vi.stubEnv("MULTI_AGENT_NEGOTIATION", "true");
    const b = await startNegotiation(intent, { caller: spyModel().caller, explainCaller: null });
    expect(b.run).toBeTypeOf("function");
    expect(b.session.responseMode).toBe("ai");
  });
});

describe("analysis is independent of the response mode", () => {
  it("uses its own provider, which the negotiation provider never changes", () => {
    const env = { AI_PROVIDER: "gemini", NEGOTIATION_PROVIDER: "groq", GROQ_API_KEY: "k", AI_API_KEY: "g" };
    expect(analysisProvider(env)).toBe("gemini");
    expect(negotiationProvider(env)).toBe("groq");
    expect(resolveEngine(env).provider).toBe("groq");
    expect(publicEngineStatus(env).analysisProvider).toBe("gemini");
    const env2 = { AI_PROVIDER: "groq", ANALYSIS_PROVIDER: "rules", GROQ_API_KEY: "k" };
    expect(explanationCaller(env2)).toBeNull();
    expect(negotiationProvider(env2)).toBe("groq");
  });

  it("defaults both roles to AI_PROVIDER, so existing configuration is unchanged", () => {
    expect(analysisProvider({ AI_PROVIDER: "groq" })).toBe("groq");
    expect(negotiationProvider({ AI_PROVIDER: "groq" })).toBe("groq");
    expect(analysisProvider({})).toBe("gemini");
    expect(negotiationProvider({ AI_PROVIDER: "nonsense" })).toBe("gemini");
  });

  it("calls the analysis caller the same way in both modes (server and AI-with-fallback)", async () => {
    vi.stubEnv("AI_PROVIDER", "rules"); // makes AI mode fall back to the rules run, still analysed once
    const a = spyExplain();
    const b = spyExplain();
    const s1 = await startNegotiation(intent, { responseMode: "server", explainCaller: a.caller });
    const s2 = await startNegotiation(intent, { responseMode: "ai", explainCaller: b.caller });
    expect(a.calls.length).toBeGreaterThan(0);
    expect(b.calls.length).toBe(a.calls.length);
    expect(a.calls[0]).toBe(b.calls[0]); // identical analysis prompt
    expect(s1.session.evaluation.source).toBe(s2.session.evaluation.source);
  });
});

describe("POST /api/negotiations validates and records the mode", () => {
  const post = (body: unknown) =>
    createNegotiation(new Request("http://localhost/api/negotiations", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` } }));

  it("rejects an unknown mode", async () => {
    const res = await post({ ...intent, responseMode: "turbo" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_RESPONSE_MODE");
  });

  it("stores the mode chosen on the server and returns it", async () => {
    vi.stubEnv("AI_PROVIDER", "rules");
    const res = await post({ ...intent, responseMode: "server" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.responseMode).toBe("server");
    expect(body.mode).toBe("v0_rules");
    expect((await getSession(body.sessionId))?.responseMode).toBe("server");
  });

  it("an AI request that cannot run is stored as a labelled fallback", async () => {
    vi.stubEnv("AI_PROVIDER", "rules");
    const body = await (await post({ ...intent, responseMode: "ai" })).json();
    expect(body.responseMode).toBe("ai");
    expect(body.mode).toBe("v0_rules");
    expect(body.fallbackReason).toBe("provider_rules");
  });
});
