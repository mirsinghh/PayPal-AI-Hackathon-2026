import { apiError, rateLimited, readJsonBody } from "@/server/http";
import { parseIntent } from "@/server/negotiation/intent";
import { after } from "next/server";
import { startNegotiation } from "@/server/negotiation/service";
import { ScenarioError } from "@/server/negotiation/validator";
import { saveSession } from "@/server/db/store";
import { authFromRequest, withAuthCookies } from "@/server/auth/request";
import { RESPONSE_MODES, type ResponseMode } from "@/shared/contracts/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (rateLimited(req, "negotiations", 10)) {
    return apiError(429, "RATE_LIMITED", "Too many attempts. Try again shortly.", { retryable: true });
  }
  const body = await readJsonBody(req);
  if (body === undefined) return apiError(400, "INVALID_INTENT", "Check your product and budget.");

  const parsed = parseIntent(body);
  if (!parsed.ok) {
    return apiError(400, "INVALID_INTENT", "Check your product and budget.", { fieldErrors: parsed.fieldErrors });
  }

  // The response mode is validated here, on the server, and recorded on the session: the UI state is never trusted.
  const rawMode = (body as { responseMode?: unknown }).responseMode;
  if (rawMode !== undefined && !RESPONSE_MODES.includes(rawMode as ResponseMode)) {
    return apiError(400, "INVALID_RESPONSE_MODE", "Choose Server Responses or AI Responses.", { fieldErrors: { responseMode: "Use \"server\" or \"ai\"." } });
  }
  const responseMode = rawMode as ResponseMode | undefined;

  try {
    // The owner comes only from the verified Supabase cookie, never from the request body.
    const auth = await authFromRequest(req);
    const { session, run } = await startNegotiation(parsed.intent, { responseMode, ownerId: auth.user?.id ?? null });
    await saveSession(session);
    // Live multi-agent runs continue after the response; the page polls the persisted events.
    if (run) after(run);
    return withAuthCookies(Response.json(
      {
        sessionId: session.sessionId,
        status: session.status,
        intent: session.intent,
        offers: session.offers,
        events: session.events,
        evaluation: session.evaluation,
        aiStatus: session.aiStatus,
        mode: session.mode,
        responseMode: session.responseMode ?? null,
        fallbackReason: session.fallbackReason ?? null,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      },
      { status: 201 },
    ), auth);
  } catch (e) {
    if (e instanceof ScenarioError) {
      return apiError(422, "SCENARIO_UNAVAILABLE", "We couldn't prepare a consistent demo scenario.", {
        retryable: true,
      });
    }
    console.error("[negotiations] unexpected", (e as Error).message);
    return apiError(500, "INTERNAL", "Something went wrong preparing your negotiation.", { retryable: true });
  }
}
