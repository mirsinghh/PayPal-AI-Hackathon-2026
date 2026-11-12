import { authFromRequest, withAuthCookies } from "@/server/auth/request";
import { completeAuthorization } from "@/server/autobuy/methods";

const SAFE_ID = /^pm_[A-Za-z0-9-]{1,80}$/;

/**
 * PayPal sends the buyer back here after the consent page. The record is only activated after PayPal itself confirms the
 * approval (see completeAuthorization), and only for the signed-in user who started it: the cookie is checked, the query
 * string is not trusted. The result is passed back to the brief as a plain status word.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = (process.env.APP_BASE_URL ?? url.origin).replace(/\/$/, "");
  const back = (status: string, cookies: Response | null = null) => {
    const res = new Response(null, { status: 303, headers: { location: `${base}/brief?autobuy=${status}`, "cache-control": "no-store" } });
    if (cookies) for (const c of cookies.headers.getSetCookie()) res.headers.append("set-cookie", c);
    return res;
  };

  const auth = await authFromRequest(req);
  const carrier = withAuthCookies(new Response(null), auth);
  const methodId = url.searchParams.get("m") ?? "";
  if (!auth.user) return back("login_required", carrier);
  if (!SAFE_ID.test(methodId)) return back("error", carrier);
  const result = await completeAuthorization(auth.user.id, methodId, url.searchParams.get("cancelled") === "1");
  if (result.ok) return back("ready", carrier);
  return back(result.reason === "cancelled" ? "cancelled" : result.reason === "not_approved" ? "not_approved" : "error", carrier);
}
