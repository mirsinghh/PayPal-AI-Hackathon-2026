import { connection } from "next/server";
import { authFromRequest, withAuthCookies } from "@/server/auth/request";
import { authConfigured } from "@/server/auth/supabase";

/** Who is signed in, verified with Supabase from the httpOnly cookie (refreshing it if needed). Also keeps the session alive. */
export async function GET(req: Request) {
  // Read per request (never prerendered): the answer depends on runtime env and on the caller's cookies.
  await connection();
  const auth = await authFromRequest(req);
  return withAuthCookies(
    Response.json({ available: authConfigured(), user: auth.user ? { id: auth.user.id, email: auth.user.email, createdAt: auth.user.createdAt } : null }, { headers: { "cache-control": "no-store" } }),
    auth,
  );
}
