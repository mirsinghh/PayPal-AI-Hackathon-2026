import { apiError } from "@/server/http";
import { authFromRequest, withAuthCookies } from "@/server/auth/request";
import { listMandatesByOwner } from "@/server/db/store";
import { toPublicMandate } from "@/server/autobuy/mandate";

/** The signed-in user's own mandates (newest first), for My Activity. The owner id comes from the verified cookie only. */
export async function GET(req: Request) {
  const auth = await authFromRequest(req);
  if (!auth.user) return withAuthCookies(apiError(401, "LOGIN_REQUIRED", "Sign in to see your authorisations."), auth);
  try {
    const all = await listMandatesByOwner(auth.user.id);
    const mandates = all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toPublicMandate);
    return withAuthCookies(Response.json({ mandates }, { headers: { "cache-control": "no-store" } }), auth);
  } catch (e) {
    console.error("[autobuy] list failed", (e as Error).message);
    // Most likely the Auto-Buy tables from supabase/schema.sql are not there yet.
    return withAuthCookies(apiError(502, "MANDATES_UNAVAILABLE", "We could not load your authorisations. Has the Supabase schema been applied?", { retryable: true }), auth);
  }
}
