import { geminiCaller, type LlmCaller } from "@/server/ai/explain";
import { geminiModelCaller, type ModelCaller } from "@/server/agents/model";
import { WIRE, groqConfig, groqModelCaller } from "@/server/ai/groq";

/**
 * Which AI provider runs the agents. Chosen by configuration only: no UI component or commercial service knows it.
 *   AI_PROVIDER=groq    Agent D on GPT-OSS 120B, the four sellers on GPT-OSS 20B (models configurable)
 *   AI_PROVIDER=gemini  the original engine (default when AI_PROVIDER is unset, so existing setups keep working)
 *   AI_PROVIDER=rules   no model API at all: the deterministic engine
 * There is NO automatic switch between providers: a quota problem on one never spends another provider's quota.
 */
export type AIProvider = "groq" | "gemini" | "rules";
export const AI_PROVIDERS: readonly AIProvider[] = ["groq", "gemini", "rules"];

export interface AgentModelConfig {
  provider: AIProvider;
  model: string | null;
  role: "buyer" | "seller" | "explanation";
}

type Env = Record<string, string | undefined>;

const parseProvider = (v: string | undefined): AIProvider | null => {
  const x = v?.trim().toLowerCase();
  return x === "groq" || x === "rules" || x === "gemini" ? x : null;
};

/** The global default provider (AI_PROVIDER). Both roles below fall back to it, so existing setups keep working. */
export function activeProvider(env: Env = process.env): AIProvider {
  return parseProvider(env.AI_PROVIDER) ?? "gemini";
}

/** Provider of the request analysis (the explanation of the server-chosen winner). Independent of the response mode. */
export function analysisProvider(env: Env = process.env): AIProvider {
  return parseProvider(env.ANALYSIS_PROVIDER) ?? activeProvider(env);
}

/** Provider of the AI negotiation replies (only used when the user picks "AI Responses"). */
export function negotiationProvider(env: Env = process.env): AIProvider {
  return parseProvider(env.NEGOTIATION_PROVIDER) ?? activeProvider(env);
}

export interface Engine {
  provider: AIProvider;
  /** Role-aware caller for the multi-agent engine; null when the provider has no usable credentials (or is "rules"). */
  caller: ModelCaller | null;
  agents: AgentModelConfig[];
  /** Why there is no caller (recorded as the session's fallback reason). */
  unavailable: "no_api_key" | "provider_rules" | null;
}

/** The engine that writes AI negotiation replies. It never touches the analysis provider. */
export function resolveEngine(env: Env = process.env): Engine {
  const provider = negotiationProvider(env);
  if (provider === "rules") return { provider, caller: null, agents: [], unavailable: "provider_rules" };
  if (provider === "groq") {
    const cfg = groqConfig(env);
    const caller = groqModelCaller({ env });
    return {
      provider,
      caller,
      agents: [
        { provider, model: cfg.buyerModel, role: "buyer" },
        { provider, model: cfg.sellerModel, role: "seller" },
        { provider, model: cfg.explanationModel, role: "explanation" },
      ],
      unavailable: caller ? null : "no_api_key",
    };
  }
  const caller = geminiModelCaller(env);
  const model = env.AI_MODEL || "gemini-3.5-flash";
  return {
    provider,
    caller,
    agents: (["buyer", "seller", "explanation"] as const).map((role) => ({ provider, model, role })),
    unavailable: caller ? null : "no_api_key",
  };
}

/** Explanation of a V0 (rule-based negotiation) recommendation, on the configured provider's explanation model. */
export function explanationCaller(env: Env = process.env): LlmCaller | null {
  const provider = analysisProvider(env);
  if (provider === "rules") return null;
  if (provider === "gemini") return geminiCaller();
  const call = groqModelCaller({ env });
  if (!call) return null;
  return async (system, user) => {
    const r = await call({ system, history: [], user, maxOutputTokens: 800, role: "explanation", wire: WIRE.explanation });
    return { text: r.text, model: r.model, provider: r.provider };
  };
}

/** Public, non-secret description of the configured engine (for /api/config and the technical summary). */
export function publicEngineStatus(env: Env = process.env) {
  const e = resolveEngine(env);
  const m = (role: AgentModelConfig["role"]) => e.agents.find((a) => a.role === role)?.model ?? null;
  return {
    provider: e.provider,
    ready: e.caller !== null,
    buyerModel: m("buyer"),
    sellerModel: m("seller"),
    explanationModel: m("explanation"),
    analysisProvider: analysisProvider(env),
  };
}
