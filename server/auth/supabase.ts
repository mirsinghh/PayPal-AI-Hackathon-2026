/**
 * Supabase Auth (GoTrue) over its REST API. No SDK, no browser key: the browser never talks to Supabase.
 * Passwords go straight to Supabase over HTTPS and are never stored, logged or hashed by this app.
 *
 * Keys (all server-side env vars):
 *  - SUPABASE_URL                 project URL
 *  - SUPABASE_ANON_KEY            the project's public (anon / publishable) key: used for Auth and for RLS-scoped reads
 *  - SUPABASE_SERVICE_ROLE_KEY    secret key: used only by server/db/store.ts to write rows (never exposed)
 */
export interface AuthUser {
  id: string;
  email: string;
  createdAt: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
}

export class AuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type Env = Record<string, string | undefined>;
type Fetch = typeof fetch;

const real = (v: string | undefined) => !!v && !/^your-/i.test(v) && v.trim().length > 0;

/** Accounts are available only when URL, anon key and service key are all configured. */
export function authConfigured(env: Env = process.env): boolean {
  return real(env.SUPABASE_URL) && real(env.SUPABASE_ANON_KEY) && real(env.SUPABASE_SERVICE_ROLE_KEY);
}

function endpoint(env: Env, path: string) {
  const url = env.SUPABASE_URL;
  const anon = env.SUPABASE_ANON_KEY;
  if (!authConfigured(env) || !url || !anon) throw new AuthError(503, "AUTH_UNAVAILABLE", "Accounts are not available in this deployment.");
  return { url: url.replace(/\/$/, "") + path, anon };
}

interface RawUser {
  id?: string;
  email?: string;
  created_at?: string;
}
interface RawSession {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: RawUser;
}

const toUser = (u: RawUser | undefined): AuthUser | null => (u?.id && u.email ? { id: u.id, email: u.email, createdAt: u.created_at ?? null } : null);
const toTokens = (s: RawSession): AuthTokens | null =>
  s.access_token && s.refresh_token ? { accessToken: s.access_token, refreshToken: s.refresh_token, expiresIn: s.expires_in ?? 3600 } : null;

async function call(env: Env, f: Fetch, path: string, init: { method?: string; body?: string; bearer?: string }): Promise<{ status: number; body: Record<string, unknown> }> {
  const { url, anon } = endpoint(env, path);
  let res: Response;
  try {
    res = await f(url, {
      method: init.method ?? "POST",
      headers: { apikey: anon, "content-type": "application/json", ...(init.bearer ? { authorization: `Bearer ${init.bearer}` } : {}) },
      body: init.body,
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    throw new AuthError(503, "AUTH_UNREACHABLE", "We couldn't reach the account service. Try again.");
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

/** Friendly, non-leaking messages mapped from Supabase's error codes. */
function failure(status: number, body: Record<string, unknown>): AuthError {
  const code = String(body.error_code ?? body.code ?? body.error ?? "");
  if (status === 429 || code === "over_request_rate_limit" || code === "over_email_send_rate_limit") return new AuthError(429, "RATE_LIMITED", "Too many attempts. Try again in a few minutes.");
  if (code === "user_already_exists" || code === "email_exists") return new AuthError(409, "EMAIL_TAKEN", "That email already has an account. Try signing in.");
  if (code === "weak_password") return new AuthError(422, "WEAK_PASSWORD", "Choose a stronger password (at least 8 characters).");
  if (code === "email_not_confirmed") return new AuthError(403, "EMAIL_NOT_CONFIRMED", "Confirm your email first (check your inbox), then sign in.");
  if (status === 400 || status === 401 || status === 422) return new AuthError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  return new AuthError(502, "AUTH_FAILED", "The account service had a problem. Try again.");
}

export interface SignUpResult {
  user: AuthUser;
  /** Null when the project requires email confirmation before the first sign-in. */
  tokens: AuthTokens | null;
}

export async function signUp(email: string, password: string, env: Env = process.env, f: Fetch = fetch): Promise<SignUpResult> {
  const { status, body } = await call(env, f, "/auth/v1/signup", { body: JSON.stringify({ email, password }) });
  if (status >= 400) throw failure(status, body);
  // With confirmation off Supabase returns a session (user nested); with it on it returns the user only.
  const raw = body as RawSession & RawUser;
  const user = toUser(raw.user ?? raw);
  if (!user) throw new AuthError(502, "AUTH_FAILED", "The account service had a problem. Try again.");
  return { user, tokens: toTokens(raw) };
}

export async function signIn(email: string, password: string, env: Env = process.env, f: Fetch = fetch): Promise<{ user: AuthUser; tokens: AuthTokens }> {
  const { status, body } = await call(env, f, "/auth/v1/token?grant_type=password", { body: JSON.stringify({ email, password }) });
  if (status >= 400) throw failure(status, body);
  const raw = body as RawSession;
  const user = toUser(raw.user);
  const tokens = toTokens(raw);
  if (!user || !tokens) throw new AuthError(502, "AUTH_FAILED", "The account service had a problem. Try again.");
  return { user, tokens };
}

export async function refreshSession(refreshToken: string, env: Env = process.env, f: Fetch = fetch): Promise<{ user: AuthUser; tokens: AuthTokens } | null> {
  try {
    const { status, body } = await call(env, f, "/auth/v1/token?grant_type=refresh_token", { body: JSON.stringify({ refresh_token: refreshToken }) });
    if (status >= 400) return null;
    const raw = body as RawSession;
    const user = toUser(raw.user);
    const tokens = toTokens(raw);
    return user && tokens ? { user, tokens } : null;
  } catch {
    return null;
  }
}

/** Verifies an access token with Supabase itself (signature, expiry, revocation). The caller never trusts a client-sent user id. */
export async function getUserFromToken(accessToken: string, env: Env = process.env, f: Fetch = fetch): Promise<AuthUser | null> {
  if (!accessToken) return null;
  try {
    const { status, body } = await call(env, f, "/auth/v1/user", { method: "GET", bearer: accessToken });
    return status === 200 ? toUser(body as RawUser) : null;
  } catch {
    return null;
  }
}

export async function signOut(accessToken: string, env: Env = process.env, f: Fetch = fetch): Promise<void> {
  try {
    await call(env, f, "/auth/v1/logout", { bearer: accessToken });
  } catch {
    // Cookies are cleared regardless; a failed revoke only leaves a short-lived token.
  }
}
