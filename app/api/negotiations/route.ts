import { apiError, rateLimited, readJsonBody } from "@/server/http";
import { parseIntent } from "@/server/negotiation/intent";
import { after } from "next/server";
import { startNegotiation } from "@/server/negotiation/service";
import { ScenarioError } from "@/server/negotiation/validator";
import { saveMandate, saveSession } from "@/server/db/store";
import { authFromRequest, withAuthCookies } from "@/server/auth/request";
import { CHECKOUT_MODES, MANDATE_AUTHORIZATION_TEXT, RESPONSE_MODES, type CheckoutMode, type ResponseMode } from "@/shared/contracts/types";
import { getActiveMethod, vaultTokenFor } from "@/server/autobuy/methods";
import { MandateError, buildMandate } from "@/server/autobuy/mandate";

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

  // V5 Auto-Buy: the checkout mode is validated here and fixed for the session. Absent = "manual", exactly as before.
  const rawCheckout = (body as { checkoutMode?: unknown }).checkoutMode;
  if (rawCheckout !== undefined && !CHECKOUT_MODES.includes(rawCheckout as CheckoutMode)) {
    return apiError(400, "INVALID_CHECKOUT_MODE", "Choose Manual Checkout or Agent Auto-Buy.");
  }
  const checkoutMode: CheckoutMode = (rawCheckout as CheckoutMode | undefined) ?? "manual";

  try {
    // The owner comes only from the verified Supabase cookie, never from the request body.
    const auth = await authFromRequest(req);

    // Auto-Buy preconditions are all checked BEFORE the negotiation starts, so a refused request never spends AI quota.
    let autoBuy: { ownerId: string; method: NonNullable<Awaited<ReturnType<typeof getActiveMethod>>>; text: string } | null = null;
    if (checkoutMode === "auto_buy") {
      if (!auth.user) return withAuthCookies(apiError(401, "LOGIN_REQUIRED", "Sign in to use Agent Auto-Buy."), auth);
      const text = (body as { authorization?: { text?: unknown } }).authorization?.text;
      if (text !== MANDATE_AUTHORIZATION_TEXT) {
        return withAuthCookies(apiError(400, "CONSENT_REQUIRED", "Confirm the authorisation to turn on Agent Auto-Buy."), auth);
      }
      const method = await getActiveMethod(auth.user.id);
      if (!method || !(await vaultTokenFor(auth.user.id, method.methodId))) {
        return withAuthCookies(apiError(409, "PAYMENT_METHOD_REQUIRED", "Authorise a PayPal payment method for Agent D first."), auth);
      }
      autoBuy = { ownerId: auth.user.id, method, text };
    }

    const { session, run } = await startNegotiation(parsed.intent, { responseMode, ownerId: auth.user?.id ?? null });
    if (autoBuy) {
      // The mandate is derived by the server from the negotiation's own intent: the client cannot widen it.
      const mandate = buildMandate({ session, ownerId: autoBuy.ownerId, method: autoBuy.method, authorizationText: autoBuy.text });
      session.checkoutMode = "auto_buy";
      session.mandateId = mandate.mandateId;
      await saveMandate(mandate);
    }
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
        checkoutMode: session.checkoutMode ?? "manual",
        mandateId: session.mandateId ?? null,
        fallbackReason: session.fallbackReason ?? null,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      },
      { status: 201 },
    ), auth);
  } catch (e) {
    if (e instanceof MandateError) return apiError(e.status, e.code, e.message);
    // Vercel without Supabase: say what is missing instead of a generic failure (see AgentD_DOCS/V5/VERCEL_DEPLOYMENT.md).
    if (/^storage_not_configured/.test((e as Error).message)) return apiError(503, "STORAGE_NOT_CONFIGURED", "This deployment has no database configured yet.");
    if (e instanceof ScenarioError) {
      return apiError(422, "SCENARIO_UNAVAILABLE", "We couldn't prepare a consistent demo scenario.", {
        retryable: true,
      });
    }
    console.error("[negotiations] unexpected", (e as Error).message);
    return apiError(500, "INTERNAL", "Something went wrong preparing your negotiation.", { retryable: true });
  }
}
