import { apiError } from "@/server/http";
import { authFromRequest, withAuthCookies } from "@/server/auth/request";
import { MandateError, cancelMandate, toPublicMandate } from "@/server/autobuy/mandate";
import { withLock } from "@/server/db/store";

/** Cancels a mandate that has not been executed. Once Agent D has started paying it is too late, and the answer says so. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await authFromRequest(req);
  if (!auth.user) return withAuthCookies(apiError(401, "LOGIN_REQUIRED", "Sign in first."), auth);
  try {
    const m = await withLock(`mandate:${id}`, () => cancelMandate(auth.user!.id, id));
    return withAuthCookies(Response.json({ mandate: toPublicMandate(m) }), auth);
  } catch (e) {
    if (e instanceof MandateError) return withAuthCookies(apiError(e.status, e.code, e.message), auth);
    return withAuthCookies(apiError(500, "INTERNAL", "Something went wrong.", { retryable: true }), auth);
  }
}
