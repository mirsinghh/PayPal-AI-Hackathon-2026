import { apiError, rateLimited, readJsonBody } from "@/server/http";
import { sessionCookies, authErrorResponse, withAuthCookies } from "@/server/auth/request";
import { signIn } from "@/server/auth/supabase";
import { z } from "zod";

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(72) });

export async function POST(req: Request) {
  if (rateLimited(req, "auth", 10)) return apiError(429, "RATE_LIMITED", "Too many attempts. Try again shortly.", { retryable: true });
  const parsed = schema.safeParse(await readJsonBody(req));
  if (!parsed.success) return apiError(400, "INVALID_CREDENTIALS_FORMAT", "Enter your email and password.");
  try {
    const { user, tokens } = await signIn(parsed.data.email, parsed.data.password);
    const res = Response.json({ user: { id: user.id, email: user.email } });
    return withAuthCookies(res, { user, accessToken: tokens.accessToken, setCookies: sessionCookies(tokens) });
  } catch (e) {
    return authErrorResponse(e);
  }
}
