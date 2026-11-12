import { apiError, rateLimited, readJsonBody } from "@/server/http";
import { parseIntent } from "@/server/negotiation/intent";
import { after } from "next/server";
import { startNegotiation } from "@/server/negotiation/service";
import { ScenarioError } from "@/server/negotiation/validator";
import { saveSession } from "@/server/db/store";

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

  try {
    const { session, run } = await startNegotiation(parsed.intent);
    await saveSession(session);
    // Live multi-agent runs continue after the response; the page polls the persisted events.
    if (run) after(run);
    return Response.json(
      {
        sessionId: session.sessionId,
        status: session.status,
        intent: session.intent,
        offers: session.offers,
        events: session.events,
        evaluation: session.evaluation,
        aiStatus: session.aiStatus,
        mode: session.mode,
        fallbackReason: session.fallbackReason ?? null,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      },
      { status: 201 },
    );
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
