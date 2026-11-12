import { describe, expect, it } from "vitest";
import { MAX_HISTORY, parseHistory, withEntry, type HistoryEntry } from "@/lib/v3/history";

const e = (n: number, over: Partial<HistoryEntry> = {}): HistoryEntry => ({ sessionId: `ses_${n}`, createdAt: new Date(2026, 10, 12, 10, n).toISOString(), query: `Item ${n}`, budgetCents: 10_000, ...over });

describe("local history (demo)", () => {
  it("keeps only well-formed entries and never throws on corrupt storage", () => {
    expect(parseHistory(null)).toEqual([]);
    expect(parseHistory("not json")).toEqual([]);
    expect(parseHistory('{"a":1}')).toEqual([]);
    const messy = JSON.stringify([e(1), { sessionId: "../etc/passwd", createdAt: "2026-01-01", query: "x", budgetCents: 1 }, { sessionId: "ses_2", createdAt: "garbage", query: "x", budgetCents: 100 }, { sessionId: "ses_3", createdAt: e(3).createdAt, query: "x", budgetCents: 1.5 }, null, 7, e(1)]);
    expect(parseHistory(messy).map((x) => x.sessionId)).toEqual(["ses_1"]);
  });

  it("orders newest first, deduplicates, and caps the list", () => {
    let list: HistoryEntry[] = [];
    for (let i = 1; i <= MAX_HISTORY + 5; i++) list = withEntry(list, e(i));
    expect(list).toHaveLength(MAX_HISTORY);
    expect(list[0].sessionId).toBe(`ses_${MAX_HISTORY + 5}`);
    const again = withEntry(list, e(MAX_HISTORY + 5, { query: "Renamed" }));
    expect(again.filter((x) => x.sessionId === `ses_${MAX_HISTORY + 5}`)).toHaveLength(1);
  });

  it("stores no secrets or payment data: only the id, time, request and budget", () => {
    expect(Object.keys(parseHistory(JSON.stringify([{ ...e(1), paypalOrderId: "X", token: "Y" }]))[0]).sort()).toEqual(["budgetCents", "createdAt", "query", "sessionId"]);
  });
});
