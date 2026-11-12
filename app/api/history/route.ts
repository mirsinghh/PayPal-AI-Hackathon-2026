import { apiError } from "@/server/http";
import { authFromRequest, withAuthCookies } from "@/server/auth/request";
import { authConfigured } from "@/server/auth/supabase";
import { loadHistory } from "@/server/db/history";

/** The signed-in user's requests, analyses, negotiations and payments. The user id comes from the verified session only. */
export async function GET(req: Request) {
  if (!authConfigured()) return apiError(503, "AUTH_UNAVAILABLE", "Accounts are not available in this deployment.");
  const auth = await authFromRequest(req);
  if (!auth.user || !auth.accessToken) return withAuthCookies(apiError(401, "UNAUTHENTICATED", "Sign in to see your history."), auth);
  try {
    const history = await loadHistory(auth.user.id, auth.accessToken);
    return withAuthCookies(
      Response.json({ user: { id: auth.user.id, email: auth.user.email, createdAt: auth.user.createdAt }, ...history }, { headers: { "cache-control": "no-store" } }),
      auth,
    );
  } catch (e) {
    console.error("[history] failed", (e as Error).message);
    return withAuthCookies(apiError(502, "HISTORY_UNAVAILABLE", "We could not load your history. Has the Supabase schema been applied?", { retryable: true }), auth);
  }
}
