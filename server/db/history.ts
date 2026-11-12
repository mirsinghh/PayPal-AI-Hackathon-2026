/**
 * The signed-in user's history, read through Supabase PostgREST with THEIR OWN access token and the public anon key.
 * Row Level Security (supabase/schema.sql) therefore decides what is visible: a user can only ever read rows whose
 * user_id is their own. The explicit user_id filter is a second, redundant guard.
 */
export interface HistorySession {
  id: string;
  createdAt: string;
  productQuery: string | null;
  budgetCents: number | null;
  priority: string | null;
  status: string | null;
  responseMode: "server" | "ai" | null;
  /** What actually ran: "multi_agent" (AI) or "v0_rules" (server rules, possibly as a fallback). */
  engineMode: string | null;
  fallbackReason: string | null;
  analysisSource: string | null;
  analysisProvider: string | null;
  analysisModel: string | null;
  analysisSummary: string | null;
  offerCount: number | null;
  winnerSeller: string | null;
  winnerProduct: string | null;
  initialPriceCents: number | null;
  finalPriceCents: number | null;
  savingsCents: number | null;
  approvedOfferId: string | null;
}

export interface HistoryPayment {
  id: string;
  sessionId: string;
  paypalOrderId: string | null;
  status: string | null;
  amountCents: number | null;
  currency: string | null;
  createdAt: string;
}

export interface History {
  sessions: HistorySession[];
  payments: HistoryPayment[];
}

type Env = Record<string, string | undefined>;
type Fetch = typeof fetch;

const SESSION_COLS =
  "id,created_at,product_query,budget_cents,priority,status,response_mode,engine_mode,fallback_reason,analysis_source,analysis_provider,analysis_model,analysis_summary,offer_count,winner_seller,winner_product,initial_price_cents,final_price_cents,savings_cents,approved_offer_id";
const PAYMENT_COLS = "id,session_id,paypal_order_id,status,amount_cents,currency,created_at";

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : null);
const num = (v: unknown) => (typeof v === "number" ? v : null);

export function toHistorySession(r: Row): HistorySession {
  const rm = r.response_mode;
  return {
    id: String(r.id),
    createdAt: String(r.created_at ?? ""),
    productQuery: str(r.product_query),
    budgetCents: num(r.budget_cents),
    priority: str(r.priority),
    status: str(r.status),
    responseMode: rm === "server" || rm === "ai" ? rm : null,
    engineMode: str(r.engine_mode),
    fallbackReason: str(r.fallback_reason),
    analysisSource: str(r.analysis_source),
    analysisProvider: str(r.analysis_provider),
    analysisModel: str(r.analysis_model),
    analysisSummary: str(r.analysis_summary),
    offerCount: num(r.offer_count),
    winnerSeller: str(r.winner_seller),
    winnerProduct: str(r.winner_product),
    initialPriceCents: num(r.initial_price_cents),
    finalPriceCents: num(r.final_price_cents),
    savingsCents: num(r.savings_cents),
    approvedOfferId: str(r.approved_offer_id),
  };
}

export function toHistoryPayment(r: Row): HistoryPayment {
  return {
    id: String(r.id),
    sessionId: String(r.session_id),
    paypalOrderId: str(r.paypal_order_id),
    status: str(r.status),
    amountCents: num(r.amount_cents),
    currency: str(r.currency),
    createdAt: String(r.created_at ?? ""),
  };
}

export async function loadHistory(userId: string, accessToken: string, env: Env = process.env, f: Fetch = fetch): Promise<History> {
  const url = env.SUPABASE_URL?.replace(/\/$/, "");
  const anon = env.SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("history_unavailable");
  const headers = { apikey: anon, authorization: `Bearer ${accessToken}` };
  const get = async (path: string): Promise<Row[]> => {
    const res = await f(`${url}/rest/v1/${path}`, { headers, signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (!res.ok) throw new Error(`history_${res.status}`);
    return (await res.json()) as Row[];
  };
  const uid = encodeURIComponent(userId);
  const [sessions, payments] = await Promise.all([
    get(`sessions?select=${SESSION_COLS}&user_id=eq.${uid}&order=created_at.desc&limit=100`),
    get(`payments?select=${PAYMENT_COLS}&user_id=eq.${uid}&order=created_at.desc&limit=200`),
  ]);
  return { sessions: sessions.map(toHistorySession), payments: payments.map(toHistoryPayment) };
}
