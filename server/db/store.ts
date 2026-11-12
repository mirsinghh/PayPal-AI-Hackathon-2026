import { promises as fs } from "node:fs";
import path from "node:path";
import type { NegotiationSession, PaymentAttempt, PaymentMethodAuth, PurchaseMandate } from "@/shared/contracts/types";
import { LEGACY_PAYMENT_COLUMNS, LEGACY_SESSION_COLUMNS, paymentRow, sessionRow } from "./summary";

/**
 * Persistence behind a small interface with two backends:
 *  - Supabase (Postgres over its REST API) when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set. Used in production.
 *  - JSON files under .data/ for local development and tests.
 * Vercel has a read-only filesystem, so it refuses to start without Supabase instead of failing later.
 */
const ROOT = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

type FileKind = "sessions" | "payments" | DocKind;
function file(kind: FileKind, id: string): string {
  if (!SAFE_ID.test(id)) throw new Error("invalid_id");
  return path.join(ROOT, kind, `${id}.json`);
}

async function readJson<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(p, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

async function writeJson(p: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  // On Windows, antivirus/indexers can briefly lock the file and make rename fail with EPERM/EBUSY.
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, p);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (attempt >= 5 || !["EPERM", "EBUSY", "EACCES"].includes(code ?? "")) {
        await fs.rm(tmp, { force: true });
        throw e;
      }
      await new Promise((r) => setTimeout(r, 20 * (attempt + 1)));
    }
  }
}

type Backend = {
  getSession(id: string): Promise<NegotiationSession | null>;
  saveSession(s: NegotiationSession): Promise<void>;
  savePayment(p: PaymentAttempt): Promise<void>;
  paymentsBySession(sessionId: string): Promise<PaymentAttempt[]>;
  paymentByOrderId(orderId: string): Promise<PaymentAttempt | null>;
  /** V5 Auto-Buy documents (mandates, payment-method authorisations). */
  getDoc<T>(kind: DocKind, id: string): Promise<T | null>;
  saveDoc(kind: DocKind, doc: DocRow): Promise<void>;
  listDocs<T>(kind: DocKind, ownerId: string): Promise<T[]>;
  /** Atomic compare-and-set on `status`: writes `doc` only if the stored status is still `expected`. Returns whether it won. */
  casDoc(kind: DocKind, expected: string, doc: DocRow): Promise<boolean>;
};

/** Kinds of V5 Auto-Buy documents. Each has its own table (supabase/schema.sql) or folder (.data/). */
export type DocKind = "mandates" | "payment_methods";
export interface DocRow {
  id: string;
  ownerId: string;
  sessionId?: string | null;
  status: string;
  data: unknown;
  updatedAt: string;
}
const TABLE: Record<DocKind, string> = { mandates: "purchase_mandates", payment_methods: "payment_methods" };

const fileBackend: Backend = {
  async getSession(id) {
    return readJson<NegotiationSession>(file("sessions", id));
  },
  async saveSession(s) {
    await writeJson(file("sessions", s.sessionId), s);
  },
  async savePayment(p) {
    await writeJson(file("payments", p.paymentAttemptId), p);
  },
  async paymentsBySession(sessionId) {
    return (await listPayments()).filter((p) => p.sessionId === sessionId);
  },
  async paymentByOrderId(orderId) {
    return (await listPayments()).find((p) => p.paypalOrderId === orderId) ?? null;
  },
  async getDoc<T>(kind: DocKind, id: string) {
    const row = await readJson<DocRow>(file(kind, id));
    return row ? (row.data as T) : null;
  },
  async saveDoc(kind, doc) {
    await writeJson(file(kind, doc.id), doc);
  },
  async listDocs<T>(kind: DocKind, ownerId: string) {
    // Literal folder names (not `kind`) so the bundler does not trace the whole project for this dynamic path.
    const dir = kind === "mandates" ? path.join(ROOT, "mandates") : path.join(ROOT, "payment_methods");
    let names: string[] = [];
    try {
      names = await fs.readdir(dir);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
    const rows = await Promise.all(names.filter((n) => n.endsWith(".json")).map((n) => readJson<DocRow>(path.join(dir, n))));
    return rows.filter((r): r is DocRow => r !== null && r.ownerId === ownerId).map((r) => r.data as T);
  },
  async casDoc(kind, expected, doc) {
    // One process: serialise read-check-write per document so two callers can never both win. (Supabase does this in SQL.)
    return withLock(`cas:${kind}:${doc.id}`, async () => {
      const current = await readJson<DocRow>(file(kind, doc.id));
      if (!current || current.status !== expected) return false;
      await writeJson(file(kind, doc.id), doc);
      return true;
    });
  },
};

async function listPayments(): Promise<PaymentAttempt[]> {
  let names: string[] = [];
  try {
    names = await fs.readdir(path.join(ROOT, "payments"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const all = await Promise.all(
    names.filter((n) => n.endsWith(".json")).map((n) => readJson<PaymentAttempt>(path.join(ROOT, "payments", n))),
  );
  return all.filter((p): p is PaymentAttempt => p !== null);
}

/** Supabase through PostgREST with the server-only secret key. No SDK, no key ever reaches the browser. */
function supabaseBackend(url: string, key: string): Backend {
  const base = url.replace(/\/$/, "") + "/rest/v1";
  const headers: Record<string, string> = { apikey: key, "content-type": "application/json" };
  // Legacy service_role keys are JWTs and also need the bearer header; new sb_secret_ keys must not send it.
  if (key.startsWith("eyJ")) headers.authorization = `Bearer ${key}`;

  async function sb(pathAndQuery: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(base + pathAndQuery, {
      ...init,
      headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`supabase_${res.status}`);
    return res;
  }
  const post = (table: string, row: Record<string, unknown>) =>
    sb(`/${table}?on_conflict=id`, {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(row),
    });
  // If the V5 migration (extra columns) hasn't been applied yet, PostgREST answers 400: retry with the original columns so
  // negotiations and payments keep working (history just stays empty until the migration is run).
  const upsert = async (table: string, row: Record<string, unknown>, legacy: readonly string[]) => {
    try {
      return await post(table, row);
    } catch (e) {
      if ((e as Error).message !== "supabase_400") throw e;
      return post(table, Object.fromEntries(Object.entries(row).filter(([k]) => legacy.includes(k))));
    }
  };
  const selectData = async <T>(table: string, filter: string): Promise<T[]> => {
    const rows = (await (await sb(`/${table}?${filter}&select=data`)).json()) as { data: T }[];
    return rows.map((r) => r.data);
  };
  const enc = encodeURIComponent;

  return {
    async getSession(id) {
      return (await selectData<NegotiationSession>("sessions", `id=eq.${enc(id)}&limit=1`))[0] ?? null;
    },
    async saveSession(s) {
      await upsert("sessions", sessionRow(s), LEGACY_SESSION_COLUMNS);
    },
    async savePayment(p) {
      await upsert("payments", paymentRow(p), LEGACY_PAYMENT_COLUMNS);
    },
    async paymentsBySession(sessionId) {
      return selectData<PaymentAttempt>("payments", `session_id=eq.${enc(sessionId)}`);
    },
    async paymentByOrderId(orderId) {
      return (await selectData<PaymentAttempt>("payments", `paypal_order_id=eq.${enc(orderId)}&limit=1`))[0] ?? null;
    },
    async getDoc<T>(kind: DocKind, id: string) {
      return (await selectData<T>(TABLE[kind], `id=eq.${enc(id)}&limit=1`))[0] ?? null;
    },
    async saveDoc(kind, doc) {
      await post(TABLE[kind], docRow(doc));
    },
    async listDocs<T>(kind: DocKind, ownerId: string) {
      return selectData<T>(TABLE[kind], `user_id=eq.${enc(ownerId)}&order=updated_at.desc&limit=200`);
    },
    async casDoc(kind, expected, doc) {
      // One conditional UPDATE: Postgres applies it atomically, so two instances can never both move the row out of `expected`.
      const res = await sb(`/${TABLE[kind]}?id=eq.${enc(doc.id)}&status=eq.${enc(expected)}`, {
        method: "PATCH",
        headers: { prefer: "return=representation" },
        body: JSON.stringify({ status: doc.status, data: doc.data, updated_at: doc.updatedAt }),
      });
      return ((await res.json()) as unknown[]).length === 1;
    },
  };
}

const docRow = (d: DocRow): Record<string, unknown> => ({ id: d.id, user_id: d.ownerId, session_id: d.sessionId ?? null, status: d.status, data: d.data, updated_at: d.updatedAt });

let backend: Backend | undefined;
function db(): Backend {
  if (backend) return backend;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) return (backend = supabaseBackend(url, key));
  if (process.env.VERCEL) throw new Error("storage_not_configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  return (backend = fileBackend);
}

export async function getSession(id: string): Promise<NegotiationSession | null> {
  if (!SAFE_ID.test(id)) return null;
  return db().getSession(id);
}

export async function saveSession(s: NegotiationSession): Promise<void> {
  if (!SAFE_ID.test(s.sessionId)) throw new Error("invalid_id");
  await db().saveSession(s);
}

export async function savePayment(p: PaymentAttempt): Promise<void> {
  if (!SAFE_ID.test(p.paymentAttemptId)) throw new Error("invalid_id");
  await db().savePayment(p);
}

export async function getPaymentsBySession(sessionId: string): Promise<PaymentAttempt[]> {
  return db().paymentsBySession(sessionId);
}

export async function getPaymentByOrderId(orderId: string): Promise<PaymentAttempt | null> {
  return db().paymentByOrderId(orderId);
}

/* ---------- V5 Auto-Buy documents ---------- */

const mandateDoc = (m: PurchaseMandate): DocRow => ({ id: m.mandateId, ownerId: m.ownerId, sessionId: m.sessionId, status: m.status, data: m, updatedAt: m.updatedAt });
const methodDoc = (m: PaymentMethodAuth): DocRow => ({ id: m.methodId, ownerId: m.ownerId, status: m.status, data: m, updatedAt: m.updatedAt });

export async function getMandate(id: string): Promise<PurchaseMandate | null> {
  if (!SAFE_ID.test(id)) return null;
  return db().getDoc<PurchaseMandate>("mandates", id);
}
export async function saveMandate(m: PurchaseMandate): Promise<void> {
  if (!SAFE_ID.test(m.mandateId)) throw new Error("invalid_id");
  await db().saveDoc("mandates", mandateDoc(m));
}
export async function listMandatesByOwner(ownerId: string): Promise<PurchaseMandate[]> {
  return db().listDocs<PurchaseMandate>("mandates", ownerId);
}
/** Moves a mandate from `expected` to `next.status` only if nobody else did first. This is what makes "one purchase per mandate" hold across instances. */
export async function casMandate(expected: PurchaseMandate["status"], next: PurchaseMandate): Promise<boolean> {
  return db().casDoc("mandates", expected, mandateDoc(next));
}

export async function getPaymentMethod(id: string): Promise<PaymentMethodAuth | null> {
  if (!SAFE_ID.test(id)) return null;
  return db().getDoc<PaymentMethodAuth>("payment_methods", id);
}
export async function savePaymentMethod(m: PaymentMethodAuth): Promise<void> {
  if (!SAFE_ID.test(m.methodId)) throw new Error("invalid_id");
  await db().saveDoc("payment_methods", methodDoc(m));
}
export async function listPaymentMethodsByOwner(ownerId: string): Promise<PaymentMethodAuth[]> {
  return db().listDocs<PaymentMethodAuth>("payment_methods", ownerId);
}

/** In-process mutex per key so a double-click cannot run two captures/creates at once. */
const locks = new Map<string, Promise<unknown>>();
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => undefined);
  locks.set(key, tail);
  try {
    return await run;
  } finally {
    if (locks.get(key) === tail) locks.delete(key);
  }
}
