import { connection } from "next/server";
import { authFromRequest, withAuthCookies } from "@/server/auth/request";
import { authConfigured } from "@/server/auth/supabase";
import { BLOCKER_TEXT, autoBuyCapability } from "@/server/autobuy/capability";
import { getActiveMethod, toPublicMethod } from "@/server/autobuy/methods";

/**
 * Can this user use Agent Auto-Buy right now? Everything is read from the server: whether PayPal Vault is really enabled
 * for this Sandbox app (checked against PayPal), whether the user is signed in, and whether they already authorised PayPal.
 * The UI shows Auto-Buy as available only when `available` is true.
 */
export async function GET(req: Request) {
  await connection();
  const auth = await authFromRequest(req);
  const cap = await autoBuyCapability();
  let method = null;
  if (auth.user && cap.available) {
    try {
      const m = await getActiveMethod(auth.user.id);
      method = m ? toPublicMethod(m) : null;
    } catch {
      method = null;
    }
  }
  return withAuthCookies(
    Response.json(
      {
        accounts: authConfigured(),
        signedIn: !!auth.user,
        available: cap.available,
        blocker: cap.blocker,
        reason: cap.blocker ? BLOCKER_TEXT[cap.blocker] : null,
        paymentMethod: method,
        checkedAt: cap.checkedAt,
      },
      { headers: { "cache-control": "no-store" } },
    ),
    auth,
  );
}
