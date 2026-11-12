import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * PayPal payment tokens are encrypted at rest (AES-256-GCM) before they reach the database, and the ciphertext is bound
 * (as additional authenticated data) to the owner and the record id. A copy of a token cannot be moved onto another
 * user's record: decryption fails. Only server code ever calls `openToken`; the browser and the AI never see a token.
 */
type Env = Record<string, string | undefined>;

export function encryptionKey(env: Env = process.env): Buffer | null {
  const raw = env.AUTOBUY_ENCRYPTION_KEY;
  if (raw && !/^your-/i.test(raw)) {
    const k = Buffer.from(raw, /^[0-9a-f]{64}$/i.test(raw) ? "hex" : "base64");
    return k.length === 32 ? k : null;
  }
  // Local Sandbox convenience only: derive a key from the Sandbox client secret. Never in production.
  if (env.VERCEL || env.NODE_ENV === "production") return null;
  const secret = env.PAYPAL_CLIENT_SECRET;
  if (!secret || /^your-/i.test(secret)) return null;
  return Buffer.from(hkdfSync("sha256", secret, "agentdeal-autobuy-dev", "payment-token-key", 32));
}

const aad = (ownerId: string, methodId: string) => Buffer.from(`${ownerId}|${methodId}`);
const b64 = (b: Buffer) => b.toString("base64url");

export function sealToken(token: string, ownerId: string, methodId: string, env: Env = process.env): string {
  const key = encryptionKey(env);
  if (!key) throw new Error("encryption_key_missing");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(aad(ownerId, methodId));
  const ct = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return `v1.${b64(iv)}.${b64(c.getAuthTag())}.${b64(ct)}`;
}

export function openToken(sealed: string, ownerId: string, methodId: string, env: Env = process.env): string {
  const key = encryptionKey(env);
  if (!key) throw new Error("encryption_key_missing");
  const [v, iv, tag, ct] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("bad_token_format");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  d.setAAD(aad(ownerId, methodId));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}
