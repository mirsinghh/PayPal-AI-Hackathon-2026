// Creates (or resets) ONE confirmed demo account in Supabase Auth, using the Admin API.
// Credentials come from the environment, so nothing secret is ever written to the repo:
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DEMO_USER_EMAIL=... DEMO_USER_PASSWORD=... node scripts/create-demo-user.mjs
//
// The password goes to Supabase Auth over HTTPS, which hashes it. This app never stores or logs it.
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_USER_EMAIL, DEMO_USER_PASSWORD } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !DEMO_USER_EMAIL || !DEMO_USER_PASSWORD) {
  console.error("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_USER_EMAIL and DEMO_USER_PASSWORD (min. 8 chars).");
  process.exit(1);
}
const base = SUPABASE_URL.replace(/\/$/, "") + "/auth/v1/admin/users";
const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" };

const created = await fetch(base, { method: "POST", headers, body: JSON.stringify({ email: DEMO_USER_EMAIL, password: DEMO_USER_PASSWORD, email_confirm: true }) });
if (created.ok) {
  console.log(`Demo user created and confirmed: ${DEMO_USER_EMAIL}`);
} else {
  const body = await created.json().catch(() => ({}));
  if (body.error_code === "email_exists" || body.error_code === "user_already_exists") {
    console.log(`Demo user already exists: ${DEMO_USER_EMAIL} (nothing changed).`);
  } else {
    console.error(`Could not create the demo user (HTTP ${created.status}): ${body.msg ?? body.error_description ?? "unknown error"}`);
    process.exit(1);
  }
}
