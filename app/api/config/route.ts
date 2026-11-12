import { connection } from "next/server";
import { multiAgentEnabled, quotaBreakerOpen } from "@/server/agents/config";
import { publicEngineStatus } from "@/server/ai/provider";
import { authConfigured } from "@/server/auth/supabase";

/** Public, non-secret runtime mode so the UI can describe what is real. Read per request, never baked at build time. */
export async function GET() {
  await connection();
  const e = publicEngineStatus();
  // AI Responses is offered only when the negotiation provider has credentials and is not rate-limited right now.
  const aiUnavailable = e.provider === "rules" ? "provider_rules" : !e.ready ? "no_api_key" : quotaBreakerOpen(e.provider) ? "model_quota_exhausted" : null;
  return Response.json({
    multiAgent: multiAgentEnabled(),
    provider: e.provider,
    models: { buyer: e.buyerModel, seller: e.sellerModel },
    analysisProvider: e.analysisProvider,
    aiResponses: { available: aiUnavailable === null, provider: e.provider, reason: aiUnavailable },
    accounts: authConfigured(),
  });
}
