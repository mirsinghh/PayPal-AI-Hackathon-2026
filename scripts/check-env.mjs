// Checks the environment this process was started with against what the public demo needs.
//   npm run check:env                       (reads .env.local)
//   vercel env pull .env.vercel && node --env-file=.env.vercel scripts/check-env.mjs --vercel
// Prints variable NAMES and messages only, never values.
import { validateDeploymentEnv } from "../server/env.ts";

const vercel = process.argv.includes("--vercel") || !!process.env.VERCEL;
const { ok, issues } = validateDeploymentEnv(process.env, { vercel });
for (const i of issues) console.log(`${i.level === "error" ? "ERROR" : "warn "}  ${i.name}: ${i.message}`);
console.log(ok ? `\nOK${issues.length ? ` (${issues.length} warning${issues.length === 1 ? "" : "s"})` : ""}${vercel ? " for Vercel" : " for local use"}` : "\nNOT READY: fix the errors above");
process.exit(ok ? 0 : 1);
