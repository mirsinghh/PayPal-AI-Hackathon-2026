import { modelLabel, summaryRows } from "@/lib/v4/provider";
import type { NegotiationSession } from "@/shared/contracts/types";

/**
 * Secondary, collapsed "Technical summary" of a live run: provider, models, calls, tokens, 429s, fallbacks, rejected
 * proposals, time and why it ended. Every figure is counted by the engine or reported by the provider; a value the
 * provider did not return (e.g. reasoning tokens) is simply not shown.
 */
export function RunSummary({ session }: { session: Pick<NegotiationSession, "agentRun" | "evaluation" | "mode"> }) {
  if (session.mode !== "multi_agent" || !session.agentRun) return null;
  const run = session.agentRun;
  const rows = summaryRows(run, session);
  const roles = run.roles ? Object.entries(run.roles).filter(([, v]) => v.attempts > 0) : [];
  return (
    <details className="v3-card p-5">
      <summary className="flex min-h-9 cursor-pointer items-center font-v3-head text-lg font-extrabold">Technical summary</summary>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-v3-ink2">{r.label}</dt>
            <dd className="v3-num text-right font-semibold">{r.value}</dd>
          </div>
        ))}
      </dl>
      {roles.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[18rem] text-left text-xs">
            <caption className="sr-only">Calls and tokens per agent role</caption>
            <thead className="text-v3-ink2">
              <tr>
                <th scope="col" className="py-1 pr-2">Role</th>
                <th scope="col" className="py-1 pr-2">Model</th>
                <th scope="col" className="py-1 pr-2">OK / tries</th>
                <th scope="col" className="py-1 pr-2">429</th>
                <th scope="col" className="py-1">Tokens in/out</th>
              </tr>
            </thead>
            <tbody className="v3-num">
              {roles.map(([name, v]) => (
                <tr key={name} className="border-t border-v3-line">
                  <th scope="row" className="py-1.5 pr-2 font-bold capitalize">{name}</th>
                  <td className="py-1.5 pr-2">{v.models.map(modelLabel).join(", ") || "—"}</td>
                  <td className="py-1.5 pr-2">{v.succeeded}/{v.attempts}</td>
                  <td className="py-1.5 pr-2">{v.http429}</td>
                  <td className="py-1.5">{v.inputTokens}/{v.outputTokens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-v3-ink2">Counted by the engine or reported by the provider. Private model reasoning is never stored or shown.</p>
    </details>
  );
}
