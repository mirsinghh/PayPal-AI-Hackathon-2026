import { z } from "zod";
import { apiError, rateLimited, readJsonBody } from "@/server/http";
import { authFromRequest, withAuthCookies } from "@/server/auth/request";
import { AutoBuyError, executeAutoBuy } from "@/server/autobuy/execute";
import { PaymentError } from "@/server/paypal/payments";

const bodySchema = z.object({ sessionId: z.string().min(1).max(100) });

/**
 * Runs (or idempotently resumes) the one purchase a mandate allows. It carries NO amount, offer or mandate id: the server
 * takes everything from the stored negotiation and the mandate owned by the verified caller.
 */
export async function POST(req: Request) {
  if (rateLimited(req, "autobuy-execute", 20)) return apiError(429, "RATE_LIMITED", "Too many attempts. Try again shortly.", { retryable: true });
  const body = bodySchema.safeParse(await readJsonBody(req));
  if (!body.success) return apiError(400, "INVALID_REQUEST", "Missing negotiation.");
  const auth = await authFromRequest(req);
  if (!auth.user) return withAuthCookies(apiError(401, "LOGIN_REQUIRED", "Sign in to continue."), auth);
  try {
    const result = await executeAutoBuy({ sessionId: body.data.sessionId, ownerId: auth.user.id });
    return withAuthCookies(Response.json(result, { headers: { "cache-control": "no-store" } }), auth);
  } catch (e) {
    if (e instanceof AutoBuyError || e instanceof PaymentError) return withAuthCookies(apiError(e.status, e.code, e.message, { retryable: e instanceof PaymentError && e.retryable }), auth);
    console.error("[autobuy] unexpected", (e as Error).message);
    return withAuthCookies(apiError(500, "INTERNAL", "Something went wrong with Agent Auto-Buy.", { retryable: true }), auth);
  }
}
