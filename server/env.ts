/**
 * Deployment checks for the public demo (Vercel). Pure: reads only the env object it is given and never returns a value.
 * Names are exactly the ones the code reads (see AgentDeal_DOCS/V5/VERCEL_DEPLOYMENT.md). Run it with `npm run check:env`.
 *
 *   error  the deployment cannot work or would be unsafe
 *   warn   it works, but something the demo promises will be missing or degraded
 */
export interface EnvIssue {
  level: "error" | "warn";
  name: string;
  message: string;
}

type Env = Record<string, string | undefined>;

/** A value that is set and is not an .env.example placeholder. */
export const isSet = (v: string | undefined): boolean => !!v && v.trim().length > 0 && !/^(your-|changeme|xxx)/i.test(v.trim());

const SECRET_NAME = /(KEY|SECRET|TOKEN|PASSWORD)/i;

export function validateDeploymentEnv(env: Env = process.env, opts: { vercel?: boolean } = {}): { ok: boolean; issues: EnvIssue[] } {
  const vercel = opts.vercel ?? !!env.VERCEL;
  const issues: EnvIssue[] = [];
  const add = (level: EnvIssue["level"], name: string, message: string) => issues.push({ level, name, message });

  // Persistence: Vercel has a read-only filesystem, so Supabase is mandatory there.
  for (const n of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!isSet(env[n])) add(vercel ? "error" : "warn", n, vercel ? "Required on Vercel: negotiations and payments cannot be stored without it." : "Not set: local JSON files are used and accounts are disabled.");
  }

  // Payments: Sandbox only, never real money.
  if (env.PAYPAL_ENV !== "sandbox") add("error", "PAYPAL_ENV", 'Must be exactly "sandbox". The app refuses every payment otherwise.');
  for (const n of ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"]) if (!isSet(env[n])) add("error", n, "Required: PayPal Sandbox checkout cannot start without it.");

  // AI: optional by design. Without it Server Rules still run everything.
  const provider = (env.AI_PROVIDER ?? "gemini").trim().toLowerCase();
  if (!["groq", "gemini", "rules"].includes(provider)) add("warn", "AI_PROVIDER", `"${env.AI_PROVIDER}" is not groq, gemini or rules: the default (gemini) is used.`);
  if (provider === "groq" && !isSet(env.GROQ_API_KEY)) add("warn", "GROQ_API_KEY", "AI_PROVIDER=groq but no key: AI Agents is unavailable and the UI shows it. Server Rules keep working.");
  if (provider === "gemini" && !isSet(env.AI_API_KEY)) add("warn", "AI_API_KEY", "AI_PROVIDER is gemini (the default) but no key: AI Agents is unavailable. Server Rules keep working.");
  for (const n of ["ANALYSIS_PROVIDER", "NEGOTIATION_PROVIDER"]) {
    const v = env[n]?.trim().toLowerCase();
    if (v && !["groq", "gemini", "rules"].includes(v)) add("warn", n, `"${env[n]}" is not groq, gemini or rules: AI_PROVIDER is used instead.`);
  }

  // Time budget: the negotiation route is limited to 60 s on Vercel and the run continues inside it.
  const deadline = Number(env.MULTI_AGENT_DEADLINE_MS);
  if (vercel && Number.isFinite(deadline) && deadline > 40_000) add("warn", "MULTI_AGENT_DEADLINE_MS", "Above 40000: the server caps it at 40000 on Vercel because the function is limited to 60 s.");

  // Secrets must never reach the browser bundle.
  for (const name of Object.keys(env)) {
    if (name.startsWith("NEXT_PUBLIC_") && SECRET_NAME.test(name)) add("error", name, "A NEXT_PUBLIC_ variable is shipped to every browser. Never put a secret in one.");
  }

  if (vercel && (!isSet(env.APP_BASE_URL) || /localhost|127\.0\.0\.1/.test(env.APP_BASE_URL ?? ""))) add("warn", "APP_BASE_URL", "Set it to the public https URL (only Agent Auto-Buy uses it, for PayPal's return page).");
  if (vercel && !isSet(env.AUTOBUY_ENCRYPTION_KEY)) add("warn", "AUTOBUY_ENCRYPTION_KEY", "Not set: Agent Auto-Buy stays unavailable in production (Manual Checkout is unaffected).");

  return { ok: !issues.some((i) => i.level === "error"), issues };
}
