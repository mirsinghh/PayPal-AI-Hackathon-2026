import { apiError } from "@/server/http";
import { AuthError, authConfigured, getUserFromToken, refreshSession, type AuthTokens, type AuthUser } from "./supabase";

/** httpOnly cookies hold the Supabase session. The browser JS can never read them. */
export const ACCESS_COOKIE = "ad_at";
export const REFRESH_COOKIE = "ad_rt";

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* ignore malformed cookie */
    }
  }
  return out;
}

const secure = () => (process.env.NODE_ENV === "production" ? "; Secure" : "");

export function sessionCookies(t: AuthTokens): string[] {
  return [
    `${ACCESS_COOKIE}=${encodeURIComponent(t.accessToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(60, t.expiresIn)}${secure()}`,
    // The refresh token outlives the access token; Supabase decides when it stops working.
    `${REFRESH_COOKIE}=${encodeURIComponent(t.refreshToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure()}`,
  ];
}

export function clearCookies(): string[] {
  return [ACCESS_COOKIE, REFRESH_COOKIE].map((n) => `${n}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure()}`);
}

export interface Auth {
  user: AuthUser | null;
  accessToken: string | null;
  /** Cookies to set on the response (present when the session was refreshed or has to be cleared). */
  setCookies: string[];
}

const anon = (): Auth => ({ user: null, accessToken: null, setCookies: [] });

// Short cache so a polled endpoint doesn't verify the same token with Supabase every second. Verification is still server-side.
const cache = new Map<string, { user: AuthUser; until: number }>();
const CACHE_MS = 30_000;
export function clearAuthCacheForTests() {
  cache.clear();
}

/** Who is calling? Verified with Supabase from the cookie token, refreshing it when it has expired. Never reads a user id from the client. */
export async function authFromRequest(req: Request): Promise<Auth> {
  if (!authConfigured()) return anon();
  const jar = parseCookies(req.headers.get("cookie"));
  const at = jar[ACCESS_COOKIE];
  if (at) {
    const hit = cache.get(at);
    if (hit && hit.until > Date.now()) return { user: hit.user, accessToken: at, setCookies: [] };
    const user = await getUserFromToken(at);
    if (user) {
      cache.set(at, { user, until: Date.now() + CACHE_MS });
      if (cache.size > 500) cache.clear();
      return { user, accessToken: at, setCookies: [] };
    }
  }
  const rt = jar[REFRESH_COOKIE];
  if (rt) {
    const next = await refreshSession(rt);
    if (next) return { user: next.user, accessToken: next.tokens.accessToken, setCookies: sessionCookies(next.tokens) };
    return { ...anon(), setCookies: clearCookies() };
  }
  return anon();
}

/** Adds the refreshed-session cookies (if any) to a response. */
export function withAuthCookies(res: Response, auth: Auth | null): Response {
  for (const c of auth?.setCookies ?? []) res.headers.append("set-cookie", c);
  return res;
}

/** Only the owner may see a session that has one. Anonymous sessions stay open to whoever holds the unguessable id (as before). */
export async function ownerAllowed(req: Request, ownerId: string | null | undefined): Promise<{ ok: true; auth: Auth | null } | { ok: false; res: Response }> {
  if (!ownerId) return { ok: true, auth: null };
  const auth = await authFromRequest(req);
  if (auth.user?.id === ownerId) return { ok: true, auth };
  // 404, not 403: don't confirm that someone else's session exists.
  return { ok: false, res: withAuthCookies(apiError(404, "NOT_FOUND", "We couldn't find that negotiation."), auth) };
}

export function authErrorResponse(e: unknown): Response {
  if (e instanceof AuthError) return apiError(e.status, e.code, e.message, { retryable: e.status >= 500 || e.status === 429 });
  console.error("[auth] unexpected", (e as Error).message);
  return apiError(500, "INTERNAL", "Something went wrong with your account.", { retryable: true });
}
