import { apiError } from "@/server/http";
import { authFromRequest, withAuthCookies } from "@/server/auth/request";
import { MandateError, loadOwnedMandate, toPublicMandate } from "@/server/autobuy/mandate";
import { getPaymentsBySession } from "@/server/db/store";
import { toPublic } from "@/server/paypal/payments";

/** One of the caller's mandates with its evidence trail and (if any) the payment it produced. Someone else's id is a 404. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await authFromRequest(req);
  if (!auth.user) return withAuthCookies(apiError(401, "LOGIN_REQUIRED", "Sign in first."), auth);
  try {
    const m = await loadOwnedMandate(auth.user.id, id);
    const attempt = (await getPaymentsBySession(m.sessionId)).find((p) => p.mandateId === m.mandateId);
    return withAuthCookies(Response.json({ mandate: toPublicMandate(m), payment: attempt ? toPublic(attempt) : null }, { headers: { "cache-control": "no-store" } }), auth);
  } catch (e) {
    if (e instanceof MandateError) return withAuthCookies(apiError(e.status, e.code, e.message), auth);
    return withAuthCookies(apiError(500, "INTERNAL", "Something went wrong.", { retryable: true }), auth);
  }
}
