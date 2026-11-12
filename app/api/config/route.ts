import { connection } from "next/server";
import { multiAgentEnabled, quotaBreakerInfo } from "@/server/agents/config";
import { breakerIssue, breakerReason } from "@/server/ai/limits";
import { publicEngineStatus } from "@/server/ai/provider";
import { authConfigured } from "@/server/auth/supabase";

/** Public, non-secret runtime mode so the UI can describe what is real. Read per request, never baked at build time. */
export async function GET() {
  await connection();
  const e = publicEngineStatus();
  // AI Agents is offered only when the negotiation provider has credentials and is not limited, unavailable or rejecting our key right now.
  const breaker = e.provider === "rules" || !e.ready ? null : quotaBreakerInfo(e.provider);
  const issue = breaker ? breakerIssue(breaker) : null;
  const aiUnavailable = e.provider === "rules" ? "provider_rules" : !e.ready ? "no_api_key" : breaker ? breakerReason(issue) : null;
  return Response.json({
    multiAgent: multiAgentEnabled(),
    provider: e.provider,
    models: { buyer: e.buyerModel, seller: e.sellerModel },
    analysisProvider: e.analysisProvider,
    // `issue.retryAfterMs` is present only when the provider itself reported when the limit resets.
    aiResponses: { available: aiUnavailable === null, provider: e.provider, reason: aiUnavailable, issue },
    accounts: authConfigured(),
  });
}
