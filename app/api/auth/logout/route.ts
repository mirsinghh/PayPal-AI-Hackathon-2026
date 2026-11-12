import { ACCESS_COOKIE, clearCookies, parseCookies } from "@/server/auth/request";
import { signOut } from "@/server/auth/supabase";

export async function POST(req: Request) {
  const at = parseCookies(req.headers.get("cookie"))[ACCESS_COOKIE];
  if (at) await signOut(at);
  const res = Response.json({ ok: true });
  for (const c of clearCookies()) res.headers.append("set-cookie", c);
  return res;
}
