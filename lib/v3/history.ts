/**
 * "My activity": a LOCAL demo history.
 *
 * There are no accounts and the server has no per-user index, so the only honest scope is a list of session ids this
 * browser created, kept in localStorage. Details are fetched on demand from the existing GET /api/negotiations/[id]
 * (which needs the session id). There is deliberately no endpoint that lists sessions or payments, so nothing here can
 * expose anybody else's data. Limits, stated in the UI: this list lives only in this browser; sessions expire on the
 * server after 24 h; clearing site data removes the list.
 */
export interface HistoryEntry {
  sessionId: string;
  createdAt: string;
  query: string;
  budgetCents: number;
}

export const HISTORY_KEY = "agentdeal.v3.history";
export const HISTORY_EVENT = "agentdeal:history";
export const MAX_HISTORY = 20;

const ID_RE = /^ses_[A-Za-z0-9_-]{1,80}$/;

/** Parses whatever is in storage defensively: corrupt or tampered data yields fewer entries, never an exception. */
export function parseHistory(raw: string | null): HistoryEntry[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const out: HistoryEntry[] = [];
  for (const x of data) {
    if (!x || typeof x !== "object") continue;
    const e = x as Record<string, unknown>;
    if (typeof e.sessionId !== "string" || !ID_RE.test(e.sessionId) || seen.has(e.sessionId)) continue;
    if (typeof e.createdAt !== "string" || Number.isNaN(Date.parse(e.createdAt))) continue;
    if (typeof e.query !== "string" || typeof e.budgetCents !== "number" || !Number.isSafeInteger(e.budgetCents) || e.budgetCents <= 0) continue;
    seen.add(e.sessionId);
    out.push({ sessionId: e.sessionId, createdAt: e.createdAt, query: e.query.slice(0, 120), budgetCents: e.budgetCents });
  }
  return out.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, MAX_HISTORY);
}

export function withEntry(list: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return parseHistory(JSON.stringify([entry, ...list.filter((e) => e.sessionId !== entry.sessionId)]));
}

/* ---- thin browser wrapper: every access is guarded (private windows, blocked storage, SSR) ---- */
export function readHistoryRaw(): string | null {
  try {
    return window.localStorage.getItem(HISTORY_KEY);
  } catch {
    return null;
  }
}

function write(list: HistoryEntry[]): void {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(HISTORY_EVENT));
  } catch {
    /* storage unavailable: the app works the same, there is just no local history */
  }
}

export function rememberNegotiation(entry: HistoryEntry): void {
  write(withEntry(parseHistory(readHistoryRaw()), entry));
}
export function forgetNegotiation(sessionId: string): void {
  write(parseHistory(readHistoryRaw()).filter((e) => e.sessionId !== sessionId));
}
export function clearHistory(): void {
  write([]);
}

export function subscribeHistory(cb: () => void): () => void {
  window.addEventListener(HISTORY_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(HISTORY_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
