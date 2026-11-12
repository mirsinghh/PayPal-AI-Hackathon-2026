import { z } from "zod";
import { apiError, rateLimited, readJsonBody } from "@/server/http";
import { sessionCookies, authErrorResponse, withAuthCookies } from "@/server/auth/request";
import { signUp } from "@/server/auth/supabase";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email.").max(254),
  password: z.string().min(8, "Use at least 8 characters.").max(72, "Use at most 72 characters."),
});

export async function POST(req: Request) {
  if (rateLimited(req, "auth", 10)) return apiError(429, "RATE_LIMITED", "Too many attempts. Try again shortly.", { retryable: true });
  const parsed = credentialsSchema.safeParse(await readJsonBody(req));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0] ?? "form")] ??= i.message;
    return apiError(400, "INVALID_CREDENTIALS_FORMAT", "Check your email and password.", { fieldErrors });
  }
  try {
    const { user, tokens } = await signUp(parsed.data.email, parsed.data.password);
    const res = Response.json({ user: { id: user.id, email: user.email }, signedIn: tokens !== null, needsEmailConfirmation: tokens === null }, { status: 201 });
    return withAuthCookies(res, { user, accessToken: tokens?.accessToken ?? null, setCookies: tokens ? sessionCookies(tokens) : [] });
  } catch (e) {
    return authErrorResponse(e);
  }
}
