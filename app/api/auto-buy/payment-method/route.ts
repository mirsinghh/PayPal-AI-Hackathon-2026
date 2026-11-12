import { apiError, rateLimited } from "@/server/http";
import { authErrorResponse, authFromRequest, withAuthCookies } from "@/server/auth/request";
import { MethodError, getActiveMethod, revokeAuthorization, startAuthorization } from "@/server/autobuy/methods";

/** Starts PayPal's official "save this payment method" flow. Signed-in users only; the buyer consents on PayPal's own page. */
export async function POST(req: Request) {
  if (rateLimited(req, "autobuy-method", 10)) return apiError(429, "RATE_LIMITED", "Too many attempts. Try again shortly.", { retryable: true });
  try {
    const auth = await authFromRequest(req);
    if (!auth.user) return withAuthCookies(apiError(401, "LOGIN_REQUIRED", "Sign in to authorise PayPal for Agent Auto-Buy."), auth);
    const existing = await getActiveMethod(auth.user.id);
    if (existing) return withAuthCookies(Response.json({ alreadyAuthorized: true, methodId: existing.methodId }), auth);
    const { method, approveUrl } = await startAuthorization(auth.user.id);
    return withAuthCookies(Response.json({ alreadyAuthorized: false, methodId: method.methodId, approveUrl }, { status: 201 }), auth);
  } catch (e) {
    if (e instanceof MethodError) return apiError(e.status, e.code, e.message, { retryable: e.status >= 500 && e.code !== "VAULT_NOT_ENABLED" });
    return authErrorResponse(e);
  }
}

/** Revokes the user's PayPal authorisation (on PayPal too) and cancels their unexecuted mandates. */
export async function DELETE(req: Request) {
  try {
    const auth = await authFromRequest(req);
    if (!auth.user) return withAuthCookies(apiError(401, "LOGIN_REQUIRED", "Sign in first."), auth);
    const existing = await getActiveMethod(auth.user.id);
    if (!existing) return withAuthCookies(Response.json({ revoked: true, mandatesCancelled: 0 }), auth);
    return withAuthCookies(Response.json(await revokeAuthorization(auth.user.id, existing.methodId)), auth);
  } catch (e) {
    if (e instanceof MethodError) return apiError(e.status, e.code, e.message, { retryable: e.status >= 500 });
    return authErrorResponse(e);
  }
}
